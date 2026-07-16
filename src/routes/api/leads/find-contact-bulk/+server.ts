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
// up-to-30s-per-lead budget means an uncapped batch would badly exceed Vercel's
// maxDuration for any realistic list length. The client loops, calling this
// repeatedly until `total` comes back 0, mirroring the existing per-lead
// quick/deep-scan progress-loop pattern in the dashboard.
const BATCH_SIZE = 20;

// Lower than rescore's Semaphore(20) — specifically to reduce how hard the
// Google-search-scrape fallback stage gets hit across concurrent leads, since
// that's the stage known to risk a CAPTCHA wall under load. Raised from an
// initial 5 to 8 after real-run testing showed zero blocking at that
// concurrency across several hundred leads — still well below rescore's 20.
const CONCURRENCY = 8;

export const POST: RequestHandler = async ({ locals }) => {
	if (locals.demo) return json({ updated: 0, blocked: 0, total: 0 });

	requireAuth(locals);

	// Order by least-recently-touched first, and stamp last_updated on every lead this
	// batch processes below (success or fail) — without this, a cluster of genuinely
	// unfindable leads gets re-selected by every subsequent call forever, since a failed
	// attempt otherwise leaves no trace and the query has no way to move past them.
	const { data: leads, error: err } = await db
		.from('leads')
		.select('*')
		.is('email', null)
		.eq('hidden', false)
		.eq('possible_bad_fit', false)
		.order('last_updated', { ascending: true, nullsFirst: true })
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

				if (!contact.email) {
					await db.from('leads').update({ last_updated: now }).eq('id', lead.id);
					return;
				}

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
