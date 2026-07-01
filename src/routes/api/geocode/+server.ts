import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth';
import { geocodeLocation } from '$lib/server/scraper';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (locals.demo) return json(null);

	requireAuth(locals);
	const query = url.searchParams.get('query');
	if (!query?.trim()) throw error(400, 'query is required');

	try {
		const result = await geocodeLocation(query.trim());
		return json(result);
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Geocode failed';
		throw error(502, msg);
	}
};
