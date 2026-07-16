import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth';
import { detectBadFitLeads } from '$lib/server/badfit';

export const POST: RequestHandler = async ({ locals }) => {
	if (locals.demo) return json({ flagged: 0, checked: 0 });

	requireAuth(locals);
	const result = await detectBadFitLeads();
	return json(result);
};
