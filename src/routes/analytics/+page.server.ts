import { db } from '$lib/server/db';
import type { PageServerLoad } from './$types';

const STATUSES = ['cold', 'contacted', 'proposal', 'closed_won', 'closed_lost'];

export const load: PageServerLoad = async () => {
	const [mrrOverTime, pipelineFunnel, revenueByMonth] = await Promise.all([
		loadMrrOverTime(),
		loadPipelineFunnel(),
		loadRevenueByMonth()
	]);

	return { mrrOverTime, pipelineFunnel, revenueByMonth };
};

async function loadMrrOverTime(): Promise<{ month: string; mrr: number }[]> {
	try {
		const { data, error } = await db
			.from('clients')
			.select('mrr, contract_start')
			.not('contract_start', 'is', null)
			.not('mrr', 'is', null)
			.order('contract_start', { ascending: true });

		if (error || !data || data.length === 0) return [];

		const earliest = new Date(data[0].contract_start);
		const now = new Date();

		const months: { month: string; mrr: number }[] = [];
		const cursor = new Date(earliest.getFullYear(), earliest.getMonth(), 1);

		while (cursor <= now) {
			const label = cursor.toISOString().slice(0, 7); // 'YYYY-MM'
			const cumulative = data
				.filter((r) => r.contract_start.slice(0, 7) <= label)
				.reduce((sum, r) => sum + (r.mrr ?? 0), 0);
			months.push({ month: label, mrr: cumulative });
			cursor.setMonth(cursor.getMonth() + 1);
		}

		return months;
	} catch {
		return [];
	}
}

async function loadPipelineFunnel(): Promise<{ status: string; count: number }[]> {
	try {
		const { data, error } = await db.from('leads').select('status');

		if (error || !data) return [];

		const counts: Record<string, number> = {};
		for (const row of data) {
			const s = row.status ?? 'cold';
			counts[s] = (counts[s] ?? 0) + 1;
		}

		return STATUSES.map((status) => ({ status, count: counts[status] ?? 0 }));
	} catch {
		return [];
	}
}

async function loadRevenueByMonth(): Promise<{ month: string; revenue: number }[]> {
	try {
		const cutoff = new Date();
		cutoff.setMonth(cutoff.getMonth() - 11);
		cutoff.setDate(1);
		const cutoffStr = cutoff.toISOString().slice(0, 10);

		const { data, error } = await db
			.from('clients')
			.select('project_value, contract_start')
			.not('contract_start', 'is', null)
			.not('project_value', 'is', null)
			.gte('contract_start', cutoffStr)
			.order('contract_start', { ascending: true });

		if (error || !data || data.length === 0) return [];

		const byMonth: Record<string, number> = {};
		for (const row of data) {
			const month = row.contract_start.slice(0, 7);
			byMonth[month] = (byMonth[month] ?? 0) + (row.project_value ?? 0);
		}

		// Fill all 12 months so x-axis is complete
		const months: { month: string; revenue: number }[] = [];
		const cursor = new Date(cutoff.getFullYear(), cutoff.getMonth(), 1);
		const now = new Date();
		while (cursor <= now) {
			const label = cursor.toISOString().slice(0, 7);
			months.push({ month: label, revenue: byMonth[label] ?? 0 });
			cursor.setMonth(cursor.getMonth() + 1);
		}

		return months;
	} catch {
		return [];
	}
}
