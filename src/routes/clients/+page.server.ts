import { db } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';
import type { PageServerLoad } from './$types';
import { DEMO_CLIENTS } from '$lib/demo/data';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.demo) {
		const total_mrr = DEMO_CLIENTS.reduce((sum, c) => sum + c.mrr, 0);
		return { clients: DEMO_CLIENTS, total_mrr };
	}

	requireAuth(locals);
	const { data: clients } = await db
		.from('clients')
		.select('*')
		.order('created_at', { ascending: false });
	const total_mrr = (clients ?? []).reduce((sum: number, c: { mrr: number }) => sum + Number(c.mrr), 0);
	return { clients: clients ?? [], total_mrr };
};
