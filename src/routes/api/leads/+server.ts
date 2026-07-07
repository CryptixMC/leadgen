import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth';
import { DEMO_LEADS } from '$lib/demo/data';
import { listLeads, createLead, deleteLeads, LeadOpError } from '$lib/server/leadOperations';
import { db } from '$lib/server/db';

function handleOpError(e: unknown): never {
	if (e instanceof LeadOpError) throw error(e.status, e.message);
	throw error(500, e instanceof Error ? e.message : 'Request failed');
}

export const GET: RequestHandler = async ({ locals, url }) => {
	if (locals.demo) {
		const status = url.searchParams.get('status');
		const priority = url.searchParams.get('priority');
		let leads = DEMO_LEADS.filter((l) => !l.hidden);
		if (status) leads = leads.filter((l) => l.status === status);
		if (priority) leads = leads.filter((l) => l.priority === priority);
		return json(leads);
	}

	requireAuth(locals);
	try {
		const leads = await listLeads({
			status: url.searchParams.get('status') ?? undefined,
			priority: url.searchParams.get('priority') ?? undefined,
			includeHidden: url.searchParams.get('include_hidden') === 'true'
		});
		return json(leads);
	} catch (e) {
		handleOpError(e);
	}
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (locals.demo) return json({ ok: true }, { status: 201 });

	requireAuth(locals);
	try {
		const payload = await request.json();
		const lead = await createLead(payload);
		return json(lead, { status: 201 });
	} catch (e) {
		handleOpError(e);
	}
};

export const PATCH: RequestHandler = async ({ locals, request }) => {
	if (locals.demo) return json({ ok: true });

	requireAuth(locals);
	const { ids, hidden } = await request.json();
	if (!ids?.length) throw error(400, 'No IDs provided');
	const updateData: Record<string, unknown> = {};
	if (hidden !== undefined) updateData.hidden = Boolean(hidden);
	if (!Object.keys(updateData).length) throw error(400, 'No updatable fields provided');
	updateData.last_updated = new Date().toISOString();
	const { error: err } = await db.from('leads').update(updateData).in('id', ids);
	if (err) throw error(500, err.message);
	return json({ hidden: ids.length });
};

export const DELETE: RequestHandler = async ({ locals, request }) => {
	if (locals.demo) return json({ ok: true });

	requireAuth(locals);
	try {
		const { ids } = await request.json();
		const result = await deleteLeads(ids);
		return json(result);
	} catch (e) {
		handleOpError(e);
	}
};
