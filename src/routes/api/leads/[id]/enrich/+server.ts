import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth';
import { enrichLead, LeadOpError } from '$lib/server/leadOperations';

export const POST: RequestHandler = async ({ locals, params, url }) => {
	if (locals.demo) return json({ ok: true });

	requireAuth(locals);
	try {
		const deep = url.searchParams.get('deep') === 'true';
		return json(await enrichLead(params.id, { deep }));
	} catch (e) {
		if (e instanceof LeadOpError) throw error(e.status, e.message);
		throw error(500, e instanceof Error ? e.message : 'Enrichment failed');
	}
};
