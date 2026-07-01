import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Config } from '@sveltejs/adapter-vercel';
import { db } from '$lib/server/db';

export const config: Config = {
	maxDuration: 60
};
import { requireAuth } from '$lib/server/auth';
import { runEnrichment } from '$lib/server/enrichment';
import { calculateScore } from '$lib/server/scoring';

export const POST: RequestHandler = async ({ locals, params, url }) => {
	if (locals.demo) return json({ ok: true });

	requireAuth(locals);
	const { data: lead, error: err } = await db
		.from('leads')
		.select('*')
		.eq('id', params.id)
		.single();
	if (err || !lead) throw error(404, 'Lead not found');

	const deep = url.searchParams.get('deep') === 'true';
	const enrichment = await runEnrichment(lead as Record<string, unknown>, { deep });
	const merged = { ...(lead as Record<string, unknown>), ...enrichment };
	const [score, priority] = calculateScore(merged);
	enrichment.lead_score = score;
	enrichment.priority = priority;
	enrichment.last_updated = new Date().toISOString();

	const { data: updated, error: updateErr } = await db
		.from('leads')
		.update(enrichment)
		.eq('id', params.id)
		.select()
		.single();
	if (updateErr || !updated) throw error(500, 'Failed to update lead after enrichment');
	return json(updated);
};
