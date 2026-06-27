import { error } from '@sveltejs/kit';

export function requireAuth(locals: App.Locals): void {
	if (!locals.user) throw error(401, 'Unauthorized');
}
