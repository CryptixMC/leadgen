export function calculateScore(data: Record<string, unknown>): [number, string] {
	let score = 0;

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

	score = Math.min(score, 100);
	const priority = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';
	return [score, priority];
}
