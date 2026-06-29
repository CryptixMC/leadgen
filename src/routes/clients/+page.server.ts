import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals }) => {
	requireAuth(locals);
	const { data, error } = await db.from('clients').select('*').order('created_at', { ascending: false });
	if (error) throw new Error(error.message);
	return { clients: data ?? [] };
};

export const actions: Actions = {
	create: async ({ locals, request }) => {
		requireAuth(locals);
		const form = await request.formData();
		const name = (form.get('name') as string)?.trim();
		const address = (form.get('address') as string)?.trim();
		const email = (form.get('email') as string)?.trim() || null;
		const phone = (form.get('phone') as string)?.trim() || null;
		const mrr = parseFloat(form.get('mrr') as string) || 0;

		if (!name || !address) return fail(400, { error: 'Name and address are required.' });

		const { data, error } = await db.from('clients').insert({ name, address, email, phone, mrr }).select().single();
		if (error) return fail(500, { error: error.message });

		throw redirect(303, `/clients/${data.id}`);
	}
};
