import type { PageLoad } from './$types';
import { fetchLeads } from '$lib/api';

export const load: PageLoad = async ({ fetch, parent }) => {
	const { token } = (await parent()) as { token?: string };
	const leads = await fetchLeads({}, fetch, token);
	return { leads };
};
