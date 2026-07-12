import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth';
import { rescoreLeads, LeadOpError } from '$lib/server/leadOperations';

export const POST: RequestHandler = async ({ locals, url }) => {
	if (locals.demo) return json({ rescored: 0 });

	requireAuth(locals);
	try {
		const force = url.searchParams.get('force') === 'true';
		return json(await rescoreLeads({ force }));
	} catch (e) {
		if (e instanceof LeadOpError) throw error(e.status, e.message);
		throw error(500, e instanceof Error ? e.message : 'Rescore failed');
	}
};
