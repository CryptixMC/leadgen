import { fetchLeads } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, parent }) => {
	const { token } = (await parent()) as { token?: string };
	const leads = await fetchLeads({}, fetch, token);
	return { leads };
};
