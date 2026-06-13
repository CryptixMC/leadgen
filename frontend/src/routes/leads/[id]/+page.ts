import { fetchLead } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, parent }) => {
	const { token } = (await parent()) as { token?: string };
	const lead = await fetchLead(params.id, fetch, token);
	return { lead };
};
