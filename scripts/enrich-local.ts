/**
 * Local enrichment script — run from your laptop to backfill new enrichment columns
 * for existing leads without consuming Vercel function time.
 *
 * Usage:
 *   cd /path/to/leadgen
 *   cp .env.local scripts/.env   # needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_PLACES_API_KEY
 *   npx tsx scripts/enrich-local.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '.env') });
// Fallback: also try repo-root .env
config({ path: resolve(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
	process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
const PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
	console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
	process.exit(1);
}
if (!PLACES_API_KEY) {
	console.error('Missing GOOGLE_PLACES_API_KEY');
	process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

const PLACES_DETAIL_URL = 'https://maps.googleapis.com/maps/api/place/details/json';
const DETAIL_FIELDS = 'opening_hours,price_level,reviews';
const CONCURRENCY = 10;

// ----- semaphore -----
class Semaphore {
	private queue: Array<() => void> = [];
	constructor(private permits: number) {}
	async acquire(): Promise<void> {
		if (this.permits > 0) { this.permits--; return; }
		await new Promise<void>((resolve) => this.queue.push(resolve));
	}
	release(): void {
		const next = this.queue.shift();
		if (next) next();
		else this.permits++;
	}
}

// ----- Places Details fetch with backoff -----
async function fetchPlaceDetails(placeId: string): Promise<Record<string, unknown> | null> {
	const params = new URLSearchParams({
		place_id: placeId,
		fields: DETAIL_FIELDS,
		key: PLACES_API_KEY!
	});

	for (let attempt = 0; attempt < 5; attempt++) {
		const resp = await fetch(`${PLACES_DETAIL_URL}?${params}`);
		if (resp.status === 429) {
			await new Promise((r) => setTimeout(r, 2 ** attempt * 1000 + Math.random() * 500));
			continue;
		}
		if (!resp.ok) return null;
		const data = await resp.json();
		if (data.status !== 'OK') return null;
		return (data.result as Record<string, unknown>) ?? null;
	}
	return null;
}

// ----- parse a detail result into new columns -----
function parseDetail(detail: Record<string, unknown>, lead: Record<string, unknown>): Record<string, unknown> {
	const openingHoursData = detail.opening_hours as Record<string, unknown> | undefined;
	const openingHours = (openingHoursData?.weekday_text as string[] | undefined) ?? null;
	const priceLevel = (detail.price_level as number | undefined) ?? null;

	const reviews = (detail.reviews as Array<Record<string, unknown>> | undefined) ?? [];
	let lastReviewDate: string | null = null;
	let ownerName: string | null = null;
	let ownerResponseCount = 0;

	for (const review of reviews) {
		const time = review.time as number | undefined;
		if (time) {
			const reviewDate = new Date(time * 1000).toISOString();
			if (!lastReviewDate || reviewDate > lastReviewDate) lastReviewDate = reviewDate;
		}
		const ownerReply = review.owner_response as Record<string, unknown> | undefined;
		if (ownerReply) {
			ownerResponseCount++;
			if (!ownerName) {
				const replyText = (ownerReply.text as string) ?? '';
				const sigMatch = /[-–—]\s*([A-Z][a-z]+(?: [A-Z][a-z]+)?)\s*[,.]?\s*(?:owner|manager|proprietor)/i.exec(replyText);
				if (sigMatch) ownerName = sigMatch[1];
			}
		}
	}

	const ownerResponseRate = reviews.length > 0 ? ownerResponseCount / reviews.length : null;

	const addr = (lead.address as string) ?? '';
	const city = addr.includes(',') ? addr.split(',')[1].trim() : addr;
	const linkedinSearchUrl = ownerName
		? `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(ownerName + ' ' + city)}`
		: null;

	// Social activity score from existing columns
	const socialFields = ['facebook_url', 'instagram_url', 'twitter_url', 'linkedin_url', 'tiktok_url', 'youtube_url'] as const;
	const socialActivityScore = socialFields.filter((f) => Boolean(lead[f])).length;

	return {
		opening_hours: openingHours,
		price_level: priceLevel,
		last_review_date: lastReviewDate,
		owner_response_rate: ownerResponseRate,
		owner_name: ownerName,
		linkedin_search_url: linkedinSearchUrl,
		social_activity_score: socialActivityScore,
		last_updated: new Date().toISOString()
	};
}

// ----- main -----
async function main() {
	console.log('Fetching leads missing new enrichment fields...');

	const { data: leads, error } = await db
		.from('leads')
		.select('id, google_place_id, address, facebook_url, instagram_url, twitter_url, linkedin_url, tiktok_url, youtube_url')
		.is('opening_hours', null)
		.not('google_place_id', 'like', 'manual_%')
		.order('created_at', { ascending: false });

	if (error) { console.error('Supabase fetch error:', error); process.exit(1); }
	if (!leads?.length) { console.log('Nothing to enrich.'); return; }

	console.log(`Found ${leads.length} leads to enrich.`);

	const sem = new Semaphore(CONCURRENCY);
	let done = 0;

	await Promise.all(leads.map(async (lead) => {
		await sem.acquire();
		try {
			const detail = await fetchPlaceDetails(lead.google_place_id);
			if (!detail) {
				console.warn(`  [skip] ${lead.id} — Places API returned nothing`);
				return;
			}
			const updates = parseDetail(detail, lead);
			const { error: upsertErr } = await db.from('leads').update(updates).eq('id', lead.id);
			if (upsertErr) console.warn(`  [error] ${lead.id}:`, upsertErr.message);
		} finally {
			done++;
			if (done % 10 === 0 || done === leads.length) {
				process.stdout.write(`\r  enriched ${done}/${leads.length}`);
			}
			sem.release();
		}
	}));

	console.log(`\nDone. Enriched ${done} leads.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
