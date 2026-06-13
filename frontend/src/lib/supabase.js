import { browser } from '$app/environment';
import { createClient } from '@supabase/supabase-js';

// createClient must not be called during SSR — browser globals and import.meta.env
// PUBLIC_* vars are not available in the server-side Vite module runner.
// The client is only used in browser event handlers (signIn, getSession), never during render.
export const supabase = browser
	? createClient(
			import.meta.env.PUBLIC_SUPABASE_URL,
			import.meta.env.PUBLIC_SUPABASE_ANON_KEY
		)
	: /** @type {import('@supabase/supabase-js').SupabaseClient} */ (/** @type {unknown} */ (null));
