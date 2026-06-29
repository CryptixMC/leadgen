import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';
import { calculateScore } from '$lib/server/scoring';

export const GET: RequestHandler = async ({ locals, url }) => {
	requireAuth(locals);
	let query = db.from('leads').select('*').order('lead_score', { ascending: false });
	const status = url.searchParams.get('status');
	const priority = url.searchParams.get('priority');
	if (status) query = query.eq('status', status);
	if (priority) query = query.eq('priority', priority);
	const { data, error: err } = await query;
	if (err) throw error(500, err.message);
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ locals, request }) => {
	requireAuth(locals);
	const payload = await request.json();
	const now = new Date().toISOString();
	const hasWebsite = Boolean(payload.website_url);
	const hasHttps = hasWebsite && String(payload.website_url).startsWith('https://');

	const lead: Record<string, unknown> = {
		business_name: payload.business_name,
		address: payload.address ?? null,
		phone: payload.phone ?? null,
		website_url: payload.website_url ?? null,
		email: payload.email ?? null,
		google_rating: payload.google_rating ?? 0,
		review_count: payload.review_count ?? 0,
		notes: payload.notes ?? null,
		google_place_id: `manual_${crypto.randomUUID()}`,
		has_website: hasWebsite,
		has_https: hasHttps,
		has_gbp: false,
		status: 'cold',
		created_at: now,
		last_updated: now
	};
	const [score, priority] = calculateScore(lead);
	lead.lead_score = score;
	lead.priority = priority;

	const { data, error: err } = await db.from('leads').insert(lead).select().single();
	if (err) throw error(500, err.message);
	return json(data, { status: 201 });
};

export const DELETE: RequestHandler = async ({ locals, request }) => {
	requireAuth(locals);
	const { ids } = await request.json();
	if (!ids?.length) throw error(400, 'No IDs provided');
	const { error: err } = await db.from('leads').delete().in('id', ids);
	if (err) throw error(500, err.message);
	return json({ deleted: ids.length });
};
