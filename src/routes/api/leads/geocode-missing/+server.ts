import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth';
import { geocodeMissingLeads, LeadOpError } from '$lib/server/leadOperations';

export const POST: RequestHandler = async ({ locals }) => {
	if (locals.demo) return json({ geocoded: 0 });

	requireAuth(locals);
	try {
		return json(await geocodeMissingLeads());
	} catch (e) {
		if (e instanceof LeadOpError) throw error(e.status, e.message);
		throw error(500, e instanceof Error ? e.message : 'Geocode failed');
	}
};
