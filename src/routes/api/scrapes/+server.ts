import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth';
import { runScrape, runScrapePolygon } from '$lib/server/scraper';
import type { LatLng } from '$lib/geo';

function isValidPolygon(polygon: unknown): polygon is LatLng[] {
	return (
		Array.isArray(polygon) &&
		polygon.length >= 3 &&
		polygon.every(
			(p) =>
				Array.isArray(p) &&
				p.length === 2 &&
				p.every((n) => typeof n === 'number' && Number.isFinite(n))
		)
	);
}

export const POST: RequestHandler = async ({ locals, request }) => {
	if (locals.demo) return json({ inserted: 0, skipped: 0, message: 'Demo mode — scraping disabled' });

	requireAuth(locals);
	const { category = '', city, target = 60, neighborhood, polygon } = await request.json();

	try {
		if (polygon !== undefined) {
			if (!isValidPolygon(polygon)) throw error(400, 'polygon must be an array of at least 3 [lat, lng] pairs');
			const result = await runScrapePolygon(String(category), polygon, Number(target));
			return json(result);
		}
		if (!city) throw error(400, 'city or polygon is required');
		const result = await runScrape(String(category), String(city), Number(target), neighborhood ? String(neighborhood) : undefined);
		return json(result);
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		const msg = e instanceof Error ? e.message : 'Scrape failed';
		throw error(502, msg);
	}
};
