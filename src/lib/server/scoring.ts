export function calculateScore(data: Record<string, unknown>): [number, string] {
	let score = 0;

	// --- Existing signals ---

	if (!data.has_website) {
		if (data.website_inferred) {
			score += 20;
		} else {
			score += 40;
		}
	}

	if (data.mobile_friendly === false) {
		score += 20;
	}

	const mobile = data.pagespeed_mobile as number | null | undefined;
	if (mobile != null) {
		if (mobile < 25) score += 20;
		else if (mobile < 50) score += 15;
		else if (mobile < 75) score += 5;
	}

	const seo = data.pagespeed_seo as number | null | undefined;
	if (seo != null) {
		if (seo < 50) score += 10;
		else if (seo < 80) score += 5;
	}

	const bp = data.pagespeed_best_practices as number | null | undefined;
	if (bp != null) {
		if (bp < 50) score += 10;
		else if (bp < 80) score += 5;
	}

	if (data.has_website && !data.has_https) {
		score += 10;
	}

	if (((data.review_count as number) || 0) < 10) {
		score += 10;
	}

	if (data.also_on_yelp === false && data.has_gbp) {
		score += 5;
	}

	// --- New signals ---

	// Old website: parse "~YYYY (est. N yrs old)" from site_age_estimate
	const siteAge = data.site_age_estimate as string | null | undefined;
	if (siteAge) {
		const ageMatch = /est\.\s*(\d+)\s*yr/.exec(siteAge);
		if (ageMatch) {
			const ageYears = parseInt(ageMatch[1]);
			if (ageYears > 7) score += 10;
			else if (ageYears >= 5) score += 5;
		}
	}

	// Has website but no email found — hard to reach, warm prospect
	if (data.has_website && !data.email) {
		score += 5;
	}

	// No social media presence at all — full digital absence
	const hasSocial =
		data.facebook_url ||
		data.instagram_url ||
		data.twitter_url ||
		data.linkedin_url ||
		data.tiktok_url ||
		data.youtube_url;
	if (!hasSocial) {
		score += 5;
	}

	score = Math.min(score, 100);
	// Threshold lowered from 60 → 45: no-website leads can now reach "high"
	const priority = score >= 45 ? 'high' : score >= 30 ? 'medium' : 'low';
	return [score, priority];
}
