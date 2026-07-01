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
import { Semaphore } from '$lib/server/scraper';

const RESCORE_STALE_HOURS = 24;

export const POST: RequestHandler = async ({ locals, url }) => {
	if (locals.demo) return json({ rescored: 0 });

	requireAuth(locals);

	const force = url.searchParams.get('force') === 'true';
	let query = db.from('leads').select('*');
	if (!force) {
		const cutoff = new Date(Date.now() - RESCORE_STALE_HOURS * 3_600_000).toISOString();
		query = query.or(`last_updated.is.null,last_updated.lt.${cutoff}`);
	}

	const { data: leads, error: err } = await query;
	if (err) throw error(500, err.message);

	const now = new Date().toISOString();
	const sem = new Semaphore(20);
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
				const { error: updateErr } = await db.from('leads').update(enrichment).eq('id', lead.id);
				if (updateErr) throw new Error(updateErr.message);
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
