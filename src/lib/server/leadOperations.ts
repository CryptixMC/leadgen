import { db } from './db';
import { calculateScore } from './scoring';
import { normalizeWebsiteUrl } from './utils';
import { runEnrichment } from './enrichment';
import { Semaphore } from './scraper';
import { generateEmail as callGemini } from './gemini';
import { sendEmail } from './email';
import { fillTemplate } from '$lib/emailTemplates';
import { GOOGLE_PLACES_API_KEY } from '$env/static/private';
import type { Lead } from '$lib/api';

const PLACES_DETAIL_URL = 'https://maps.googleapis.com/maps/api/place/details/json';
const RESCORE_STALE_HOURS = 24;

export class LeadOpError extends Error {
	constructor(
		message: string,
		public status = 400
	) {
		super(message);
	}
}

export async function listLeads(opts: {
	status?: string;
	priority?: string;
	includeHidden?: boolean;
}): Promise<Lead[]> {
	let query = db.from('leads').select('*').order('lead_score', { ascending: false });
	if (opts.status) query = query.eq('status', opts.status);
	if (opts.priority) query = query.eq('priority', opts.priority);
	if (!opts.includeHidden) query = query.eq('hidden', false);
	const { data, error: err } = await query;
	if (err) throw new LeadOpError(err.message, 500);
	return (data ?? []) as Lead[];
}

export async function getLead(id: string): Promise<Lead> {
	const { data, error: err } = await db.from('leads').select('*').eq('id', id).single();
	if (err || !data) throw new LeadOpError('Lead not found', 404);
	return data as Lead;
}

export async function createLead(payload: Record<string, unknown>): Promise<Lead> {
	const now = new Date().toISOString();

	const businessName = String(payload.business_name ?? '').trim();
	if (!businessName) throw new LeadOpError('Business name is required', 400);

	let websiteUrl: string | null;
	try {
		websiteUrl = normalizeWebsiteUrl(payload.website_url as string | null | undefined);
	} catch (e) {
		throw new LeadOpError(e instanceof Error ? e.message : 'Invalid website URL', 400);
	}
	const hasWebsite = Boolean(websiteUrl);
	const hasHttps = hasWebsite && String(websiteUrl).startsWith('https://');

	const lead: Record<string, unknown> = {
		business_name: businessName,
		address: payload.address ?? null,
		phone: payload.phone ?? null,
		website_url: websiteUrl,
		email: payload.email ?? null,
		google_rating: payload.google_rating ?? 0,
		review_count: payload.review_count ?? 0,
		notes: payload.notes ?? null,
		google_place_id: `manual_${crypto.randomUUID()}`,
		has_website: hasWebsite,
		has_https: hasHttps,
		has_gbp: false,
		status: 'cold',
		created_at: now,
		last_updated: now
	};
	const [score, priority] = calculateScore(lead);
	lead.lead_score = score;
	lead.priority = priority;

	const { data, error: err } = await db.from('leads').insert(lead).select().single();
	if (err) throw new LeadOpError(err.message, 500);
	return data as Lead;
}

export async function updateLead(id: string, payload: Record<string, unknown>): Promise<Lead> {
	const updateData: Record<string, unknown> = {};
	if (payload.status !== undefined) updateData.status = payload.status;
	if (payload.notes !== undefined) updateData.notes = payload.notes;
	if (payload.hidden !== undefined) updateData.hidden = Boolean(payload.hidden);
	if (payload.business_name !== undefined) {
		const businessName = String(payload.business_name).trim();
		if (!businessName) throw new LeadOpError('Business name is required', 400);
		updateData.business_name = businessName;
	}
	if (payload.address !== undefined) updateData.address = payload.address || null;
	if (payload.phone !== undefined) updateData.phone = payload.phone || null;
	if (payload.email !== undefined) updateData.email = payload.email || null;
	if (payload.website_url !== undefined) {
		let websiteUrl: string | null;
		try {
			websiteUrl = normalizeWebsiteUrl(payload.website_url as string | null | undefined);
		} catch (e) {
			throw new LeadOpError(e instanceof Error ? e.message : 'Invalid website URL', 400);
		}
		updateData.website_url = websiteUrl;
		updateData.has_website = Boolean(websiteUrl);
		updateData.has_https = websiteUrl != null && websiteUrl.startsWith('https://');
	}
	if (!Object.keys(updateData).length) throw new LeadOpError('No updatable fields provided', 400);
	updateData.last_updated = new Date().toISOString();

	if (updateData.website_url !== undefined || updateData.email !== undefined) {
		const { data: existing } = await db.from('leads').select('*').eq('id', id).single();
		if (existing) {
			const [score, priority] = calculateScore({ ...existing, ...updateData });
			updateData.lead_score = score;
			updateData.priority = priority;
		}
	}

	const { data, error: err } = await db
		.from('leads')
		.update(updateData)
		.eq('id', id)
		.select()
		.single();
	if (err || !data) throw new LeadOpError('Lead not found', 404);

	if (payload.status === 'closed_won') {
		const { data: existing } = await db
			.from('clients')
			.select('id')
			.eq('lead_id', id)
			.maybeSingle();
		if (!existing) {
			await db.from('clients').insert({
				lead_id: data.id,
				business_name: data.business_name,
				phone: data.phone ?? null,
				address: data.address ?? null
			});
		}
	}

	return data as Lead;
}

export async function deleteLeads(ids: string[]): Promise<{ deleted: number }> {
	if (!ids?.length) throw new LeadOpError('No IDs provided', 400);
	const { error: err } = await db.from('leads').delete().in('id', ids);
	if (err) throw new LeadOpError(err.message, 500);
	return { deleted: ids.length };
}

export async function enrichLead(id: string, opts: { deep?: boolean }): Promise<Lead> {
	const { data: lead, error: err } = await db.from('leads').select('*').eq('id', id).single();
	if (err || !lead) throw new LeadOpError('Lead not found', 404);

	const enrichment = await runEnrichment(lead as Record<string, unknown>, { deep: opts.deep });
	const merged = { ...(lead as Record<string, unknown>), ...enrichment };
	const [score, priority] = calculateScore(merged);
	enrichment.lead_score = score;
	enrichment.priority = priority;
	enrichment.last_updated = new Date().toISOString();

	const { data: updated, error: updateErr } = await db
		.from('leads')
		.update(enrichment)
		.eq('id', id)
		.select()
		.single();
	if (updateErr || !updated) throw new LeadOpError('Failed to update lead after enrichment', 500);
	return updated as Lead;
}

export async function rescoreLeads(opts: {
	force?: boolean;
}): Promise<{ updated: number; total: number }> {
	let query = db.from('leads').select('*');
	if (!opts.force) {
		const cutoff = new Date(Date.now() - RESCORE_STALE_HOURS * 3_600_000).toISOString();
		query = query.or(`last_updated.is.null,last_updated.lt.${cutoff}`);
	}

	const { data: leads, error: err } = await query;
	if (err) throw new LeadOpError(err.message, 500);

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

	return { updated, total: leads?.length ?? 0 };
}

export async function geocodeMissingLeads(): Promise<{
	geocoded: number;
	failed: number;
	skipped: number;
}> {
	if (!GOOGLE_PLACES_API_KEY) throw new LeadOpError('GOOGLE_PLACES_API_KEY not configured', 500);

	const { data: rows } = await db.from('leads').select('id, google_place_id').is('latitude', null);

	const sem = new Semaphore(5);
	let geocoded = 0,
		failed = 0,
		skipped = 0;

	await Promise.all(
		(rows ?? []).map(async (row) => {
			if (!row.google_place_id) {
				skipped++;
				return;
			}
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
					const { error: updateErr } = await db
						.from('leads')
						.update({ latitude: loc.lat, longitude: loc.lng })
						.eq('id', row.id);
					if (updateErr) throw new Error(updateErr.message);
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

	return { geocoded, failed, skipped };
}

export async function generateLeadEmailDraft(
	id: string,
	opts: { templateSubject: string; templateBody: string; senderName: string; extraContext?: string }
): Promise<{ subject: string; body: string }> {
	const { data: lead, error: dbErr } = await db.from('leads').select('*').eq('id', id).single();
	if (dbErr || !lead) throw new LeadOpError('Lead not found', 404);

	if (!opts.templateSubject || !opts.templateBody || !opts.senderName) {
		throw new LeadOpError('templateSubject, templateBody, and senderName are required', 400);
	}

	const city = (lead.address as string)?.split(',')[1]?.trim() ?? '';
	const vars = {
		business_name: lead.business_name as string,
		city,
		sender_name: opts.senderName
	};

	const filledSubject = fillTemplate(opts.templateSubject, vars);
	const filledBody = fillTemplate(opts.templateBody, vars);

	try {
		return await callGemini({
			lead: lead as never,
			templateSubject: filledSubject,
			templateBody: filledBody,
			senderName: opts.senderName,
			extraContext: opts.extraContext ?? ''
		});
	} catch (e) {
		throw new LeadOpError(e instanceof Error ? e.message : 'AI generation failed', 502);
	}
}

export async function sendLeadEmailAndLog(
	id: string,
	opts: { subject: string; emailBody: string; markContacted?: boolean }
): Promise<Lead> {
	const { data: lead, error: dbErr } = await db.from('leads').select('*').eq('id', id).single();
	if (dbErr || !lead) throw new LeadOpError('Lead not found', 404);
	if (!lead.email) throw new LeadOpError('Lead has no email address', 400);

	if (!opts.subject?.trim()) throw new LeadOpError('subject is required', 400);
	if (!opts.emailBody?.trim()) throw new LeadOpError('emailBody is required', 400);

	try {
		await sendEmail({
			to: lead.email as string,
			subject: opts.subject,
			body: opts.emailBody
		});
	} catch (e) {
		throw new LeadOpError(e instanceof Error ? e.message : 'SMTP send failed', 502);
	}

	const timestamp = new Date().toUTCString();
	const noteEntry = `Email sent: ${timestamp} — ${opts.subject}`;
	const existingNotes = (lead.notes as string | null) ?? '';
	const updatedNotes = existingNotes ? `${existingNotes}\n${noteEntry}` : noteEntry;

	const updatePayload: Record<string, unknown> = {
		notes: updatedNotes,
		last_updated: new Date().toISOString()
	};

	if (opts.markContacted && lead.status === 'cold') {
		updatePayload.status = 'contacted';
	}

	const { data: updated, error: updateErr } = await db
		.from('leads')
		.update(updatePayload)
		.eq('id', id)
		.select()
		.single();

	if (updateErr || !updated) throw new LeadOpError('Email sent but failed to update lead record', 500);
	return updated as Lead;
}
