import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';

export const GET: RequestHandler = async ({ locals, params }) => {
	requireAuth(locals);
	const { data, error: err } = await db
		.from('leads')
		.select('*')
		.eq('id', params.id)
		.single();
	if (err || !data) throw error(404, 'Lead not found');
	return json(data);
};

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	requireAuth(locals);
	const payload = await request.json();
	const updateData: Record<string, unknown> = {};
	if (payload.status !== undefined) updateData.status = payload.status;
	if (payload.notes !== undefined) updateData.notes = payload.notes;
	if (!Object.keys(updateData).length) throw error(400, 'No updatable fields provided');
	updateData.last_updated = new Date().toISOString();

	const { data, error: err } = await db
		.from('leads')
		.update(updateData)
		.eq('id', params.id)
		.select()
		.single();
	if (err || !data) throw error(404, 'Lead not found');
	return json(data);
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	requireAuth(locals);
	await db.from('leads').delete().eq('id', params.id);
	return new Response(null, { status: 204 });
};
