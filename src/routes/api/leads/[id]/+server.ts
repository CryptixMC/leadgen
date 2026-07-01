import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';
import { calculateScore } from '$lib/server/scoring';
import { normalizeWebsiteUrl, normalizeSocialUrl } from '$lib/server/utils';

const SOCIAL_URL_FIELDS: Record<string, string> = {
	facebook_url: 'facebook',
	instagram_url: 'instagram',
	twitter_url: 'twitter',
	linkedin_url: 'linkedin',
	tiktok_url: 'tiktok',
	youtube_url: 'youtube'
};
import { DEMO_LEADS } from '$lib/demo/data';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (locals.demo) {
		const lead = DEMO_LEADS.find((l) => l.id === params.id);
		if (!lead) throw error(404, 'Lead not found');
		return json(lead);
	}

	requireAuth(locals);
	const { data, error: err } = await db
		.from('leads')
		.select('*')
		.eq('id', params.id)
		.single();
	if (err || !data) throw error(404, 'Lead not found');
	return json(data);
};

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (locals.demo) {
		const lead = DEMO_LEADS.find((l) => l.id === params.id);
		if (!lead) throw error(404, 'Lead not found');
		return json(lead);
	}

	requireAuth(locals);
	const payload = await request.json();
	const updateData: Record<string, unknown> = {};
	if (payload.status !== undefined) updateData.status = payload.status;
	if (payload.notes !== undefined) updateData.notes = payload.notes;
	if (payload.hidden !== undefined) updateData.hidden = Boolean(payload.hidden);
	if (payload.business_name !== undefined) {
		const businessName = String(payload.business_name).trim();
		if (!businessName) throw error(400, 'Business name is required');
		updateData.business_name = businessName;
	}
	if (payload.address !== undefined) updateData.address = payload.address || null;
	if (payload.phone !== undefined) updateData.phone = payload.phone || null;
	if (payload.email !== undefined) updateData.email = payload.email || null;
	if (payload.website_url !== undefined) {
		let websiteUrl: string | null;
		try {
			websiteUrl = normalizeWebsiteUrl(payload.website_url);
		} catch (e) {
			throw error(400, e instanceof Error ? e.message : 'Invalid website URL');
		}
		updateData.website_url = websiteUrl;
		updateData.has_website = Boolean(websiteUrl);
		updateData.has_https = websiteUrl != null && websiteUrl.startsWith('https://');
	}
	if (payload.owner_name !== undefined) {
		const ownerName = String(payload.owner_name).trim();
		updateData.owner_name = ownerName || null;
	}
	for (const [field, platform] of Object.entries(SOCIAL_URL_FIELDS)) {
		if (payload[field] === undefined) continue;
		try {
			updateData[field] = normalizeSocialUrl(payload[field], platform);
		} catch (e) {
			throw error(400, e instanceof Error ? e.message : `Invalid ${platform} URL`);
		}
	}
	if (!Object.keys(updateData).length) throw error(400, 'No updatable fields provided');
	updateData.last_updated = new Date().toISOString();

	if (updateData.website_url !== undefined || updateData.email !== undefined) {
		const { data: existing } = await db.from('leads').select('*').eq('id', params.id).single();
		if (existing) {
			const [score, priority] = calculateScore({ ...existing, ...updateData });
			updateData.lead_score = score;
			updateData.priority = priority;
		}
	}

	const { data, error: err } = await db
		.from('leads')
		.update(updateData)
		.eq('id', params.id)
		.select()
		.single();
	if (err || !data) throw error(404, 'Lead not found');

	if (payload.status === 'closed_won') {
		const { data: existing } = await db
			.from('clients')
			.select('id')
			.eq('lead_id', params.id)
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

	return json(data);
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (locals.demo) return new Response(null, { status: 204 });

	requireAuth(locals);
	await db.from('leads').delete().eq('id', params.id);
	return new Response(null, { status: 204 });
};
