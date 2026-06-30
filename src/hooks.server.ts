import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import type { Handle } from '@sveltejs/kit';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
	auth: { persistSession: false }
});

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get('sb_access_token');
	if (token) {
		const { data } = await supabaseAdmin.auth.getUser(token);
		if (data.user) {
			event.locals.user = data.user;
		}
	}
	if (event.cookies.get('demo') === '1') {
		event.locals.demo = true;
	}
	return resolve(event);
};
