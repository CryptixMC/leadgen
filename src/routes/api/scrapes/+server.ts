import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth';
import { runScrape } from '$lib/server/scraper';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (locals.demo) return json({ inserted: 0, skipped: 0, message: 'Demo mode — scraping disabled' });

	requireAuth(locals);
	const { category, city, target = 60 } = await request.json();
	if (!category || !city) throw error(400, 'category and city are required');

	try {
		const result = await runScrape(String(category), String(city), Number(target));
		return json(result);
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Scrape failed';
		throw error(502, msg);
	}
};
