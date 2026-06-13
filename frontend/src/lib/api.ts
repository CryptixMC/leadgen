import { env } from '$env/dynamic/public';

const BASE = env.PUBLIC_API_URL || 'http://localhost:8000';

export interface Lead {
	id: string;
	business_name: string;
	address: string;
	phone: string;
	website_url: string | null;
	google_place_id: string;
	google_rating: number;
	review_count: number;
	has_gbp: boolean;
	has_website: boolean;
	has_https: boolean;
	pagespeed_mobile: number | null;
	pagespeed_desktop: number | null;
	mobile_friendly: boolean | null;
	site_age_estimate: string | null;
	also_on_yelp: boolean | null;
	yelp_url: string | null;
	lead_score: number | null;
	priority: string | null;
	status: string;
	notes: string | null;
	created_at: string | null;
	last_updated: string | null;
}

function authHeaders(token?: string): Record<string, string> {
	if (!token) return {};
	return { Authorization: `Bearer ${token}` };
}

export async function fetchLeads(
	params: { status?: string; priority?: string } = {},
	fetchFn: typeof fetch = fetch,
	token?: string
): Promise<Lead[]> {
	const url = new URL(`${BASE}/leads`);
	if (params.status) url.searchParams.set('status', params.status);
	if (params.priority) url.searchParams.set('priority', params.priority);
	const res = await fetchFn(url.toString(), { headers: authHeaders(token) });
	if (!res.ok) throw new Error(`Failed to fetch leads: ${res.statusText}`);
	return res.json();
}

export async function fetchLead(
	id: string,
	fetchFn: typeof fetch = fetch,
	token?: string
): Promise<Lead> {
	const res = await fetchFn(`${BASE}/leads/${id}`, { headers: authHeaders(token) });
	if (!res.ok) throw new Error(`Failed to fetch lead: ${res.statusText}`);
	return res.json();
}

export async function updateLead(
	id: string,
	data: { status?: string; notes?: string },
	token?: string
): Promise<Lead> {
	const res = await fetch(`${BASE}/leads/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
		body: JSON.stringify(data)
	});
	if (!res.ok) throw new Error(`Failed to update lead: ${res.statusText}`);
	return res.json();
}

export async function triggerScrape(
	category: string,
	city: string,
	token?: string
): Promise<{ upserted: number; category: string; city: string }> {
	const res = await fetch(`${BASE}/scrapes`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
		body: JSON.stringify({ category, city })
	});
	if (!res.ok) throw new Error(`Scrape failed: ${res.statusText}`);
	return res.json();
}
