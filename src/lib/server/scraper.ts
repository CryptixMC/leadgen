import { GOOGLE_PLACES_API_KEY } from '$env/static/private';
import { db } from './db.js';
import { isSocialMediaUrl } from './utils.js';
import {
	generateCoveringGrid,
	pointInPolygon,
	DEFAULT_CELL_RADIUS_M,
	MAX_GRID_CELLS,
	type LatLng
} from '$lib/geo';

const PLACES_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const PLACES_NEARBY_URL = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
const PLACES_DETAIL_URL = 'https://maps.googleapis.com/maps/api/place/details/json';
const DETAIL_FIELDS = 'name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,opening_hours,price_level,reviews,business_status';

// Place types that are not serviceable small businesses
const NON_BUSINESS_TYPES = new Set([
	'tourist_attraction',
	'natural_feature',
	'park',
	'campground',
	'cemetery',
	'amusement_park',
	'zoo',
	'aquarium',
	'museum',
	'stadium',
	'airport',
	'train_station',
	'transit_station',
	'bus_station',
	'subway_station',
	'light_rail_station',
	'ferry_terminal',
	'route',
	'political',
	'locality',
	'sublocality',
	'neighborhood',
	'colloquial_area',
	'country',
	'administrative_area_level_1',
	'administrative_area_level_2',
	'administrative_area_level_3',
	'premise',
	'street_address',
	'intersection',
	'postal_code',
	'landmark',
	'school',
	'primary_school',
	'secondary_school',
	'university',
	'preschool',
	'place_of_worship',
	'church',
	'mosque',
	'synagogue',
	'hindu_temple',
	'hospital',
	'city_hall',
	'courthouse',
	'embassy',
	'fire_station',
	'local_government_office',
	'police',
	'post_office',
]);

// Types that indicate a non-commercial place — filter these out in "all businesses" mode.
// Superset of NON_BUSINESS_TYPES plus a couple of gray-area types (real for-profit
// businesses, but not useful in a broad "all businesses" sweep).
const ALL_BUSINESSES_EXCLUDE_TYPES = new Set([...NON_BUSINESS_TYPES, 'library', 'funeral_home']);

// Google's `lodging` type covers hotels/motels/inns/extended-stay properties.
// Some extended-stay/serviced-apartment properties end up with one listing per
// room instead of one per property — this heuristic catches those without
// excluding legitimate hotels/motels/B&Bs (which aren't excluded by type).
const ROOM_LISTING_PATTERN = /\b(room|rm|unit|suite|ste|apt|apartment)\.?\s*#?\d+\b/i;

export interface NewLeadSummary {
	id: string;
	business_name: string;
	address: string;
	category: string | null;
	phone: string;
	google_place_id: string;
}

// Generic Google Places types that appear on almost every place regardless of
// business type — skipped when picking a per-lead category label.
const GENERIC_PLACE_TYPES = new Set([
	'point_of_interest',
	'establishment',
	'premise',
	'subpremise',
	'geocode',
]);

function deriveCategory(types: string[]): string | null {
	const first = types.find((t) => !GENERIC_PLACE_TYPES.has(t));
	if (!first) return null;
	return first
		.split('_')
		.map((w) => w[0].toUpperCase() + w.slice(1))
		.join(' ');
}

export class Semaphore {
	private queue: Array<() => void> = [];
	constructor(private permits: number) {}
	async acquire(): Promise<void> {
		if (this.permits > 0) {
			this.permits--;
			return;
		}
		await new Promise<void>((resolve) => this.queue.push(resolve));
	}
	release(): void {
		const next = this.queue.shift();
		if (next) next();
		else this.permits++;
	}
}

async function getWithBackoff(
	url: string,
	params: Record<string, string | number>,
	maxRetries = 5
): Promise<Record<string, unknown>> {
	const qs = new URLSearchParams(
		Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
	).toString();
	for (let attempt = 0; attempt < maxRetries; attempt++) {
		const resp = await fetch(`${url}?${qs}`);
		if (resp.status === 429) {
			const wait = 2 ** attempt * 1000 + Math.random() * 1000;
			await new Promise((r) => setTimeout(r, wait));
			continue;
		}
		if (!resp.ok) throw new Error(`Places API error: ${resp.status} ${resp.statusText}`);
		return resp.json();
	}
	throw new Error('Google Places API rate limit exceeded after retries');
}

async function fetchNearbyPage(
	apiKey: string,
	category: string,
	lat: number,
	lng: number,
	nextPageToken: string | null
): Promise<Record<string, unknown>> {
	if (nextPageToken) {
		const delays = [800, 1200, 1800, 2700, 4000];
		for (const delay of delays) {
			await new Promise((r) => setTimeout(r, delay));
			const data = await getWithBackoff(PLACES_NEARBY_URL, {
				pagetoken: nextPageToken,
				key: apiKey
			});
			if (data.status !== 'INVALID_REQUEST') return data;
		}
		throw new Error('Places API page token never became valid');
	}
	return getWithBackoff(PLACES_NEARBY_URL, {
		location: `${lat},${lng}`,
		radius: 50000,
		keyword: category,
		key: apiKey
	});
}

interface UpsertResult {
	success: boolean;
	newLead?: NewLeadSummary;
}

async function upsertPlace(place: Record<string, unknown>, apiKey: string): Promise<UpsertResult> {
	const placeId = place.place_id as string | undefined;
	if (!placeId) return { success: false };

	// Skip attractions, parks, transit stops, and other non-business place types
	const types = (place.types as string[] | undefined) ?? [];
	if (types.some((t) => NON_BUSINESS_TYPES.has(t))) return { success: false };

	const detailData = await getWithBackoff(PLACES_DETAIL_URL, {
		place_id: placeId,
		fields: DETAIL_FIELDS,
		key: apiKey
	});
	const detail = (detailData.result as Record<string, unknown>) ?? {};

	// Skip places that are closed — not a viable lead to contact right now
	const businessStatus = detail.business_status as string | undefined;
	if (businessStatus === 'CLOSED_PERMANENTLY' || businessStatus === 'CLOSED_TEMPORARILY') {
		return { success: false };
	}

	let website = (detail.website as string) || (place.website as string) || null;
	// If the GBP "website" field is actually a social media profile, capture it properly
	// instead of discarding it — enrichment will move it to the right platform field.
	const gbpSocialUrl = website && isSocialMediaUrl(website) ? website : null;
	if (gbpSocialUrl) website = null;
	const hasWebsite = Boolean(website);
	const hasHttps = website ? website.startsWith('https://') : false;

	const location = (place.geometry as Record<string, unknown>)?.location as
		| Record<string, number>
		| undefined;

	// Extract opening hours
	const openingHoursData = detail.opening_hours as Record<string, unknown> | undefined;
	const openingHours = (openingHoursData?.weekday_text as string[] | undefined) ?? null;

	// Extract price level
	const priceLevel = (detail.price_level as number | undefined) ?? null;

	// Extract review signals
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
			// Try to extract owner name from the reply text signature (e.g. "— Jane, Owner")
			if (!ownerName) {
				const replyText = (ownerReply.text as string) ?? '';
				const sigMatch = /[-–—]\s*([A-Z][a-z]+(?: [A-Z][a-z]+)?)\s*[,.]?\s*(?:owner|manager|proprietor)/i.exec(replyText);
				if (sigMatch) ownerName = sigMatch[1];
			}
		}
	}

	const ownerResponseRate = reviews.length > 0 ? ownerResponseCount / reviews.length : null;

	// Generate LinkedIn search URL if we have an owner name
	const businessName = (detail.name as string) || (place.name as string) || '';

	// Skip individual room/unit listings within a lodging property (Google
	// sometimes creates one Business Profile per room for extended-stay /
	// serviced-apartment properties) — legitimate hotels/motels are untouched.
	if (types.includes('lodging') && ROOM_LISTING_PATTERN.test(businessName)) {
		return { success: false };
	}

	const address = (detail.formatted_address as string) || (place.formatted_address as string) || '';
	const city = address.includes(',') ? address.split(',')[1].trim() : address;
	const linkedinSearchUrl = ownerName
		? `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(ownerName + ' ' + city)}`
		: null;

	const now = new Date().toISOString();
	const lead: Record<string, unknown> = {
		business_name: businessName,
		category: deriveCategory(types),
		address,
		phone: (detail.formatted_phone_number as string) || '',
		website_url: website,
		gbp_social_url: gbpSocialUrl,
		google_place_id: placeId,
		google_rating: (detail.rating as number) || (place.rating as number) || 0,
		review_count:
			(detail.user_ratings_total as number) || (place.user_ratings_total as number) || 0,
		has_gbp: true,
		has_website: hasWebsite,
		has_https: hasHttps,
		latitude: location?.lat ?? null,
		longitude: location?.lng ?? null,
		opening_hours: openingHours,
		price_level: priceLevel,
		last_review_date: lastReviewDate,
		owner_response_rate: ownerResponseRate,
		owner_name: ownerName,
		linkedin_search_url: linkedinSearchUrl,
		status: 'cold',
		last_updated: now
	};

	const existing = await db
		.from('leads')
		.select('id, hidden')
		.eq('google_place_id', placeId)
		.maybeSingle();
	if (existing.data) {
		if (existing.data.hidden) return { success: false };
		const { error: updateErr } = await db.from('leads').update(lead).eq('google_place_id', placeId);
		if (updateErr) throw new Error(`Failed to update lead: ${updateErr.message}`);
		return { success: true };
	}

	lead.created_at = now;
	const { data: insertedRow, error: insertErr } = await db
		.from('leads')
		.insert(lead)
		.select('id')
		.single();
	if (insertErr) throw new Error(`Failed to insert lead: ${insertErr.message}`);
	return {
		success: true,
		newLead: {
			id: insertedRow.id,
			business_name: businessName,
			address,
			category: lead.category as string | null,
			phone: lead.phone as string,
			google_place_id: placeId
		}
	};
}

export async function runScrape(
	category: string,
	city: string,
	target: number,
	neighborhood?: string
): Promise<{ upserted: number; category: string; city: string; pages_fetched: number; newLeads: NewLeadSummary[] }> {
	const apiKey = GOOGLE_PLACES_API_KEY;
	if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY not configured');

	const safeTarget = Math.max(1, target);
	let upserted = 0;
	let pagesFetched = 0;
	let seedLat: number | null = null;
	let seedLng: number | null = null;
	const newLeads: NewLeadSummary[] = [];

	const sem = new Semaphore(15);

	const upsertSafe = async (place: Record<string, unknown>): Promise<UpsertResult> => {
		if (!isCommercialPlace(place)) return { success: false };
		await sem.acquire();
		try {
			return await upsertPlace(place, apiKey);
		} catch (err) {
			console.error('upsertPlace failed:', err instanceof Error ? err.message : err);
			return { success: false };
		} finally {
			sem.release();
		}
	};

	const allBusinesses = !category || category === '*';

	function isCommercialPlace(place: Record<string, unknown>): boolean {
		if (!allBusinesses) return true;
		const types = (place.types as string[]) ?? [];
		return !types.some((t) => ALL_BUSINESSES_EXCLUDE_TYPES.has(t));
	}

	// Build the text search query — neighborhood-scoped if provided
	const locationLabel = neighborhood ? `${neighborhood}, ${city}` : city;
	const searchQuery = allBusinesses
		? `establishments in ${locationLabel}`
		: neighborhood
			? `${category} in ${neighborhood}, ${city}`
			: `${category} in ${city}`;

	// Fire neighborhood geocode and text search concurrently
	const geoPromise = neighborhood
		? getWithBackoff(PLACES_SEARCH_URL, { query: `${neighborhood}, ${city}`, key: apiKey })
				.then((geoData) => {
					const geoPlaces = (geoData.results as Array<Record<string, unknown>>) ?? [];
					if (!geoPlaces.length) return null;
					const loc = (geoPlaces[0].geometry as Record<string, unknown>)?.location as
						| Record<string, number>
						| undefined;
					return loc ? { lat: loc.lat, lng: loc.lng } : null;
				})
				.catch(() => null)
		: Promise.resolve(null);

	const [geoResult, searchData] = await Promise.all([
		geoPromise,
		getWithBackoff(PLACES_SEARCH_URL, { query: searchQuery, key: apiKey })
	]);

	if (geoResult) {
		seedLat = geoResult.lat;
		seedLng = geoResult.lng;
	}

	const status = searchData.status as string;
	if (status !== 'OK' && status !== 'ZERO_RESULTS') {
		throw new Error(`Places API error: ${status}`);
	}

	pagesFetched++;
	const places = (searchData.results as Array<Record<string, unknown>>) ?? [];

	if (places.length && seedLat === null) {
		const loc = (places[0].geometry as Record<string, unknown>)?.location as
			| Record<string, number>
			| undefined;
		seedLat = loc?.lat ?? null;
		seedLng = loc?.lng ?? null;
	}

	const batch = places.slice(0, safeTarget);
	const results = await Promise.all(batch.map(upsertSafe));
	upserted += results.filter((r) => r.success).length;
	for (const r of results) if (r.newLead) newLeads.push(r.newLead);

	if (upserted < safeTarget && seedLat !== null) {
		// Use tighter radius for neighborhood searches
		const radius = neighborhood ? 800 : 50000;
		let nextPageToken: string | null = null;
		let firstNearby = true;

		while (upserted < safeTarget) {
			const nearbyData = firstNearby
				? await getWithBackoff(PLACES_NEARBY_URL, {
						location: `${seedLat},${seedLng}`,
						radius,
						...(allBusinesses ? {} : { keyword: category }),
						key: apiKey
					})
				: await fetchNearbyPage(apiKey, category, seedLat, seedLng!, nextPageToken);
			firstNearby = false;

			const nearbyStatus = nearbyData.status as string;
			if (nearbyStatus !== 'OK' && nearbyStatus !== 'ZERO_RESULTS') {
				throw new Error(`Places API error: ${nearbyStatus}`);
			}

			pagesFetched++;
			const nearbyPlaces = (nearbyData.results as Array<Record<string, unknown>>) ?? [];
			const nearbyBatch = nearbyPlaces.slice(0, safeTarget - upserted);
			const nearbyResults = await Promise.all(nearbyBatch.map(upsertSafe));
			upserted += nearbyResults.filter((r) => r.success).length;
			for (const r of nearbyResults) if (r.newLead) newLeads.push(r.newLead);

			nextPageToken = (nearbyData.next_page_token as string) ?? null;
			if (!nextPageToken) break;
		}
	}

	return { upserted, category: allBusinesses ? 'all businesses' : category, city, pages_fetched: pagesFetched, newLeads };
}

const GRID_CELL_RADIUS_M = DEFAULT_CELL_RADIUS_M;
const MAX_PAGES_PER_CELL = 2;

/**
 * Google Places Nearby Search only supports center+radius queries, so an
 * arbitrary drawn polygon is covered by tiling its bounding box into a grid
 * of overlapping circles, then rejecting any result outside the polygon.
 */
export async function runScrapePolygon(
	category: string,
	polygon: LatLng[],
	target: number
): Promise<{ upserted: number; category: string; city: string; pages_fetched: number; newLeads: NewLeadSummary[] }> {
	const apiKey = GOOGLE_PLACES_API_KEY;
	if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY not configured');

	const cells = generateCoveringGrid(polygon, GRID_CELL_RADIUS_M);
	if (cells.length > MAX_GRID_CELLS) {
		throw new Error(
			`Drawn area is too large (~${cells.length} search cells, max ${MAX_GRID_CELLS}) — draw a smaller area`
		);
	}

	const safeTarget = Math.max(1, target);
	const allBusinesses = !category || category === '*';
	let upserted = 0;
	let pagesFetched = 0;
	const newLeads: NewLeadSummary[] = [];

	const upsertSem = new Semaphore(15);
	const cellSem = new Semaphore(3);
	const seenPlaceIds = new Set<string>();

	function isCommercialPlace(place: Record<string, unknown>): boolean {
		if (!allBusinesses) return true;
		const types = (place.types as string[]) ?? [];
		return !types.some((t) => ALL_BUSINESSES_EXCLUDE_TYPES.has(t));
	}

	const upsertSafe = async (place: Record<string, unknown>): Promise<UpsertResult> => {
		if (!isCommercialPlace(place)) return { success: false };
		await upsertSem.acquire();
		try {
			return await upsertPlace(place, apiKey);
		} finally {
			upsertSem.release();
		}
	};

	async function processCandidates(places: Array<Record<string, unknown>>): Promise<void> {
		const fresh: Array<Record<string, unknown>> = [];
		for (const place of places) {
			const placeId = place.place_id as string | undefined;
			if (!placeId || seenPlaceIds.has(placeId)) continue;
			seenPlaceIds.add(placeId);
			const location = (place.geometry as Record<string, unknown>)?.location as
				| Record<string, number>
				| undefined;
			if (!location || !pointInPolygon(location.lat, location.lng, polygon)) continue;
			fresh.push(place);
		}
		if (!fresh.length) return;
		const batch = fresh.slice(0, Math.max(0, safeTarget - upserted));
		const results = await Promise.all(batch.map(upsertSafe));
		upserted += results.filter((r) => r.success).length;
		for (const r of results) if (r.newLead) newLeads.push(r.newLead);
	}

	async function fetchNextCellPage(
		lat: number,
		lng: number,
		nextPageToken: string | null
	): Promise<Record<string, unknown>> {
		if (!nextPageToken) {
			return getWithBackoff(PLACES_NEARBY_URL, {
				location: `${lat},${lng}`,
				radius: GRID_CELL_RADIUS_M,
				...(allBusinesses ? {} : { keyword: category }),
				key: apiKey
			});
		}
		const delays = [800, 1200, 1800, 2700, 4000];
		for (const delay of delays) {
			await new Promise((r) => setTimeout(r, delay));
			const data = await getWithBackoff(PLACES_NEARBY_URL, { pagetoken: nextPageToken, key: apiKey });
			if (data.status !== 'INVALID_REQUEST') return data;
		}
		return { status: 'ZERO_RESULTS', results: [] };
	}

	async function scanCell([lat, lng]: LatLng): Promise<void> {
		if (upserted >= safeTarget) return;
		await cellSem.acquire();
		try {
			let nextPageToken: string | null = null;
			let page = 0;
			do {
				if (upserted >= safeTarget) break;
				const data = await fetchNextCellPage(lat, lng, nextPageToken);
				const status = data.status as string;
				if (status !== 'OK' && status !== 'ZERO_RESULTS') {
					throw new Error(`Places API error: ${status}`);
				}
				pagesFetched++;
				page++;
				const places = (data.results as Array<Record<string, unknown>>) ?? [];
				await processCandidates(places);
				nextPageToken = (data.next_page_token as string) ?? null;
			} while (nextPageToken && page < MAX_PAGES_PER_CELL);
		} finally {
			cellSem.release();
		}
	}

	await Promise.all(cells.map(scanCell));

	return {
		upserted,
		category: allBusinesses ? 'all businesses' : category,
		city: 'Custom drawn area',
		pages_fetched: pagesFetched,
		newLeads
	};
}

/** Geocodes free-text (address/neighborhood/city) to a point via Places Text Search. */
export async function geocodeLocation(query: string): Promise<{ lat: number; lng: number } | null> {
	const apiKey = GOOGLE_PLACES_API_KEY;
	if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY not configured');

	const data = await getWithBackoff(PLACES_SEARCH_URL, { query, key: apiKey });
	const status = data.status as string;
	if (status !== 'OK' && status !== 'ZERO_RESULTS') {
		throw new Error(`Places API error: ${status}`);
	}
	const places = (data.results as Array<Record<string, unknown>>) ?? [];
	if (!places.length) return null;
	const loc = (places[0].geometry as Record<string, unknown>)?.location as
		| Record<string, number>
		| undefined;
	return loc ? { lat: loc.lat, lng: loc.lng } : null;
}
