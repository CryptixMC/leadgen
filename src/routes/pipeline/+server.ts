import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';

const VALID_STATUSES = new Set(['cold', 'contacted', 'proposal', 'closed_won', 'closed_lost']);

export const PATCH: RequestHandler = async ({ locals, request }) => {
	requireAuth(locals);
	const { id, status } = await request.json();
	if (!id || !VALID_STATUSES.has(status)) throw error(400, 'Invalid id or status');
	const { data, error: err } = await db
		.from('leads')
		.update({ status, last_updated: new Date().toISOString() })
		.eq('id', id)
		.select()
		.single();
	if (err || !data) throw error(500, err?.message ?? 'DB error');
	return json(data);
};
