import { load as cheerioLoad } from 'cheerio';
import { SOCIAL_MEDIA_DOMAINS, AGGREGATOR_DOMAINS, isSocialMediaUrl, isAggregatorUrl, getSocialPlatform } from './utils.js';
import { GOOGLE_PAGESPEED_API_KEY, YELP_API_KEY } from '$env/static/private';

const PAGESPEED_URL = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const YELP_SEARCH_URL = 'https://api.yelp.com/v3/businesses/search';
const DDG_SEARCH_URL = 'https://html.duckduckgo.com/html/';

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const EMAIL_EXCLUDE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.pdf']);
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

export async function fetchPagespeed(url: string): Promise<Record<string, unknown>> {
	const params = new URLSearchParams({ url, strategy: 'mobile' });
	for (const cat of ['performance', 'seo', 'best-practices', 'accessibility']) {
		params.append('category', cat);
	}
	if (GOOGLE_PAGESPEED_API_KEY) params.append('key', GOOGLE_PAGESPEED_API_KEY);

	const desktopParams = new URLSearchParams({ url, strategy: 'desktop', category: 'performance' });
	if (GOOGLE_PAGESPEED_API_KEY) desktopParams.append('key', GOOGLE_PAGESPEED_API_KEY);

	const nullResult = {
		pagespeed_mobile: null,
		pagespeed_desktop: null,
		mobile_friendly: null,
		website_screenshot: null,
		pagespeed_seo: null,
		pagespeed_best_practices: null
	};

	try {
		const [resp, respD] = await Promise.all([
			fetch(`${PAGESPEED_URL}?${params}`, { signal: withTimeout(45_000) }),
			fetch(`${PAGESPEED_URL}?${desktopParams}`, { signal: withTimeout(45_000) })
		]);

		if (!resp.ok || !respD.ok) return nullResult;

		const data = await resp.json();
		const dataD = await respD.json();

		const lhr = data.lighthouseResult ?? {};
		const categories = lhr.categories ?? {};

		const score = (cat: string): number | null => {
			const s = categories[cat]?.score;
			return s != null ? Math.round(s * 100) : null;
		};

		const categoriesD = dataD.lighthouseResult?.categories ?? {};
		const desktopScore = categoriesD.performance?.score;
		const desktopInt = desktopScore != null ? Math.round(desktopScore * 100) : null;

		const audits = lhr.audits ?? {};
		const mobileFriendly = audits.viewport?.score === 1;
		const screenshot = audits['final-screenshot']?.details?.data ?? null;

		return {
			pagespeed_mobile: score('performance'),
			pagespeed_desktop: desktopInt,
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
			signal: withTimeout(15_000)
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
			signal: withTimeout(15_000)
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

export async function scrapeWebsite(url: string): Promise<Record<string, unknown>> {
	const result: Record<string, unknown> = {
		email: null,
		site_age_estimate: null,
		social_links: {} as Record<string, string>
	};
	try {
		const resp = await fetch(url, {
			headers: { 'User-Agent': BOT_UA },
			signal: withTimeout(10_000)
		});
		if (!resp.ok) return result;

		const html = await resp.text();
		const $ = cheerioLoad(html);

		// Email: mailto: links first, then regex scan
		let foundEmail: string | null = null;
		$('a[href]').each((_, el) => {
			if (foundEmail) return;
			const href = $(el).attr('href') ?? '';
			if (href.startsWith('mailto:')) {
				const candidate = href.slice(7).split('?')[0].trim();
				if (EMAIL_RE.test(candidate)) {
					foundEmail = candidate;
					EMAIL_RE.lastIndex = 0;
				}
			}
		});

		if (!foundEmail) {
			const text = $.text();
			EMAIL_RE.lastIndex = 0;
			let match: RegExpExecArray | null;
			while ((match = EMAIL_RE.exec(text)) !== null) {
				const candidate = match[0];
				if (!EMAIL_EXCLUDE_EXTS.has(candidate.toLowerCase().replace(/.*(\.[^.]+)$/, '$1'))) {
					foundEmail = candidate;
					break;
				}
			}
		}

		// Email fallback: check /contact and /about sub-pages
		if (!foundEmail) {
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

			for (const subUrl of subPageHrefs.slice(0, 2)) {
				if (foundEmail) break;
				try {
					const subResp = await fetch(subUrl, {
						headers: { 'User-Agent': BOT_UA },
						signal: withTimeout(8_000)
					});
					if (!subResp.ok) continue;
					const subHtml = await subResp.text();
					const $sub = cheerioLoad(subHtml);

					$sub('a[href]').each((_, el) => {
						if (foundEmail) return;
						const href = $sub(el).attr('href') ?? '';
						if (href.startsWith('mailto:')) {
							const candidate = href.slice(7).split('?')[0].trim();
							if (EMAIL_RE.test(candidate)) {
								foundEmail = candidate;
								EMAIL_RE.lastIndex = 0;
							}
						}
					});

					if (!foundEmail) {
						const subText = $sub.text();
						EMAIL_RE.lastIndex = 0;
						let subMatch: RegExpExecArray | null;
						while ((subMatch = EMAIL_RE.exec(subText)) !== null) {
							const candidate = subMatch[0];
							if (!EMAIL_EXCLUDE_EXTS.has(candidate.toLowerCase().replace(/.*(\.[^.]+)$/, '$1'))) {
								foundEmail = candidate;
								break;
							}
						}
					}
				} catch {
					// skip sub-page on error
				}
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

export async function resolveFinalUrl(url: string): Promise<string> {
	try {
		const resp = await fetch(url, {
			method: 'HEAD',
			headers: { 'User-Agent': BOT_UA },
			signal: withTimeout(10_000)
		});
		return resp.url;
	} catch {
		return url;
	}
}

export async function runEnrichment(lead: Record<string, unknown>): Promise<Record<string, unknown>> {
	const enrichment: Record<string, unknown> = {};

	let websiteUrl = lead.website_url as string | null;
	let websiteInferred = Boolean(lead.website_inferred);

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
		const { websiteUrl: discovered, discoveredSocial } = await discoverWebsite(
			(lead.business_name as string) ?? '',
			(lead.address as string) ?? ''
		);
		if (discovered) {
			websiteUrl = discovered;
			websiteInferred = true;
			enrichment.website_url = websiteUrl;
		}
		for (const [platform, url] of Object.entries(discoveredSocial)) {
			if (!enrichment[`${platform}_url`]) enrichment[`${platform}_url`] = url;
		}
		enrichment.website_inferred = websiteInferred;
	}

	const biz = (lead.business_name as string) ?? '';
	const addr = (lead.address as string) ?? '';
	const phone = (lead.phone as string) ?? '';

	if (websiteUrl) {
		enrichment.has_https = websiteUrl.startsWith('https://');
		const [pagespeed, websiteData, yelp] = await Promise.all([
			fetchPagespeed(websiteUrl),
			scrapeWebsite(websiteUrl),
			fetchYelp(biz, addr, phone)
		]);
		Object.assign(enrichment, pagespeed);
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
			website_screenshot: null,
			pagespeed_seo: null,
			pagespeed_best_practices: null
		});
		const yelp = await fetchYelp(biz, addr, phone);
		Object.assign(enrichment, yelp);
	}

	return enrichment;
}
