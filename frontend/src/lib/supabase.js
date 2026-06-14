import { browser } from '$app/environment';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';

// createClient must not be called during SSR — browser globals are not available server-side.
// The client is only used in browser event handlers (signIn, getSession), never during render.
export const supabase = browser
	? createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY)
	: /** @type {import('@supabase/supabase-js').SupabaseClient} */ (/** @type {unknown} */ (null));
