import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';

const STATUSES = ['cold', 'contacted', 'proposal', 'closed_won', 'closed_lost'] as const;

export const load: PageServerLoad = async ({ locals }) => {
	requireAuth(locals);
	const { data, error: err } = await db
		.from('leads')
		.select('id, business_name, address, phone, website_url, lead_score, priority, status, created_at')
		.order('created_at', { ascending: false });
	if (err) throw error(500, err.message);

	const columns: Record<string, typeof data> = Object.fromEntries(STATUSES.map((s) => [s, []]));
	for (const lead of data ?? []) {
		const col = columns[lead.status];
		if (col) col.push(lead);
	}
	return { columns };
};
