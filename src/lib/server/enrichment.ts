import { load as cheerioLoad } from 'cheerio';
import {
	SOCIAL_MEDIA_DOMAINS,
	AGGREGATOR_DOMAINS,
	isSocialMediaUrl,
	isAggregatorUrl,
	getSocialPlatform,
	assertPublicHttpUrl
} from './utils.js';
import { GOOGLE_PAGESPEED_API_KEY, YELP_API_KEY, GOOGLE_PLACES_API_KEY } from '$env/static/private';

const PAGESPEED_URL = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const YELP_SEARCH_URL = 'https://api.yelp.com/v3/businesses/search';
const DDG_SEARCH_URL = 'https://html.duckduckgo.com/html/';

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
// Adjacent independently-optional \s*/[\[(]? groups here used to cause catastrophic
// backtracking on ordinary long pages with no actual obfuscated email present (confirmed:
// 1.7s+ for a single .exec() on a 67KB real page, and it froze the whole dev server's event
// loop during a bulk run). Each "at"/"dot" marker is now a flat alternation of fully-formed
// variants instead, which removes the ambiguous empty-match partitioning that caused it.
const AT_MARKER = '(?:\\s+at\\s+|\\s*\\[at\\]\\s*|\\s*\\(at\\)\\s*)';
const DOT_MARKER = '(?:\\s+dot\\s+|\\s*\\[dot\\]\\s*|\\s*\\(dot\\)\\s*)';
const EMAIL_OBFUSCATED_RE = new RegExp(
	`([a-zA-Z0-9._%+-]+)${AT_MARKER}([a-zA-Z0-9.-]+)${DOT_MARKER}([a-zA-Z]{2,})\\b`,
	'gi'
);
const EMAIL_EXCLUDE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.pdf']);

// Platform telemetry pixels and unedited template boilerplate that look like real emails
// but aren't — e.g. Wix embeds a Sentry error-tracking address (random-hex local part,
// always @sentry-next.wixpress.com) in every site's client bundle, and cheap templates
// sometimes ship with a literal "user@domain.com" placeholder the business never replaced.
// Confirmed on real data: these two exact patterns showed up identically across 17
// completely unrelated leads, which is what surfaced this as a bug rather than real data.
const PLACEHOLDER_EMAIL_DOMAINS = new Set(['wixpress.com', 'domain.com', 'example.com', 'yourdomain.com', 'email.com']);

function isPlaceholderEmail(email: string): boolean {
	const domain = email.toLowerCase().split('@')[1] ?? '';
	return [...PLACEHOLDER_EMAIL_DOMAINS].some((d) => domain === d || domain.endsWith('.' + d));
}
const PHONE_RE = /\(?\d{3}\)?[\s\-\.]?\d{3}[\s\-\.]\d{4}/g;
const COPYRIGHT_RE = /(?:©|&copy;|Copyright\s*(?:©|&copy;)?\s*)(\d{4})/gi;
const CURRENT_YEAR = new Date().getFullYear();

const DIRECTORY_DOMAINS = new Set([
	'yelp.com',
	'yellowpages.com',
	'tripadvisor.com',
	'google.com',
	'bbb.org',
	'foursquare.com',
	'mapquest.com',
	'whitepages.com',
	'angi.com',
	'houzz.com',
	'thumbtack.com',
	...SOCIAL_MEDIA_DOMAINS,
	...AGGREGATOR_DOMAINS
]);

// Data-broker/people-search sites that only ever surface a *guessed* email format
// (e.g. "first.last@company.com") rather than a real observed address — worth skipping
// entirely for contact lookups, unlike genuine directories (Yellow Pages, BBB) which
// sometimes carry a business's real published email and are deliberately not excluded.
const DATA_BROKER_DOMAINS = new Set([
	'zoominfo.com',
	'rocketreach.co',
	'lusha.com',
	'apollo.io',
	'prospeo.io',
	'wiza.co',
	'seamless.ai',
	'kaspr.io',
	'cognism.com',
	'uplead.com',
	'leadiq.com',
	'clearbit.com'
]);

const BOT_UA = 'Mozilla/5.0 (compatible; LeadGenBot/1.0)';

function withTimeout(ms: number): AbortSignal {
	return AbortSignal.timeout(ms);
}

/**
 * fetch() wrapper for URLs sourced from lead data (user-supplied or search-discovered).
 * Validates the target isn't a private/internal address before each request, and
 * resolves redirects manually so a redirect can't be used to reach an internal target
 * after the initial URL passed validation.
 */
async function fetchSsrfSafe(
	url: string,
	init: { method?: string; headers?: Record<string, string>; body?: BodyInit; signal?: AbortSignal } = {},
	maxRedirects = 5
): Promise<{ response: Response; finalUrl: string }> {
	let target = url;
	for (let hop = 0; hop <= maxRedirects; hop++) {
		await assertPublicHttpUrl(target);
		const resp = await fetch(target, { ...init, redirect: 'manual' });
		if (resp.status >= 300 && resp.status < 400) {
			const location = resp.headers.get('location');
			if (!location) return { response: resp, finalUrl: target };
			target = new URL(location, target).href;
			continue;
		}
		return { response: resp, finalUrl: target };
	}
	throw new Error('Too many redirects');
}

export async function fetchPagespeed(url: string): Promise<Record<string, unknown>> {
	const params = new URLSearchParams({ url, strategy: 'mobile' });
	for (const cat of ['performance', 'seo', 'best-practices', 'accessibility']) {
		params.append('category', cat);
	}
	if (GOOGLE_PAGESPEED_API_KEY) params.append('key', GOOGLE_PAGESPEED_API_KEY);

	const nullResult = {
		pagespeed_mobile: null,
		pagespeed_desktop: null,
		mobile_friendly: null,
		website_screenshot: null,
		pagespeed_seo: null,
		pagespeed_best_practices: null
	};

	try {
		const resp = await fetch(`${PAGESPEED_URL}?${params}`, { signal: withTimeout(15_000) });

		if (!resp.ok) return nullResult;

		const data = await resp.json();

		const lhr = data.lighthouseResult ?? {};
		const categories = lhr.categories ?? {};

		const score = (cat: string): number | null => {
			const s = categories[cat]?.score;
			return s != null ? Math.round(s * 100) : null;
		};

		const audits = lhr.audits ?? {};
		const mobileFriendly = audits.viewport?.score === 1;
		const screenshot = audits['final-screenshot']?.details?.data ?? null;

		return {
			pagespeed_mobile: score('performance'),
			pagespeed_desktop: null,
			mobile_friendly: mobileFriendly,
			website_screenshot: screenshot,
			pagespeed_seo: score('seo'),
			pagespeed_best_practices: score('best-practices')
		};
	} catch {
		return nullResult;
	}
}

export function diceCoefficient(a: string, b: string): number {
	if (a.length < 2 || b.length < 2) return 0;
	const bigrams = (s: string): Map<string, number> => {
		const map = new Map<string, number>();
		for (let i = 0; i < s.length - 1; i++) {
			const bg = s.slice(i, i + 2);
			map.set(bg, (map.get(bg) ?? 0) + 1);
		}
		return map;
	};
	const aBigrams = bigrams(a);
	const bBigrams = bigrams(b);
	let intersection = 0;
	for (const [bg, count] of aBigrams) {
		intersection += Math.min(count, bBigrams.get(bg) ?? 0);
	}
	return (2 * intersection) / (a.length - 1 + (b.length - 1));
}

export async function fetchYelp(
	businessName: string,
	address: string,
	phone = ''
): Promise<Record<string, unknown>> {
	if (!YELP_API_KEY) return { also_on_yelp: null, yelp_url: null };

	try {
		const params = new URLSearchParams({ term: businessName, location: address, limit: '3' });
		const resp = await fetch(`${YELP_SEARCH_URL}?${params}`, {
			headers: { Authorization: `Bearer ${YELP_API_KEY}` },
			signal: withTimeout(8_000)
		});
		if (!resp.ok) return { also_on_yelp: null, yelp_url: null };

		const data = await resp.json();
		const businesses: Array<Record<string, unknown>> = data.businesses ?? [];
		if (!businesses.length) return { also_on_yelp: false, yelp_url: null };

		const ourCity = address.includes(',')
			? address.split(',')[1].trim().toLowerCase()
			: address.toLowerCase();
		const ourDigits = phone.replace(/\D/g, '');

		for (const biz of businesses) {
			const yelpName = ((biz.name as string) ?? '').toLowerCase().trim();
			if (diceCoefficient(businessName.toLowerCase(), yelpName) < 0.5) continue;

			const yelpCity = ((biz.location as Record<string, string>)?.city ?? '').toLowerCase().trim();
			if (yelpCity && ourCity && !yelpCity.includes(ourCity) && !ourCity.includes(yelpCity)) continue;

			const yelpDigits = ((biz.phone as string) ?? '').replace(/\D/g, '');
			if (ourDigits && yelpDigits && ourDigits !== yelpDigits) continue;

			return { also_on_yelp: true, yelp_url: biz.url };
		}

		return { also_on_yelp: false, yelp_url: null };
	} catch {
		return { also_on_yelp: null, yelp_url: null };
	}
}

export async function discoverWebsite(
	businessName: string,
	address: string
): Promise<{ websiteUrl: string | null; discoveredSocial: Record<string, string> }> {
	const city = address.includes(',') ? address.split(',')[1].trim() : address;
	const query = `"${businessName}" "${city}"`;
	const discoveredSocial: Record<string, string> = {};

	try {
		const resp = await fetch(DDG_SEARCH_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'User-Agent': BOT_UA
			},
			body: new URLSearchParams({ q: query, b: '' }),
			signal: withTimeout(8_000)
		});
		if (!resp.ok) return { websiteUrl: null, discoveredSocial };

		const html = await resp.text();
		const $ = cheerioLoad(html);

		for (const el of $('a.result__url, a.result__a').toArray()) {
			let href = $(el).attr('href') ?? '';
			if (!href || href.startsWith('//duckduckgo')) continue;
			if (!href.startsWith('http')) href = 'https://' + href.replace(/^\/+/, '');

			let domain: string;
			try {
				domain = new URL(href).hostname.toLowerCase().replace(/^www\./, '');
			} catch {
				continue;
			}

			if ([...DIRECTORY_DOMAINS].some((d) => domain === d || domain.endsWith('.' + d))) continue;

			if (isSocialMediaUrl(href)) {
				const platform = getSocialPlatform(href);
				if (platform && !discoveredSocial[platform]) discoveredSocial[platform] = href;
				continue;
			}

			return { websiteUrl: href, discoveredSocial };
		}
	} catch {
		// ignore
	}
	return { websiteUrl: null, discoveredSocial };
}

// Recursively walk a JSON-LD object graph (schema.org LocalBusiness/Organization/ContactPoint
// commonly nest email/telephone a level or two deep) looking for contact fields.
function walkJsonLdContact(node: unknown, found: { email: string | null; phone: string | null }): void {
	if (!node || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (const item of node) walkJsonLdContact(item, found);
		return;
	}
	const obj = node as Record<string, unknown>;
	if (!found.email && typeof obj.email === 'string') {
		const candidate = obj.email.replace(/^mailto:/i, '').trim();
		EMAIL_RE.lastIndex = 0;
		if (EMAIL_RE.test(candidate) && !isPlaceholderEmail(candidate)) found.email = candidate;
	}
	if (!found.phone && typeof obj.telephone === 'string' && obj.telephone.replace(/\D/g, '').length >= 10) {
		found.phone = obj.telephone.trim();
	}
	for (const value of Object.values(obj)) {
		if (value && typeof value === 'object') walkJsonLdContact(value, found);
	}
}

function extractJsonLdContact($: ReturnType<typeof cheerioLoad>): { email: string | null; phone: string | null } {
	const found = { email: null as string | null, phone: null as string | null };
	$('script[type="application/ld+json"]').each((_, el) => {
		if (found.email && found.phone) return;
		try {
			const parsed = JSON.parse($(el).contents().text());
			walkJsonLdContact(parsed, found);
		} catch {
			// malformed JSON-LD — ignore
		}
	});
	return found;
}

// Reverses Cloudflare's "Email Address Obfuscation" feature (on by default on many
// shared-hosting/security-plugin WordPress sites): the real address never appears in the
// raw HTML at all, replaced by a "[email protected]" placeholder plus this encoded span,
// decoded client-side by Cloudflare's own JS using this same XOR-with-first-byte algorithm.
function decodeCfEmail(encoded: string): string | null {
	try {
		const key = parseInt(encoded.substring(0, 2), 16);
		let email = '';
		for (let i = 2; i < encoded.length; i += 2) {
			email += String.fromCharCode(parseInt(encoded.substring(i, i + 2), 16) ^ key);
		}
		return email;
	} catch {
		return null;
	}
}

function extractContactInfo($: ReturnType<typeof cheerioLoad>): { email: string | null; phone: string | null } {
	let email: string | null = null;
	let phone: string | null = null;

	$('a[href]').each((_, el) => {
		const href = $(el).attr('href') ?? '';
		if (!email && href.startsWith('mailto:')) {
			const candidate = href.slice(7).split('?')[0].trim();
			EMAIL_RE.lastIndex = 0;
			if (EMAIL_RE.test(candidate) && !isPlaceholderEmail(candidate)) email = candidate;
		}
		if (!phone && href.startsWith('tel:')) {
			const candidate = href.slice(4).trim();
			if (candidate.replace(/\D/g, '').length >= 10) phone = candidate;
		}
	});

	if (!email) {
		// Check every obfuscated span, not just the first — a footer theme/plugin credit
		// link can also be Cloudflare-obfuscated and appear before the real contact email
		// in DOM order, so take the first one that actually decodes to a valid address.
		$('[data-cfemail]').each((_, el) => {
			if (email) return;
			const encoded = $(el).attr('data-cfemail');
			if (!encoded) return;
			const decoded = decodeCfEmail(encoded);
			if (!decoded) return;
			EMAIL_RE.lastIndex = 0;
			if (EMAIL_RE.test(decoded) && !isPlaceholderEmail(decoded)) email = decoded;
		});
	}

	if (!email || !phone) {
		const jsonLd = extractJsonLdContact($);
		if (!email && jsonLd.email) email = jsonLd.email;
		if (!phone && jsonLd.phone) phone = jsonLd.phone;
	}

	// Strip non-JSON-LD <script>/<style> content before scanning visible text — cheerio's
	// $.text() otherwise includes raw JS source (tracking/analytics config, e.g. Wix embeds
	// a Sentry error-reporting address in every site's client bundle), which can contain
	// email-shaped strings that were never a business's real contact info. JSON-LD extraction
	// above already ran, so it's safe to drop script content now.
	$('script:not([type="application/ld+json"]), style').remove();
	const text = $.text();
	if (!email) {
		EMAIL_RE.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = EMAIL_RE.exec(text)) !== null) {
			const candidate = match[0];
			const ext = candidate.toLowerCase().replace(/.*(\.[^.]+)$/, '$1');
			if (!EMAIL_EXCLUDE_EXTS.has(ext) && !isPlaceholderEmail(candidate)) {
				email = candidate;
				break;
			}
		}
	}
	if (!email) {
		// De-obfuscated fallback: "name [at] domain [dot] com" style anti-scraper text
		EMAIL_OBFUSCATED_RE.lastIndex = 0;
		const match = EMAIL_OBFUSCATED_RE.exec(text);
		if (match) {
			const candidate = `${match[1]}@${match[2]}.${match[3]}`.toLowerCase();
			if (!isPlaceholderEmail(candidate)) email = candidate;
		}
	}
	if (!phone) {
		PHONE_RE.lastIndex = 0;
		const match = PHONE_RE.exec(text);
		if (match) phone = match[0];
	}

	return { email, phone };
}

export async function scrapeWebsite(url: string, { subpages = true } = {}): Promise<Record<string, unknown>> {
	const result: Record<string, unknown> = {
		email: null,
		site_age_estimate: null,
		social_links: {} as Record<string, string>
	};
	try {
		const { response: resp, finalUrl } = await fetchSsrfSafe(url, {
			headers: { 'User-Agent': BOT_UA },
			signal: withTimeout(7_000)
		});
		if (!resp.ok) return result;

		const html = await resp.text();
		const $ = cheerioLoad(html);

		let foundEmail = extractContactInfo($).email;

		// Email fallback: check /contact and /about sub-pages (deep mode only)
		if (!foundEmail && subpages) {
			// Use the post-redirect origin (see findContact for why: matching
			// against the stale pre-redirect url silently drops every subpage).
			const baseUrl = new URL(finalUrl).origin;
			const subPageHrefs: string[] = [];
			$('a[href]').each((_, el) => {
				const href = $(el).attr('href') ?? '';
				const lower = href.toLowerCase();
				if (lower.includes('contact') || lower.includes('about')) {
					let full: string;
					try {
						full = new URL(href, baseUrl).toString();
					} catch {
						return;
					}
					if (full.startsWith(baseUrl) && !subPageHrefs.includes(full)) {
						subPageHrefs.push(full);
					}
				}
			});

			const subResults = await Promise.allSettled(
				subPageHrefs.slice(0, 2).map(async (subUrl) => {
					const { response: subResp } = await fetchSsrfSafe(subUrl, {
						headers: { 'User-Agent': BOT_UA },
						signal: withTimeout(8_000)
					});
					if (!subResp.ok) return null;
					const subHtml = await subResp.text();
					const $sub = cheerioLoad(subHtml);
					return extractContactInfo($sub).email;
				})
			);
			for (const r of subResults) {
				if (r.status === 'fulfilled' && r.value) { foundEmail = r.value; break; }
			}
		}
		result.email = foundEmail;

		// Site age: copyright year in HTML
		const pageText = $.text();
		const years: number[] = [];
		COPYRIGHT_RE.lastIndex = 0;
		let m: RegExpExecArray | null;
		while ((m = COPYRIGHT_RE.exec(pageText)) !== null) {
			const y = parseInt(m[1]);
			if (y >= 1990 && y <= CURRENT_YEAR) years.push(y);
		}
		let foundYear: number | null = years.length ? Math.min(...years) : null;

		if (foundYear === null) {
			const lastModified = resp.headers.get('last-modified') ?? '';
			const ym = /\b(19|20)\d{2}\b/.exec(lastModified);
			if (ym) {
				const y = parseInt(ym[0]);
				if (y >= 1990 && y <= CURRENT_YEAR) foundYear = y;
			}
		}

		if (foundYear !== null) {
			const age = CURRENT_YEAR - foundYear;
			result.site_age_estimate = `~${foundYear} (est. ${age} yr${age !== 1 ? 's' : ''} old)`;
		}

		// Social links: extract from all <a href> tags (footer/nav icons etc.)
		const socialLinks: Record<string, string> = {};
		$('a[href]').each((_, el) => {
			const href = $(el).attr('href') ?? '';
			const platform = getSocialPlatform(href);
			if (platform && !socialLinks[platform]) {
				socialLinks[platform] = href;
			}
		});
		result.social_links = socialLinks;
	} catch {
		// ignore
	}
	return result;
}

async function searchSocialProfiles(
	businessName: string,
	address: string,
	existingSocials: Record<string, unknown>
): Promise<Record<string, string>> {
	const city = address.includes(',') ? address.split(',')[1].trim() : address;
	const query = `"${businessName}" "${city}" instagram OR facebook OR twitter OR tiktok`;
	const found: Record<string, string> = {};

	try {
		const resp = await fetch(DDG_SEARCH_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': BOT_UA },
			body: new URLSearchParams({ q: query, b: '' }),
			signal: withTimeout(8_000)
		});
		if (!resp.ok) return found;

		const html = await resp.text();
		const $ = cheerioLoad(html);

		for (const el of $('a.result__url, a.result__a').toArray()) {
			let href = $(el).attr('href') ?? '';
			if (!href || href.startsWith('//duckduckgo')) continue;
			if (!href.startsWith('http')) href = 'https://' + href.replace(/^\/+/, '');

			const platform = getSocialPlatform(href);
			if (platform && !existingSocials[`${platform}_url`] && !found[platform]) {
				found[platform] = href;
			}
		}
	} catch {
		// ignore
	}
	return found;
}

async function extractContactFromSocialBio(
	platform: string,
	url: string
): Promise<{ email?: string; phone?: string }> {
	if (platform === 'linkedin') return {};

	try {
		const { response: resp } = await fetchSsrfSafe(url, {
			headers: { 'User-Agent': BOT_UA },
			signal: withTimeout(7_000)
		});
		if (!resp.ok) return {};

		const html = await resp.text();
		const $ = cheerioLoad(html);
		$('script:not([type="application/ld+json"]), style').remove();

		// Collect candidate text sources: og:description bio, mailto/tel links, page text
		const sources: string[] = [];

		const ogDesc = $('meta[property="og:description"]').attr('content') ?? '';
		if (ogDesc) sources.push(ogDesc);

		$('a[href]').each((_, el) => {
			const href = $(el).attr('href') ?? '';
			if (href.startsWith('mailto:')) sources.push(href.slice(7).split('?')[0].trim());
			if (href.startsWith('tel:')) sources.push(href.slice(4).trim());
		});

		// Also scan visible page text for contacts embedded in bios
		sources.push($.text());

		let email: string | undefined;
		let phone: string | undefined;

		for (const src of sources) {
			if (!email) {
				EMAIL_RE.lastIndex = 0;
				const m = EMAIL_RE.exec(src);
				if (m) {
					const candidate = m[0];
					if (!EMAIL_EXCLUDE_EXTS.has(candidate.toLowerCase().replace(/.*(\.[^.]+)$/, '$1')) && !isPlaceholderEmail(candidate)) {
						email = candidate;
					}
				}
			}
			if (!phone) {
				PHONE_RE.lastIndex = 0;
				const m = PHONE_RE.exec(src);
				if (m) phone = m[0];
			}
			if (email && phone) break;
		}

		return { email, phone };
	} catch {
		return {};
	}
}

const CONTACT_PAGE_KEYWORDS = [
	'contact', 'about', 'home', 'team', 'staff', 'location', 'connect', 'reach', 'get-in-touch',
	'support', 'help', 'careers', 'impressum', 'legal', 'privacy', 'imprint', 'faq',
	'directions', 'office', 'branch'
];

// Overall soft deadline for findContact, well under Vercel's maxDuration: 60 on the
// find-contact route. Individual fetches get a realistic timeout (matching scrapeWebsite's
// patience); the deadline instead gates which *stages* get to run, so a slow site trades
// away later stages rather than a too-short per-fetch timeout crippling every stage equally.
// Real-world testing showed successful lookups almost always resolve in under 10s regardless
// of this ceiling — it's only the "nothing findable anywhere" leads that ever run this long,
// so a lower budget mostly just speeds up failures rather than costing real hits. Lowered
// from 50s to trim worst-case per-lead latency, which matters a lot for the bulk endpoint
// sweeping the whole missing-email backlog.
const FIND_CONTACT_BUDGET_MS = 30_000;
const FIND_CONTACT_MIN_STAGE_MS = 6_000;

const SEARCH_FALLBACK_MIN_STAGE_MS = 8_000;

export async function findContact(
	lead: Record<string, unknown>,
	opts: { forceEmail?: boolean } = {}
): Promise<{
	email: string | null;
	phone: string | null;
	emailUnverified: boolean;
	googleBlocked: boolean;
	siteBlocked: boolean;
}> {
	const deadline = Date.now() + FIND_CONTACT_BUDGET_MS;
	const timeLeft = () => deadline - Date.now();

	const needEmail = opts.forceEmail || !lead.email;
	const needPhone = !lead.phone;
	let email: string | null = null;
	let phone: string | null = null;
	let siteBlocked = false;
	const satisfied = () => (!needEmail || email) && (!needPhone || phone);

	const websiteUrl = lead.website_url as string | null;
	if (websiteUrl && !satisfied() && timeLeft() > FIND_CONTACT_MIN_STAGE_MS) {
		try {
			const { response: resp, finalUrl: homeFinalUrl } = await fetchSsrfSafe(websiteUrl, { headers: { 'User-Agent': BOT_UA }, signal: withTimeout(7_000) });
			if (resp.ok) {
				const homeHtml = await resp.text();
				if (isThirdPartyBotBlocked(homeHtml)) siteBlocked = true;
				let $ = cheerioLoad(homeHtml);
				let homeContact = extractContactInfo($);

				// Some site builders (e.g. Duda) do the inverse of typical bot handling:
				// they serve a client-rendered app shell (no contact info in raw HTML) to
				// UAs that look like a real browser, but a fully pre-rendered static page
				// to UAs they don't recognize — so our own "look like a browser" BOT_UA
				// backfires specifically on these. If the primary fetch found no email,
				// retry once with no User-Agent header at all and use that response
				// instead if it actually has more to offer.
				if (needEmail && !homeContact.email) {
					try {
						const { response: fallbackResp } = await fetchSsrfSafe(websiteUrl, { signal: withTimeout(7_000) });
						if (fallbackResp.ok) {
							const $fallback = cheerioLoad(await fallbackResp.text());
							const fallbackContact = extractContactInfo($fallback);
							if (fallbackContact.email) {
								$ = $fallback;
								homeContact = fallbackContact;
							}
						}
					} catch {
						// ignore — keep the primary response
					}
				}

				if (needEmail && !email && homeContact.email) email = homeContact.email;
				if (needPhone && !phone && homeContact.phone) phone = homeContact.phone;

				if (!satisfied() && timeLeft() > FIND_CONTACT_MIN_STAGE_MS) {
					// Same-origin check must use the *post-redirect* origin — sites
					// commonly redirect http->https and/or www->apex, and the stored
					// website_url is whatever was captured at scrape time. Matching
					// against the stale pre-redirect origin makes every link on the
					// (already-redirected) page fail the same-origin check, silently
					// skipping the entire subpage crawl.
					const baseUrl = new URL(homeFinalUrl).origin;
					const allLinkUrls: string[] = [];
					const subPageUrls: string[] = [];
					// Rank by keyword specificity (index into CONTACT_PAGE_KEYWORDS), not DOM
					// order — a broad keyword like "location" matches every page of a
					// franchise's location directory, and DOM order alone let dozens of
					// those crowd the real /contact/ page out of the slice(0, 15) below.
					const subPagePriority = new Map<string, number>();

					// Match on the link's URL *or* its visible label — nav items are
					// sometimes mislabeled (e.g. an "About" menu entry repointed at a
					// page whose slug is actually "home" after a site reorg).
					$('a[href]').each((_, el) => {
						const href = $(el).attr('href') ?? '';
						let full: string;
						try {
							full = new URL(href, baseUrl).toString();
						} catch {
							return;
						}
						if (!full.startsWith(baseUrl)) return;
						if (!allLinkUrls.includes(full)) allLinkUrls.push(full);

						const lower = href.toLowerCase();
						const label = $(el).text().trim().toLowerCase();
						const matchIdx = CONTACT_PAGE_KEYWORDS.findIndex((kw) => lower.includes(kw) || label.includes(kw));
						if (matchIdx !== -1 && !subPageUrls.includes(full)) {
							subPageUrls.push(full);
							subPagePriority.set(full, matchIdx);
						}
					});
					subPageUrls.sort((a, b) => (subPagePriority.get(a) ?? 0) - (subPagePriority.get(b) ?? 0));

					const crawlBatched = async (urlsToCrawl: string[]) => {
						for (
							let i = 0;
							i < urlsToCrawl.length && !satisfied() && timeLeft() > FIND_CONTACT_MIN_STAGE_MS;
							i += 12
						) {
							const batch = urlsToCrawl.slice(i, i + 12);
							const batchResults = await Promise.allSettled(
								batch.map(async (subUrl) => {
									const { response: subResp } = await fetchSsrfSafe(subUrl, { headers: { 'User-Agent': BOT_UA }, signal: withTimeout(7_000) });
									if (!subResp.ok) return null;
									return extractContactInfo(cheerioLoad(await subResp.text()));
								})
							);
							for (const r of batchResults) {
								if (r.status !== 'fulfilled' || !r.value) continue;
								if (needEmail && !email && r.value.email) email = r.value.email;
								if (needPhone && !phone && r.value.phone) phone = r.value.phone;
							}
						}
					};

					const targeted = subPageUrls.slice(0, 15);
					await crawlBatched(targeted);

					// Catch-all: if the targeted keyword/sitemap crawl still came up short,
					// fall back to every other same-origin link found on the homepage —
					// guarantees full one-hop coverage regardless of how pages are labeled.
					if (!satisfied() && timeLeft() > FIND_CONTACT_MIN_STAGE_MS) {
						const tried = new Set([websiteUrl, ...targeted]);
						const remaining = allLinkUrls.filter((u) => !tried.has(u)).slice(0, 20);
						await crawlBatched(remaining);
					}
				}
			}
		} catch {
			// ignore
		}
	}

	const biz = (lead.business_name as string) ?? '';
	const addr = (lead.address as string) ?? '';

	if (!satisfied() && timeLeft() > FIND_CONTACT_MIN_STAGE_MS) {
		const socialFields = ['instagram_url', 'facebook_url', 'twitter_url', 'tiktok_url', 'youtube_url', 'linkedin_url'];
		const socialEntries = socialFields
			.map((f) => ({ field: f, url: lead[f] as string | null }))
			.filter((e): e is { field: string; url: string } => typeof e.url === 'string');

		const socialResults = await Promise.allSettled(
			socialEntries.map(async (e) => {
				const platform = getSocialPlatform(e.url);
				if (!platform) return null;
				return extractContactFromSocialBio(platform, e.url);
			})
		);
		for (const r of socialResults) {
			if (r.status !== 'fulfilled' || !r.value) continue;
			if (needEmail && !email && r.value.email) email = r.value.email;
			if (needPhone && !phone && r.value.phone) phone = r.value.phone;
		}
	}

	if (!satisfied() && biz && timeLeft() > FIND_CONTACT_MIN_STAGE_MS) {
		const newSocials = await searchSocialProfiles(biz, addr, lead);
		await Promise.allSettled(
			Object.entries(newSocials).map(async ([platform, url]) => {
				const contact = await extractContactFromSocialBio(platform, url);
				if (needEmail && !email && contact.email) email = contact.email;
				if (needPhone && !phone && contact.phone) phone = contact.phone;
			})
		);
	}

	// Last resort: search Google for the business's own published contact details (results
	// snippet text first, then a handful of directory/citation pages). Less certain than a
	// direct page fetch — flag anything it supplies.
	let emailUnverified = false;
	let googleBlocked = false;
	if (!satisfied() && biz && timeLeft() > SEARCH_FALLBACK_MIN_STAGE_MS) {
		const found = await searchContactMentions(biz, addr);
		googleBlocked = found.blocked;
		if (needEmail && !email && found.email) {
			email = found.email;
			emailUnverified = true;
		}
		if (needPhone && !phone && found.phone) phone = found.phone;
	}

	return { email, phone, emailUnverified, googleBlocked, siteBlocked };
}

// Google returns HTTP 200 even for its CAPTCHA/"unusual traffic" interstitial, so a plain
// !resp.ok check can't tell "genuinely no results" apart from "we got rate-limited" — which
// matters a lot once something is calling the Google-scrape stages across many leads in a row
// (the bulk find-contact job). Redirects to /sorry/ are the clearest signal; the "unusual
// traffic" wording and a normal results page's near-total absence of the usual result markup
// are backups for the cases Google serves the interstitial without a redirect.
function isGoogleBlocked(finalUrl: string, html: string): boolean {
	if (finalUrl.includes('/sorry/')) return true;
	if (/unusual traffic from your computer network/i.test(html)) return true;
	if (!html.includes('id="search"') && !html.includes('id="rso"') && html.length < 5000) return true;
	return false;
}

// Some hosting providers front their customers' sites with a bot-protection layer that
// returns a real HTTP 200/202 but with a tiny body containing only a meta-refresh to a
// challenge page (e.g. a shared "sgcaptcha" system seen across multiple unrelated small
// business sites during real-world testing — confirmed the same ~180-byte stub, same
// meta-refresh-to-/.well-known/ path, on three different domains). A page this size can
// never legitimately contain a real business's contact info, so treat it as "we got
// blocked" rather than "genuinely nothing published" — the two have very different meaning
// for how confidently the caller should treat an empty result.
function isThirdPartyBotBlocked(html: string): boolean {
	if (html.length > 1000) return false;
	return /<meta\s+http-equiv=["']refresh["']/i.test(html) && /captcha|challenge|\.well-known/i.test(html);
}

async function discoverWebsiteGoogle(
	businessName: string,
	address: string
): Promise<{ websiteUrl: string | null; discoveredSocial: Record<string, string> }> {
	const city = address.includes(',') ? address.split(',')[1].trim() : address;
	const query = `${businessName} ${city}`;
	const discoveredSocial: Record<string, string> = {};

	try {
		const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=5`;
		const resp = await fetch(url, {
			headers: {
				'User-Agent': BOT_UA,
				'Accept-Language': 'en-US,en;q=0.9'
			},
			signal: withTimeout(8_000)
		});
		if (!resp.ok) return { websiteUrl: null, discoveredSocial };

		const html = await resp.text();
		if (isGoogleBlocked(resp.url, html)) return { websiteUrl: null, discoveredSocial };
		const $ = cheerioLoad(html);

		// Google encodes result URLs in various anchor formats; scan all hrefs for /url?q= pattern
		for (const el of $('a[href]').toArray()) {
			const raw = $(el).attr('href') ?? '';
			let href = raw;

			// Google wraps links as /url?q=<encoded-url>&...
			if (raw.startsWith('/url?')) {
				try {
					href = new URL('https://www.google.com' + raw).searchParams.get('q') ?? '';
				} catch {
					continue;
				}
			}

			if (!href.startsWith('http')) continue;

			let domain: string;
			try {
				domain = new URL(href).hostname.toLowerCase().replace(/^www\./, '');
			} catch {
				continue;
			}

			// Skip Google itself and known directories
			if (domain === 'google.com' || domain.endsWith('.google.com')) continue;
			if ([...DIRECTORY_DOMAINS].some((d) => domain === d || domain.endsWith('.' + d))) continue;

			if (isSocialMediaUrl(href)) {
				const platform = getSocialPlatform(href);
				if (platform && !discoveredSocial[platform]) discoveredSocial[platform] = href;
				continue;
			}

			return { websiteUrl: href, discoveredSocial };
		}
	} catch {
		// ignore
	}
	return { websiteUrl: null, discoveredSocial };
}

// Last resort for findContact: no LLM involved — searches Google the same way
// discoverWebsiteGoogle does, first scanning the results page's own text for an email/phone
// (search engines often echo a business's on-page text straight into a result snippet, so
// this can succeed without visiting anything), then visiting a handful of non-social,
// non-data-broker results and running the normal extractContactInfo on each. Deliberately
// does NOT filter through DIRECTORY_DOMAINS — genuine directories (Yellow Pages, BBB) are
// exactly the kind of "other source" this is meant to check, unlike DATA_BROKER_DOMAINS.
async function searchContactMentions(
	businessName: string,
	address: string
): Promise<{ email: string | null; phone: string | null; blocked: boolean }> {
	const city = address.includes(',') ? address.split(',')[1].trim() : address;
	const query = `"${businessName}" "${city}" email OR contact`;
	const found: { email: string | null; phone: string | null; blocked: boolean } = {
		email: null,
		phone: null,
		blocked: false
	};

	try {
		const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10`;
		const resp = await fetch(url, {
			headers: {
				'User-Agent': BOT_UA,
				'Accept-Language': 'en-US,en;q=0.9'
			},
			signal: withTimeout(8_000)
		});
		if (!resp.ok) return found;

		const html = await resp.text();
		if (isGoogleBlocked(resp.url, html)) {
			found.blocked = true;
			return found;
		}
		const $ = cheerioLoad(html);

		// Scan the results page's own visible text first — a snippet sometimes contains
		// the answer directly, with no extra fetch needed.
		const pageContact = extractContactInfo($);
		found.email = pageContact.email;
		found.phone = pageContact.phone;
		if (found.email && found.phone) return found;

		const candidateUrls: string[] = [];
		for (const el of $('a[href]').toArray()) {
			const raw = $(el).attr('href') ?? '';
			let href = raw;

			if (raw.startsWith('/url?')) {
				try {
					href = new URL('https://www.google.com' + raw).searchParams.get('q') ?? '';
				} catch {
					continue;
				}
			}
			if (!href.startsWith('http')) continue;
			if (isSocialMediaUrl(href)) continue;

			let domain: string;
			try {
				domain = new URL(href).hostname.toLowerCase().replace(/^www\./, '');
			} catch {
				continue;
			}
			if (domain === 'google.com' || domain.endsWith('.google.com')) continue;
			if ([...DATA_BROKER_DOMAINS].some((d) => domain === d || domain.endsWith('.' + d))) continue;

			if (!candidateUrls.includes(href)) candidateUrls.push(href);
			if (candidateUrls.length >= 4) break;
		}

		const results = await Promise.allSettled(
			candidateUrls.map(async (candidateUrl) => {
				const { response: pageResp } = await fetchSsrfSafe(candidateUrl, {
					headers: { 'User-Agent': BOT_UA },
					signal: withTimeout(7_000)
				});
				if (!pageResp.ok) return null;
				return extractContactInfo(cheerioLoad(await pageResp.text()));
			})
		);
		for (const r of results) {
			if (r.status !== 'fulfilled' || !r.value) continue;
			if (!found.email && r.value.email) found.email = r.value.email;
			if (!found.phone && r.value.phone) found.phone = r.value.phone;
			if (found.email && found.phone) break;
		}
	} catch {
		// ignore
	}
	return found;
}

async function fetchGbpWebsite(placeId: string): Promise<string | null> {
	if (!GOOGLE_PLACES_API_KEY) return null;
	try {
		const params = new URLSearchParams({ place_id: placeId, fields: 'website', key: GOOGLE_PLACES_API_KEY });
		const resp = await fetch(
			`https://maps.googleapis.com/maps/api/place/details/json?${params}`,
			{ signal: withTimeout(5_000) }
		);
		if (!resp.ok) return null;
		const data = await resp.json();
		return (data.result?.website as string) ?? null;
	} catch {
		return null;
	}
}

export async function resolveFinalUrl(url: string): Promise<string> {
	try {
		const { finalUrl } = await fetchSsrfSafe(url, {
			method: 'HEAD',
			headers: { 'User-Agent': BOT_UA },
			signal: withTimeout(10_000)
		});
		return finalUrl;
	} catch {
		return url;
	}
}

export async function runEnrichment(lead: Record<string, unknown>, { deep = false } = {}): Promise<Record<string, unknown>> {
	const enrichment: Record<string, unknown> = {};

	const biz = (lead.business_name as string) ?? '';
	const addr = (lead.address as string) ?? '';
	const phone = (lead.phone as string) ?? '';

	// Yelp only needs business name/address/phone — start it immediately in parallel
	// with the URL resolution + discovery chain so it doesn't sit idle waiting.
	const yelpPromise = fetchYelp(biz, addr, phone);

	let websiteUrl = lead.website_url as string | null;
	let websiteInferred = Boolean(lead.website_inferred);

	// Capture any social URL that was listed as the GBP website (scraper saves it here)
	const gbpSocial = lead.gbp_social_url as string | null;
	if (gbpSocial) {
		const platform = getSocialPlatform(gbpSocial);
		if (platform && !enrichment[`${platform}_url`]) enrichment[`${platform}_url`] = gbpSocial;
	}

	// Re-fetch the GBP website field for existing leads that had social URLs discarded at scrape time
	if (lead.google_place_id && !websiteUrl) {
		const gbpWebsite = await fetchGbpWebsite(lead.google_place_id as string);
		if (gbpWebsite && isSocialMediaUrl(gbpWebsite)) {
			const platform = getSocialPlatform(gbpWebsite);
			if (platform && !enrichment[`${platform}_url`]) enrichment[`${platform}_url`] = gbpWebsite;
		} else if (gbpWebsite) {
			// GBP now has a real website not present at scrape time — use it
			websiteUrl = gbpWebsite;
			enrichment.website_url = websiteUrl;
			enrichment.has_website = true;
			enrichment.has_https = websiteUrl.startsWith('https://');
		}
	}

	if (isSocialMediaUrl(websiteUrl)) {
		const platform = getSocialPlatform(websiteUrl);
		if (platform) enrichment[`${platform}_url`] = websiteUrl;
		websiteUrl = null;
		enrichment.website_url = null;
		enrichment.has_website = false;
		websiteInferred = false;
	}

	if (websiteUrl) {
		const finalUrl = await resolveFinalUrl(websiteUrl);
		if (isAggregatorUrl(finalUrl) || isSocialMediaUrl(finalUrl)) {
			if (isSocialMediaUrl(finalUrl)) {
				const platform = getSocialPlatform(finalUrl);
				if (platform) enrichment[`${platform}_url`] = finalUrl;
			}
			websiteUrl = null;
			enrichment.website_url = null;
			enrichment.has_website = false;
			websiteInferred = false;
			enrichment.website_inferred = false;
		}
	}

	if (!websiteUrl) {
		const { websiteUrl: discovered, discoveredSocial } = await discoverWebsite(biz, addr);
		if (discovered) {
			websiteUrl = discovered;
			websiteInferred = true;
			enrichment.website_url = websiteUrl;
		}
		for (const [platform, url] of Object.entries(discoveredSocial)) {
			if (!enrichment[`${platform}_url`]) enrichment[`${platform}_url`] = url;
		}

		// Deep mode: try Google as a fallback if DuckDuckGo found nothing
		if (!websiteUrl && deep) {
			const { websiteUrl: googleUrl, discoveredSocial: googleSocial } = await discoverWebsiteGoogle(biz, addr);
			if (googleUrl) {
				websiteUrl = googleUrl;
				websiteInferred = true;
				enrichment.website_url = websiteUrl;
				// Flag that this site came from Google search — may not be the right business
				enrichment.website_source = 'google_search';
			}
			for (const [platform, url] of Object.entries(googleSocial)) {
				if (!enrichment[`${platform}_url`]) enrichment[`${platform}_url`] = url;
			}
		}

		enrichment.website_inferred = websiteInferred;
	}

	// URL chain is done — collect Yelp (likely already resolved by now)
	const yelp = await yelpPromise;

	if (websiteUrl) {
		enrichment.has_https = websiteUrl.startsWith('https://');
		const [pagespeed, websiteData] = await Promise.all([
			deep ? fetchPagespeed(websiteUrl) : Promise.resolve({
				pagespeed_mobile: null,
				pagespeed_desktop: null,
				mobile_friendly: null,
				website_screenshot: null,
				pagespeed_seo: null,
				pagespeed_best_practices: null
			}),
			scrapeWebsite(websiteUrl, { subpages: deep })
		]);
		// Only write pagespeed nulls if deep mode ran and got nothing — preserve existing values in quick mode
		if (deep) Object.assign(enrichment, pagespeed);
		else Object.assign(enrichment, Object.fromEntries(
			Object.entries(pagespeed as Record<string, unknown>).filter(([, v]) => v !== null)
		));
		if (websiteData.email) {
			enrichment.email = websiteData.email;
			enrichment.email_unverified = false;
		}
		if (websiteData.site_age_estimate) enrichment.site_age_estimate = websiteData.site_age_estimate;

		const scrapedSocial = (websiteData.social_links ?? {}) as Record<string, string>;
		for (const [platform, url] of Object.entries(scrapedSocial)) {
			if (!enrichment[`${platform}_url`]) enrichment[`${platform}_url`] = url;
		}

		Object.assign(enrichment, yelp);
	} else {
		Object.assign(enrichment, {
			pagespeed_mobile: null,
			pagespeed_desktop: null,
			mobile_friendly: null,
			pagespeed_seo: null,
			pagespeed_best_practices: null
		});
		Object.assign(enrichment, yelp);
	}

	// Deep mode: targeted social discovery + social bio contact extraction
	if (deep) {
		// Find social profiles not yet discovered via website scrape / DDG website search
		const newSocials = await searchSocialProfiles(biz, addr, { ...lead, ...enrichment });
		for (const [platform, url] of Object.entries(newSocials)) {
			if (!enrichment[`${platform}_url`] && !lead[`${platform}_url`]) {
				enrichment[`${platform}_url`] = url;
			}
		}

		// If still missing email or phone, scrape social bios (Instagram first — most likely to have it)
		const needEmail = !enrichment.email && !lead.email;
		const needPhone = !phone && !(enrichment as Record<string, unknown>).phone;
		if (needEmail || needPhone) {
			const socialOrder = ['instagram_url', 'facebook_url', 'twitter_url', 'tiktok_url', 'youtube_url'];
			for (const field of socialOrder) {
				const profileUrl = (enrichment[field] ?? lead[field]) as string | null;
				if (!profileUrl) continue;
				const platform = getSocialPlatform(profileUrl);
				if (!platform) continue;

				const contact = await extractContactFromSocialBio(platform, profileUrl);
				if (needEmail && contact.email && !enrichment.email) {
					enrichment.email = contact.email;
					enrichment.email_unverified = false;
				}
				if (needPhone && contact.phone && !(enrichment as Record<string, unknown>).phone) {
					(enrichment as Record<string, unknown>).phone = contact.phone;
				}
				if ((!needEmail || enrichment.email) && (!needPhone || (enrichment as Record<string, unknown>).phone)) break;
			}
		}
	}

	// Compute social activity score: count of non-null social channels
	const socialFields = ['facebook_url', 'instagram_url', 'twitter_url', 'linkedin_url', 'tiktok_url', 'youtube_url'] as const;
	const mergedSocial = { ...lead, ...enrichment };
	const socialActivityScore = socialFields.filter((f) => Boolean(mergedSocial[f])).length;
	enrichment.social_activity_score = socialActivityScore;

	// Generate LinkedIn search URL from owner_name + city (if owner_name was pulled from Places)
	const ownerName = (enrichment.owner_name ?? lead.owner_name) as string | null;
	if (ownerName && !enrichment.linkedin_search_url && !lead.linkedin_search_url) {
		const addr = (lead.address as string) ?? '';
		const city = addr.includes(',') ? addr.split(',')[1].trim() : addr;
		enrichment.linkedin_search_url = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(ownerName + ' ' + city)}`;
	}

	return enrichment;
}
