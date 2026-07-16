import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Config } from '@sveltejs/adapter-vercel';
import { db } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';
import { findContact } from '$lib/server/enrichment';
import { calculateScore } from '$lib/server/scoring';
import { Semaphore } from '$lib/server/scraper';

export const config: Config = {
	maxDuration: 60
};

// Capped per call (unlike rescore's unbounded Promise.all) — findContact's own
// up-to-50s-per-lead budget means an uncapped batch would badly exceed Vercel's
// maxDuration for any realistic list length. The client loops, calling this
// repeatedly until `total` comes back 0, mirroring the existing per-lead
// quick/deep-scan progress-loop pattern in the dashboard.
const BATCH_SIZE = 15;

// Lower than rescore's Semaphore(20) — specifically to reduce how hard the
// Google-search-scrape fallback stage gets hit across concurrent leads, since
// that's the stage known to risk a CAPTCHA wall under load.
const CONCURRENCY = 5;

export const POST: RequestHandler = async ({ locals }) => {
	if (locals.demo) return json({ updated: 0, blocked: 0, total: 0 });

	requireAuth(locals);

	const { data: leads, error: err } = await db
		.from('leads')
		.select('*')
		.is('email', null)
		.eq('hidden', false)
		.eq('possible_bad_fit', false)
		.limit(BATCH_SIZE);
	if (err) throw error(500, err.message);

	const sem = new Semaphore(CONCURRENCY);
	const now = new Date().toISOString();
	let updated = 0;
	let blocked = 0;

	await Promise.all(
		(leads ?? []).map(async (lead) => {
			await sem.acquire();
			try {
				const contact = await findContact(lead as Record<string, unknown>);
				if (contact.googleBlocked) blocked++;
				if (!contact.email) return;

				const updates: Record<string, unknown> = {
					email: contact.email,
					email_unverified: contact.emailUnverified,
					last_updated: now
				};
				const merged = { ...(lead as Record<string, unknown>), ...updates };
				const [score, priority] = calculateScore(merged);
				updates.lead_score = score;
				updates.priority = priority;

				const { error: updateErr } = await db.from('leads').update(updates).eq('id', lead.id);
				if (updateErr) throw new Error(updateErr.message);
				updated++;
			} catch {
				// continue — matches rescore's swallow-and-continue pattern
			} finally {
				sem.release();
			}
		})
	);

	return json({ updated, blocked, total: leads?.length ?? 0 });
};
