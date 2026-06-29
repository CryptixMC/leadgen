const BASE = '/api';

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
	email: string | null;
	website_inferred: boolean | null;
	website_screenshot: string | null;
	pagespeed_seo: number | null;
	pagespeed_best_practices: number | null;
	lead_score: number | null;
	priority: string | null;
	status: string;
	latitude: number | null;
	longitude: number | null;
	notes: string | null;
	hidden: boolean;
	created_at: string | null;
	last_updated: string | null;
}

export interface Client {
	id: string;
	lead_id: string | null;
	business_name: string;
	contact_name: string | null;
	phone: string | null;
	email: string | null;
	address: string | null;
	service_website: boolean;
	service_tools: boolean;
	service_hosting: boolean;
	mrr: number;
	project_value: number;
	contract_start: string | null;
	notes: string | null;
	created_at: string;
}

export async function fetchLeads(
	params: { status?: string; priority?: string } = {},
	fetchFn: typeof fetch = fetch
): Promise<Lead[]> {
	const url = new URL(`${BASE}/leads`, 'http://localhost');
	if (params.status) url.searchParams.set('status', params.status);
	if (params.priority) url.searchParams.set('priority', params.priority);
	const res = await fetchFn(url.pathname + url.search);
	if (!res.ok) throw new Error(`Failed to fetch leads: ${res.statusText}`);
	return res.json();
}

export async function fetchLead(id: string, fetchFn: typeof fetch = fetch): Promise<Lead> {
	const res = await fetchFn(`${BASE}/leads/${id}`);
	if (!res.ok) throw new Error(`Failed to fetch lead: ${res.statusText}`);
	return res.json();
}

export async function hideLead(id: string): Promise<Lead> {
	const res = await fetch(`${BASE}/leads/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ hidden: true })
	});
	if (!res.ok) throw new Error(`Failed to hide lead: ${res.statusText}`);
	return res.json();
}

export async function batchHideLeads(ids: string[]): Promise<{ hidden: number }> {
	const res = await fetch(`${BASE}/leads`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ ids, hidden: true })
	});
	if (!res.ok) throw new Error(`Failed to batch hide leads: ${res.statusText}`);
	return res.json();
}

export async function updateLead(
	id: string,
	data: { status?: string; notes?: string }
): Promise<Lead> {
	const res = await fetch(`${BASE}/leads/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data)
	});
	if (!res.ok) throw new Error(`Failed to update lead: ${res.statusText}`);
	return res.json();
}

export async function geocodeMissing(): Promise<{
	geocoded: number;
	failed: number;
	skipped: number;
}> {
	const res = await fetch(`${BASE}/leads/geocode-missing`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' }
	});
	if (!res.ok) throw new Error(`Geocode failed: ${res.statusText}`);
	return res.json();
}

export async function rescoreLeads(): Promise<{ updated: number; total: number }> {
	const res = await fetch(`${BASE}/leads/rescore`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' }
	});
	if (!res.ok) throw new Error(`Rescore failed: ${res.statusText}`);
	return res.json();
}

export async function deleteLead(id: string): Promise<void> {
	const res = await fetch(`${BASE}/leads/${id}`, { method: 'DELETE' });
	if (!res.ok && res.status !== 204) throw new Error(`Failed to delete lead: ${res.statusText}`);
}

export async function enrichLead(id: string): Promise<Lead> {
	const res = await fetch(`${BASE}/leads/${id}/enrich`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' }
	});
	if (!res.ok) throw new Error(`Enrich failed: ${res.statusText}`);
	return res.json();
}

export async function batchDeleteLeads(ids: string[]): Promise<{ deleted: number }> {
	const res = await fetch(`${BASE}/leads`, {
		method: 'DELETE',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ ids })
	});
	if (!res.ok) throw new Error(`Failed to batch delete: ${res.statusText}`);
	return res.json();
}

export async function createLead(payload: Record<string, unknown>): Promise<Lead> {
	const res = await fetch(`${BASE}/leads`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	});
	if (!res.ok) throw new Error(`Failed to create lead: ${res.statusText}`);
	return res.json();
}

export async function triggerScrape(
	category: string,
	city: string,
	target: number
): Promise<{ upserted: number; category: string; city: string; pages_fetched: number }> {
	const res = await fetch(`${BASE}/scrapes`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ category, city, target })
	});
	if (!res.ok) throw new Error(`Scrape failed: ${res.statusText}`);
	return res.json();
}

export async function sendLeadEmail(
	id: string,
	payload: { subject: string; emailBody: string; markContacted: boolean }
): Promise<Lead> {
	const res = await fetch(`${BASE}/leads/${id}/send-email`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	});
	if (!res.ok) {
		const detail = await res.text().catch(() => res.statusText);
		throw new Error(`Send failed: ${detail}`);
	}
	return res.json();
}

export interface GenerateEmailRequest {
	templateSubject: string;
	templateBody: string;
	senderName: string;
	extraContext?: string;
}

export interface GeneratedEmail {
	subject: string;
	body: string;
}

export async function generateEmail(
	id: string,
	payload: GenerateEmailRequest
): Promise<GeneratedEmail> {
	const res = await fetch(`${BASE}/leads/${id}/generate-email`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	});
	if (!res.ok) {
		const detail = await res.text().catch(() => res.statusText);
		throw new Error(`AI generation failed: ${detail}`);
	}
	return res.json();
}

