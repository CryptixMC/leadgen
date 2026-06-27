import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (url.pathname === '/login') return {};
	if (!locals.user) throw redirect(303, '/login');
	return {};
};
