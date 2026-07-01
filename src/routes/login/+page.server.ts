import { fail, redirect } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const email = String(data.get('email') ?? '').trim();
		const password = String(data.get('password') ?? '');

		if (!email || !password) {
			return fail(400, { error: 'Email and password are required' });
		}

		const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
			auth: { persistSession: false }
		});
		const { data: signInData, error: authError } = await supabase.auth.signInWithPassword({
			email,
			password
		});

		if (authError || !signInData.session) {
			return fail(400, { error: authError?.message ?? 'Sign in failed' });
		}

		cookies.set('sb_access_token', signInData.session.access_token, {
			path: '/',
			maxAge: signInData.session.expires_in ?? 3600,
			httpOnly: true,
			secure: true,
			sameSite: 'lax'
		});

		throw redirect(303, '/');
	}
};
