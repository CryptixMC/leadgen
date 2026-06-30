import { GOOGLE_PLACES_API_KEY } from '$env/static/private';
import { db } from './db.js';
import { isSocialMediaUrl } from './utils.js';

const PLACES_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const PLACES_NEARBY_URL = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
const PLACES_DETAIL_URL = 'https://maps.googleapis.com/maps/api/place/details/json';
const DETAIL_FIELDS = 'name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,opening_hours,price_level,reviews';

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
]);

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
		for (let i = 0; i < 8; i++) {
			await new Promise((r) => setTimeout(r, 3000));
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

async function upsertPlace(place: Record<string, unknown>, apiKey: string): Promise<boolean> {
	const placeId = place.place_id as string | undefined;
	if (!placeId) return false;

	// Skip attractions, parks, transit stops, and other non-business place types
	const types = (place.types as string[] | undefined) ?? [];
	if (types.some((t) => NON_BUSINESS_TYPES.has(t))) return false;

	const detailData = await getWithBackoff(PLACES_DETAIL_URL, {
		place_id: placeId,
		fields: DETAIL_FIELDS,
		key: apiKey
	});
	const detail = (detailData.result as Record<string, unknown>) ?? {};

	let website = (detail.website as string) || (place.website as string) || null;
	if (isSocialMediaUrl(website)) website = null;
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
	const address = (detail.formatted_address as string) || (place.formatted_address as string) || '';
	const city = address.includes(',') ? address.split(',')[1].trim() : address;
	const linkedinSearchUrl = ownerName
		? `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(ownerName + ' ' + city)}`
		: null;

	const now = new Date().toISOString();
	const lead: Record<string, unknown> = {
		business_name: businessName,
		address,
		phone: (detail.formatted_phone_number as string) || '',
		website_url: website,
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
		if (existing.data.hidden) return false;
		await db.from('leads').update(lead).eq('google_place_id', placeId);
	} else {
		lead.created_at = now;
		await db.from('leads').insert(lead);
	}
	return true;
}

export async function runScrape(
	category: string,
	city: string,
	target: number
): Promise<{ upserted: number; category: string; city: string; pages_fetched: number }> {
	const apiKey = GOOGLE_PLACES_API_KEY;
	if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY not configured');

	const safeTarget = Math.max(1, target);
	let upserted = 0;
	let pagesFetched = 0;
	let cityLat: number | null = null;
	let cityLng: number | null = null;

	const sem = new Semaphore(8);

	const upsertSafe = async (place: Record<string, unknown>): Promise<boolean> => {
		await sem.acquire();
		try {
			return await upsertPlace(place, apiKey);
		} finally {
			sem.release();
		}
	};

	const searchData = await getWithBackoff(PLACES_SEARCH_URL, {
		query: `${category} in ${city}`,
		key: apiKey
	});

	const status = searchData.status as string;
	if (status !== 'OK' && status !== 'ZERO_RESULTS') {
		throw new Error(`Places API error: ${status}`);
	}

	pagesFetched++;
	const places = (searchData.results as Array<Record<string, unknown>>) ?? [];

	if (places.length) {
		const loc = (places[0].geometry as Record<string, unknown>)?.location as
			| Record<string, number>
			| undefined;
		cityLat = loc?.lat ?? null;
		cityLng = loc?.lng ?? null;
	}

	const batch = places.slice(0, safeTarget);
	const results = await Promise.all(batch.map(upsertSafe));
	upserted += results.filter(Boolean).length;

	if (upserted < safeTarget && cityLat !== null) {
		let nextPageToken: string | null = null;
		let firstNearby = true;

		while (upserted < safeTarget) {
			const nearbyData = await fetchNearbyPage(
				apiKey,
				category,
				cityLat,
				cityLng!,
				firstNearby ? null : nextPageToken
			);
			firstNearby = false;

			const nearbyStatus = nearbyData.status as string;
			if (nearbyStatus !== 'OK' && nearbyStatus !== 'ZERO_RESULTS') {
				throw new Error(`Places API error: ${nearbyStatus}`);
			}

			pagesFetched++;
			const nearbyPlaces = (nearbyData.results as Array<Record<string, unknown>>) ?? [];
			const nearbyBatch = nearbyPlaces.slice(0, safeTarget - upserted);
			const nearbyResults = await Promise.all(nearbyBatch.map(upsertSafe));
			upserted += nearbyResults.filter(Boolean).length;

			nextPageToken = (nearbyData.next_page_token as string) ?? null;
			if (!nextPageToken) break;
		}
	}

	return { upserted, category, city, pages_fetched: pagesFetched };
}
