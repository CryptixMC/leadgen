import { db } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireAuth(locals);
	const { data: clients } = await db
		.from('clients')
		.select('*')
		.order('created_at', { ascending: false });
	const total_mrr = (clients ?? []).reduce((sum: number, c: { mrr: number }) => sum + Number(c.mrr), 0);
	return { clients: clients ?? [], total_mrr };
};
