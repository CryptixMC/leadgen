import { writable } from 'svelte/store';
import { goto } from '$app/navigation';
import { browser } from '$app/environment';

export const demoMode = writable(false);

export function enterDemo(): void {
	demoMode.set(true);
	if (browser) {
		sessionStorage.setItem('demo', '1');
		document.cookie = 'demo=1; path=/; SameSite=Lax';
	}
}

export function exitDemo(): void {
	demoMode.set(false);
	if (browser) {
		sessionStorage.removeItem('demo');
		document.cookie = 'demo=; path=/; max-age=0; SameSite=Lax';
	}
	goto('/login');
}
