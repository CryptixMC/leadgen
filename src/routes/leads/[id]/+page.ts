import { fetchLead } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => {
	const lead = await fetchLead(params.id, fetch);
	return { lead };
};
