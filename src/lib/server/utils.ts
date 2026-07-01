import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const SOCIAL_MEDIA_DOMAINS = new Set([
	'facebook.com',
	'instagram.com',
	'twitter.com',
	'x.com',
	'linkedin.com',
	'tiktok.com',
	'youtube.com',
	'pinterest.com',
	'snapchat.com'
]);

export const AGGREGATOR_DOMAINS = new Set([
	'skipthedishes.com',
	'doordash.com',
	'ubereats.com',
	'grubhub.com',
	'seamless.com',
	'postmates.com',
	'menulog.com',
	'justeat.com',
	'deliveroo.com',
	'toasttab.com',
	'square.site'
]);

function domainMatch(url: string | null | undefined, domainSet: Set<string>): boolean {
	if (!url) return false;
	try {
		const domain = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
		for (const d of domainSet) {
			if (domain === d || domain.endsWith('.' + d)) return true;
		}
		return false;
	} catch {
		return false;
	}
}

export function isSocialMediaUrl(url: string | null | undefined): boolean {
	return domainMatch(url, SOCIAL_MEDIA_DOMAINS);
}

export function isAggregatorUrl(url: string | null | undefined): boolean {
	return domainMatch(url, AGGREGATOR_DOMAINS);
}

const SOCIAL_PLATFORM_MAP: Record<string, string> = {
	'facebook.com': 'facebook',
	'instagram.com': 'instagram',
	'twitter.com': 'twitter',
	'x.com': 'twitter',
	'linkedin.com': 'linkedin',
	'tiktok.com': 'tiktok',
	'youtube.com': 'youtube'
};

export function getSocialPlatform(url: string | null | undefined): string | null {
	if (!url) return null;
	try {
		const domain = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
		for (const [d, platform] of Object.entries(SOCIAL_PLATFORM_MAP)) {
			if (domain === d || domain.endsWith('.' + d)) return platform;
		}
	} catch {
		// ignore
	}
	return null;
}

export function normalizeWebsiteUrl(raw: string | null | undefined): string | null {
	const trimmed = (raw ?? '').trim();
	if (!trimmed) return null;

	const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
	let parsed: URL;
	try {
		parsed = new URL(withScheme);
	} catch {
		throw new Error('Website URL is not valid');
	}

	if (isSocialMediaUrl(parsed.href) || isAggregatorUrl(parsed.href)) {
		throw new Error('Website URL cannot be a social media or delivery aggregator link');
	}

	if (isDisallowedHostLiteral(parsed.hostname)) {
		throw new Error('Website URL cannot point to a local or internal address');
	}

	return parsed.href;
}

// --- SSRF protection -------------------------------------------------------
// Used to stop server-side fetches (enrichment scraping, redirect resolution)
// from being pointed at internal/private network targets via a lead's website URL.

function isPrivateIPv4(ip: string): boolean {
	const [a, b] = ip.split('.').map(Number);
	if (a === 10) return true;
	if (a === 127) return true;
	if (a === 0) return true;
	if (a === 169 && b === 254) return true;
	if (a === 172 && b >= 16 && b <= 31) return true;
	if (a === 192 && b === 168) return true;
	if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
	if (a >= 224) return true; // multicast + reserved
	return false;
}

function isPrivateIPv6(ip: string): boolean {
	const lower = ip.toLowerCase();
	if (lower === '::1' || lower === '::') return true;
	if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7 (ULA)
	if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 (link-local)
	if (lower.startsWith('::ffff:')) {
		const v4 = lower.split(':').pop();
		if (v4 && isIP(v4) === 4) return isPrivateIPv4(v4);
	}
	return false;
}

function isPrivateIp(ip: string): boolean {
	const version = isIP(ip);
	if (version === 4) return isPrivateIPv4(ip);
	if (version === 6) return isPrivateIPv6(ip);
	return true; // unrecognizable address — treat as unsafe
}

function isDisallowedHostLiteral(hostname: string): boolean {
	const host = hostname.toLowerCase();
	if (host === 'localhost' || host.endsWith('.localhost')) return true;
	if (isIP(host)) return isPrivateIp(host);
	return false;
}

/**
 * Throws if `rawUrl` is not http(s), or resolves (directly or via DNS) to a
 * private/loopback/link-local/reserved address. Call immediately before any
 * server-side fetch of a URL that originated from lead data, to close the
 * window between save-time validation and fetch-time DNS resolution.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<void> {
	let parsed: URL;
	try {
		parsed = new URL(rawUrl);
	} catch {
		throw new Error('Invalid URL');
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new Error('URL must use http or https');
	}

	const hostname = parsed.hostname.toLowerCase();
	if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
		throw new Error('URL host is not allowed');
	}

	if (isIP(hostname)) {
		if (isPrivateIp(hostname)) throw new Error('URL host is not allowed');
		return;
	}

	let addresses: { address: string }[];
	try {
		addresses = await lookup(hostname, { all: true });
	} catch {
		throw new Error('URL host could not be resolved');
	}
	for (const { address } of addresses) {
		if (isPrivateIp(address)) throw new Error('URL host is not allowed');
	}
}
