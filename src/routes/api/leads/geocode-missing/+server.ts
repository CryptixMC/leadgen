import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';
import { GOOGLE_PLACES_API_KEY } from '$env/static/private';

const PLACES_DETAIL_URL = 'https://maps.googleapis.com/maps/api/place/details/json';

class Semaphore {
	private queue: Array<() => void> = [];
	constructor(private permits: number) {}
	async acquire(): Promise<void> {
		if (this.permits > 0) { this.permits--; return; }
		await new Promise<void>((resolve) => this.queue.push(resolve));
	}
	release(): void {
		const next = this.queue.shift();
		if (next) next(); else this.permits++;
	}
}

export const POST: RequestHandler = async ({ locals }) => {
	if (locals.demo) return json({ geocoded: 0 });

	requireAuth(locals);
	if (!GOOGLE_PLACES_API_KEY) throw error(500, 'GOOGLE_PLACES_API_KEY not configured');

	const { data: rows } = await db
		.from('leads')
		.select('id, google_place_id')
		.is('latitude', null);

	const sem = new Semaphore(5);
	let geocoded = 0, failed = 0, skipped = 0;

	await Promise.all(
		(rows ?? []).map(async (row) => {
			if (!row.google_place_id) { skipped++; return; }
			await sem.acquire();
			try {
				const params = new URLSearchParams({
					place_id: row.google_place_id,
					fields: 'geometry',
					key: GOOGLE_PLACES_API_KEY
				});
				const resp = await fetch(`${PLACES_DETAIL_URL}?${params}`);
				const data = await resp.json();
				const loc = data?.result?.geometry?.location;
				if (loc?.lat != null && loc?.lng != null) {
					await db.from('leads').update({ latitude: loc.lat, longitude: loc.lng }).eq('id', row.id);
					geocoded++;
				} else {
					failed++;
				}
			} catch {
				failed++;
			} finally {
				sem.release();
			}
		})
	);

	return json({ geocoded, failed, skipped });
};
