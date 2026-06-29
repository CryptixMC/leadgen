import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	requireAuth(locals);
	const { data, error: err } = await db
		.from('clients')
		.select('*')
		.eq('id', params.id)
		.single();
	if (err || !data) throw error(404, 'Client not found');
	return { client: data };
};

export const actions: Actions = {
	save: async ({ locals, params, request }) => {
		requireAuth(locals);
		const form = await request.formData();

		const updates = {
			contact_name: (form.get('contact_name') as string)?.trim() || null,
			phone: (form.get('phone') as string)?.trim() || null,
			email: (form.get('email') as string)?.trim() || null,
			address: (form.get('address') as string)?.trim() || null,
			service_website: form.get('service_website') === 'on',
			service_tools: form.get('service_tools') === 'on',
			service_hosting: form.get('service_hosting') === 'on',
			mrr: parseFloat((form.get('mrr') as string) || '0') || 0,
			project_value: parseFloat((form.get('project_value') as string) || '0') || 0,
			contract_start: (form.get('contract_start') as string) || null,
			notes: (form.get('notes') as string)?.trim() || null
		};

		const { error: err } = await db
			.from('clients')
			.update(updates)
			.eq('id', params.id);

		if (err) return { success: false, error: err.message };
		return { success: true };
	}
};
