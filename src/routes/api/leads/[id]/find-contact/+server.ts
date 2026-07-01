import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Config } from '@sveltejs/adapter-vercel';
import { db } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';
import { findContact } from '$lib/server/enrichment';
import { calculateScore } from '$lib/server/scoring';

export const config: Config = {
	maxDuration: 60
};

export const POST: RequestHandler = async ({ locals, params }) => {
	if (locals.demo) return json({ ok: true });

	requireAuth(locals);
	const { data: lead, error: err } = await db
		.from('leads')
		.select('*')
		.eq('id', params.id)
		.single();
	if (err || !lead) throw error(404, 'Lead not found');

	let contact: { email: string | null; phone: string | null };
	try {
		contact = await findContact(lead as Record<string, unknown>);
	} catch (e) {
		console.error('findContact failed:', e);
		throw error(500, 'Find contact timed out or failed');
	}

	const updates: Record<string, unknown> = {};
	if (contact.email && !lead.email) updates.email = contact.email;
	if (contact.phone && !lead.phone) updates.phone = contact.phone;

	if (Object.keys(updates).length === 0) {
		return json(lead);
	}

	updates.last_updated = new Date().toISOString();
	const merged = { ...(lead as Record<string, unknown>), ...updates };
	const [score, priority] = calculateScore(merged);
	updates.lead_score = score;
	updates.priority = priority;

	const { data: updated, error: updateErr } = await db
		.from('leads')
		.update(updates)
		.eq('id', params.id)
		.select()
		.single();
	if (updateErr || !updated) throw error(500, 'Failed to update lead after contact search');
	return json(updated);
};
