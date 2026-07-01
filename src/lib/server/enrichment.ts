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
const EMAIL_OBFUSCATED_RE = /([a-zA-Z0-9._%+-]+)\s*[\[(]?\s*at\s*[\])]?\s*([a-zA-Z0-9.-]+)\s*[\[(]?\s*dot\s*[\])]?\s*([a-zA-Z]{2,})\b/gi;
const EMAIL_EXCLUDE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.pdf']);
const PHONE_RE = /\(?\d{3}\)?[\s\-\.]\d{3}[\s\-\.]\d{4}/g;
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

function diceCoefficient(a: string, b: string): number {
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
		if (EMAIL_RE.test(candidate)) found.email = candidate;
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

function extractContactInfo($: ReturnType<typeof cheerioLoad>): { email: string | null; phone: string | null } {
	let email: string | null = null;
	let phone: string | null = null;

	$('a[href]').each((_, el) => {
		const href = $(el).attr('href') ?? '';
		if (!email && href.startsWith('mailto:')) {
			const candidate = href.slice(7).split('?')[0].trim();
			EMAIL_RE.lastIndex = 0;
			if (EMAIL_RE.test(candidate)) email = candidate;
		}
		if (!phone && href.startsWith('tel:')) {
			const candidate = href.slice(4).trim();
			if (candidate.replace(/\D/g, '').length >= 10) phone = candidate;
		}
	});

	if (!email || !phone) {
		const jsonLd = extractJsonLdContact($);
		if (!email && jsonLd.email) email = jsonLd.email;
		if (!phone && jsonLd.phone) phone = jsonLd.phone;
	}

	const text = $.text();
	if (!email) {
		EMAIL_RE.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = EMAIL_RE.exec(text)) !== null) {
			const candidate = match[0];
			if (!EMAIL_EXCLUDE_EXTS.has(candidate.toLowerCase().replace(/.*(\.[^.]+)$/, '$1'))) {
				email = candidate;
				break;
			}
		}
	}
	if (!email) {
		// De-obfuscated fallback: "name [at] domain [dot] com" style anti-scraper text
		EMAIL_OBFUSCATED_RE.lastIndex = 0;
		const match = EMAIL_OBFUSCATED_RE.exec(text);
		if (match) email = `${match[1]}@${match[2]}.${match[3]}`.toLowerCase();
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
		const { response: resp } = await fetchSsrfSafe(url, {
			headers: { 'User-Agent': BOT_UA },
			signal: withTimeout(7_000)
		});
		if (!resp.ok) return result;

		const html = await resp.text();
		const $ = cheerioLoad(html);

		let foundEmail = extractContactInfo($).email;

		// Email fallback: check /contact and /about sub-pages (deep mode only)
		if (!foundEmail && subpages) {
			const baseUrl = new URL(url).origin;
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
					if (!EMAIL_EXCLUDE_EXTS.has(candidate.toLowerCase().replace(/.*(\.[^.]+)$/, '$1'))) {
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
const FIND_CONTACT_BUDGET_MS = 50_000;
const FIND_CONTACT_MIN_STAGE_MS = 8_000;

export async function findContact(lead: Record<string, unknown>): Promise<{ email: string | null; phone: string | null }> {
	const deadline = Date.now() + FIND_CONTACT_BUDGET_MS;
	const timeLeft = () => deadline - Date.now();

	const needEmail = !lead.email;
	const needPhone = !lead.phone;
	let email: string | null = null;
	let phone: string | null = null;
	const satisfied = () => (!needEmail || email) && (!needPhone || phone);

	const websiteUrl = lead.website_url as string | null;
	if (websiteUrl && !satisfied() && timeLeft() > FIND_CONTACT_MIN_STAGE_MS) {
		try {
			const { response: resp } = await fetchSsrfSafe(websiteUrl, { headers: { 'User-Agent': BOT_UA }, signal: withTimeout(7_000) });
			if (resp.ok) {
				const $ = cheerioLoad(await resp.text());
				const homeContact = extractContactInfo($);
				if (needEmail && !email && homeContact.email) email = homeContact.email;
				if (needPhone && !phone && homeContact.phone) phone = homeContact.phone;

				if (!satisfied() && timeLeft() > FIND_CONTACT_MIN_STAGE_MS) {
					const baseUrl = new URL(websiteUrl).origin;
					const allLinkUrls: string[] = [];
					const subPageUrls: string[] = [];

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
						const isKeywordMatch = CONTACT_PAGE_KEYWORDS.some((kw) => lower.includes(kw) || label.includes(kw));
						if (isKeywordMatch && !subPageUrls.includes(full)) subPageUrls.push(full);
					});

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

	return { email, phone };
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
		if (websiteData.email) enrichment.email = websiteData.email;
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
				if (needEmail && contact.email && !enrichment.email) enrichment.email = contact.email;
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
