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
