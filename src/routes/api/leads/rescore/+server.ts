import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';
import { runEnrichment } from '$lib/server/enrichment';
import { calculateScore } from '$lib/server/scoring';
import { Semaphore } from '$lib/server/scraper';

export const POST: RequestHandler = async ({ locals }) => {
	if (locals.demo) return json({ rescored: 0 });

	requireAuth(locals);
	const { data: leads, error: err } = await db.from('leads').select('*');
	if (err) throw error(500, err.message);

	const now = new Date().toISOString();
	const sem = new Semaphore(5);
	let updated = 0;

	await Promise.all(
		(leads ?? []).map(async (lead) => {
			await sem.acquire();
			try {
				const enrichment = await runEnrichment(lead as Record<string, unknown>);
				const merged = { ...(lead as Record<string, unknown>), ...enrichment };
				const [score, priority] = calculateScore(merged);
				enrichment.lead_score = score;
				enrichment.priority = priority;
				enrichment.last_updated = now;
				await db.from('leads').update(enrichment).eq('id', lead.id);
				updated++;
			} catch {
				// continue
			} finally {
				sem.release();
			}
		})
	);

	return json({ updated, total: leads?.length ?? 0 });
};
