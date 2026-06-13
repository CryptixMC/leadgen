import { redirect } from '@sveltejs/kit';

export async function load({ cookies, url }) {
	if (url.pathname === '/login') return {};

	const token = cookies.get('sb_access_token');
	if (!token) throw redirect(303, '/login');

	return { token };
}
