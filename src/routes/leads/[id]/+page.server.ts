import { redirect, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';
import { DEMO_CONTACT_EVENTS } from '$lib/demo/data';

const VALID_TYPES = ['email', 'call', 'visit', 'note'] as const;

export const load: PageServerLoad = async ({ locals, params }) => {
	if (locals.demo) {
		return { events: DEMO_CONTACT_EVENTS[params.id] ?? [] };
	}

	requireAuth(locals);
	const { data, error: err } = await db
		.from('contact_events')
		.select('id, type, notes, created_at')
		.eq('lead_id', params.id)
		.order('created_at', { ascending: false });
	if (err) throw error(500, err.message);
	return { events: data ?? [] };
};

export const actions: Actions = {
	log_activity: async ({ locals, params, request }) => {
		if (locals.demo) return {};

		requireAuth(locals);
		const form = await request.formData();
		const type = form.get('type') as string;
		const notes = (form.get('notes') as string | null) || null;

		if (!VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
			throw error(400, 'Invalid activity type');
		}

		const { error: err } = await db
			.from('contact_events')
			.insert({ lead_id: params.id, type, notes });
		if (err) throw error(500, err.message);

		redirect(303, `/leads/${params.id}`);
	}
};
