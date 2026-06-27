import { fetchLeads } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
	const leads = await fetchLeads({}, fetch);
	return { leads };
};
