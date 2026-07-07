import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth';
import { DEMO_LEADS } from '$lib/demo/data';
import { getLead, updateLead, deleteLeads, LeadOpError } from '$lib/server/leadOperations';

function handleOpError(e: unknown): never {
	if (e instanceof LeadOpError) throw error(e.status, e.message);
	throw error(500, e instanceof Error ? e.message : 'Request failed');
}

export const GET: RequestHandler = async ({ locals, params }) => {
	if (locals.demo) {
		const lead = DEMO_LEADS.find((l) => l.id === params.id);
		if (!lead) throw error(404, 'Lead not found');
		return json(lead);
	}

	requireAuth(locals);
	try {
		return json(await getLead(params.id));
	} catch (e) {
		handleOpError(e);
	}
};

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (locals.demo) {
		const lead = DEMO_LEADS.find((l) => l.id === params.id);
		if (!lead) throw error(404, 'Lead not found');
		return json(lead);
	}

	requireAuth(locals);
	try {
		const payload = await request.json();
		return json(await updateLead(params.id, payload));
	} catch (e) {
		handleOpError(e);
	}
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (locals.demo) return new Response(null, { status: 204 });

	requireAuth(locals);
	try {
		await deleteLeads([params.id]);
	} catch (e) {
		handleOpError(e);
	}
	return new Response(null, { status: 204 });
};
