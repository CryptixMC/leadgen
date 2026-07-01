import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Config } from '@sveltejs/adapter-vercel';
import { requireAuth } from '$lib/server/auth';

export const config: Config = {
	maxDuration: 60
};
import { runScrape } from '$lib/server/scraper';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (locals.demo) return json({ inserted: 0, skipped: 0, message: 'Demo mode — scraping disabled' });

	requireAuth(locals);
	const { category = '', city, target = 60, neighborhood } = await request.json();
	if (!city) throw error(400, 'city is required');

	try {
		const result = await runScrape(String(category), String(city), Number(target), neighborhood ? String(neighborhood) : undefined);
		return json(result);
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Scrape failed';
		throw error(502, msg);
	}
};
