import { error, redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals, params }) => {
	requireAuth(locals);
	const { data, error: err } = await db.from('clients').select('*').eq('id', params.id).single();
	if (err || !data) throw error(404, 'Client not found');
	return { client: data };
};

export const actions: Actions = {
	update: async ({ locals, params, request }) => {
		requireAuth(locals);
		const form = await request.formData();
		const name = (form.get('name') as string)?.trim();
		const address = (form.get('address') as string)?.trim();
		const email = (form.get('email') as string)?.trim() || null;
		const phone = (form.get('phone') as string)?.trim() || null;
		const mrr = parseFloat(form.get('mrr') as string) || 0;
		const notes = (form.get('notes') as string)?.trim() || null;

		if (!name || !address) return fail(400, { error: 'Name and address are required.' });

		const { error: err } = await db.from('clients').update({ name, address, email, phone, mrr, notes }).eq('id', params.id);
		if (err) return fail(500, { error: err.message });

		return { success: true };
	},

	delete: async ({ locals, params }) => {
		requireAuth(locals);
		const { error: err } = await db.from('clients').delete().eq('id', params.id);
		if (err) return fail(500, { error: err.message });
		throw redirect(303, '/clients');
	}
};
