import type { PageLoad } from './$types';
import { fetchLeads } from '$lib/api';

export const load: PageLoad = async ({ fetch }) => {
	const leads = await fetchLeads({}, fetch);
	return { leads };
};
