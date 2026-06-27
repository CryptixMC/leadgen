import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';

const TSV_COLUMNS = [
	'id', 'business_name', 'address', 'phone', 'website_url', 'email',
	'google_place_id', 'google_rating', 'review_count', 'has_gbp',
	'has_website', 'has_https', 'website_inferred', 'pagespeed_mobile', 'pagespeed_desktop',
	'mobile_friendly', 'pagespeed_seo', 'pagespeed_best_practices', 'site_age_estimate',
	'also_on_yelp', 'yelp_url', 'lead_score', 'priority', 'status', 'notes',
	'created_at', 'last_updated'
];

export const GET: RequestHandler = async ({ locals }) => {
	requireAuth(locals);
	const { data, error: err } = await db
		.from('leads')
		.select('*')
		.order('lead_score', { ascending: false });
	if (err) throw error(500, err.message);
	const rows = data ?? [];
	const lines = [
		TSV_COLUMNS.join('\t'),
		...rows.map((r) =>
			TSV_COLUMNS.map((col) => String((r as Record<string, unknown>)[col] ?? '')).join('\t')
		)
	];
	return new Response(lines.join('\n'), {
		headers: {
			'Content-Type': 'text/tab-separated-values',
			'Content-Disposition': 'attachment; filename=leads.tsv'
		}
	});
};
