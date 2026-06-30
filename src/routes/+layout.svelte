<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import favicon from '$lib/assets/favicon.svg';
	import DemoBanner from '$lib/components/DemoBanner.svelte';
	import { demoMode } from '$lib/demo/state';

	let { children } = $props();
	let menuOpen = $state(false);

	onMount(() => {
		if (sessionStorage.getItem('demo') === '1') {
			demoMode.set(true);
		}
	});

	function closeMenu() {
		menuOpen = false;
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} type="image/svg+xml" />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700;800&family=Syne:wght@400;500;600;700;800&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<nav>
	<a href="/" class="brand">
		<img src={favicon} alt="LN" class="brand-mark" />
		<span class="brand-text">LeadGen.</span>
	</a>
	<div class="nav-links">
		<a href="/" aria-current={$page.url.pathname === '/' ? 'page' : undefined}>Leads</a>
		<a href="/pipeline" aria-current={$page.url.pathname === '/pipeline' ? 'page' : undefined}>Pipeline</a>
		<a href="/map" aria-current={$page.url.pathname === '/map' ? 'page' : undefined}>Map</a>
		<a href="/scraper" aria-current={$page.url.pathname === '/scraper' ? 'page' : undefined}>Scraper</a>
		<a href="/clients" aria-current={$page.url.pathname === '/clients' ? 'page' : undefined}>Clients</a>
		<a href="/analytics" aria-current={$page.url.pathname === '/analytics' ? 'page' : undefined}>Analytics</a>
	</div>
	<button
		class="hamburger"
		onclick={() => (menuOpen = !menuOpen)}
		aria-label={menuOpen ? 'Close menu' : 'Open menu'}
		aria-expanded={menuOpen}
	>
		<span class="hamburger-line" class:open={menuOpen}></span>
		<span class="hamburger-line" class:open={menuOpen}></span>
		<span class="hamburger-line" class:open={menuOpen}></span>
	</button>
</nav>

{#if menuOpen}
	<div class="mobile-menu" role="navigation" aria-label="Mobile navigation">
		<a href="/" onclick={closeMenu} aria-current={$page.url.pathname === '/' ? 'page' : undefined}>Leads</a>
		<a href="/pipeline" onclick={closeMenu} aria-current={$page.url.pathname === '/pipeline' ? 'page' : undefined}>Pipeline</a>
		<a href="/map" onclick={closeMenu} aria-current={$page.url.pathname === '/map' ? 'page' : undefined}>Map</a>
		<a href="/scraper" onclick={closeMenu} aria-current={$page.url.pathname === '/scraper' ? 'page' : undefined}>Scraper</a>
		<a href="/clients" onclick={closeMenu} aria-current={$page.url.pathname === '/clients' ? 'page' : undefined}>Clients</a>
		<a href="/analytics" onclick={closeMenu} aria-current={$page.url.pathname === '/analytics' ? 'page' : undefined}>Analytics</a>
	</div>
{/if}

<DemoBanner />

{@render children()}

<style>
	:global(:root) {
		--bg-base: #0A0A0F;
		--bg-surface: #111118;
		--bg-card: rgba(255, 255, 255, 0.03);
		--border-grid: #1E1E2E;
		--border-subtle: rgba(255, 255, 255, 0.08);
		--border-strong: rgba(255, 255, 255, 0.15);
		--border-accent: rgba(217, 70, 239, 0.40);
		--text-primary: #F5F0FF;
		--text-muted: #9090B0;
		--accent-primary: #7C3AED;
		--accent-strong: #6B21A8;
		--accent-highlight: #D946EF;
		--gradient-primary: linear-gradient(135deg, #7C3AED, #D946EF);
		--glow-cta: 0 0 40px rgba(217, 70, 239, 0.40);
		--glow-soft: 0 0 24px rgba(124, 58, 237, 0.25);
		--glow-card: 0 0 0 1px rgba(217, 70, 239, 0.20), 0 8px 40px rgba(124, 58, 237, 0.12);
		--radius-sm: 8px;
		--radius-md: 12px;
		--radius-lg: 20px;
		--radius-pill: 100px;
		--font-display: 'JetBrains Mono', ui-monospace, monospace;
		--font-ui: 'Syne', ui-sans-serif, system-ui, sans-serif;
		--font-body: 'DM Sans', ui-sans-serif, system-ui, sans-serif;
		--ease-out: cubic-bezier(0.22, 1, 0.36, 1);
		--dur-fast: 140ms;
		--dur-base: 240ms;
		--state-success: #2DC653;
		--state-warning: #FFD60A;
	}

	:global(*, *::before, *::after) {
		box-sizing: border-box;
		margin: 0;
		padding: 0;
	}

	:global(body) {
		background: var(--bg-base);
		color: var(--text-primary);
		font-family: var(--font-body);
		min-height: 100vh;
		-webkit-font-smoothing: antialiased;
	}

	:global(h1, h2, h3, h4) {
		font-family: var(--font-display);
	}

	:global(a) {
		color: var(--accent-primary);
		text-decoration: none;
	}

	:global(a:hover) {
		color: var(--accent-highlight);
	}

	:global(input, select, textarea, button) {
		font-family: inherit;
		font-size: inherit;
	}

	:global(select option) {
		background: var(--bg-surface);
		color: var(--text-primary);
	}

	:global(::-webkit-scrollbar) {
		width: 6px;
		background: var(--bg-base);
	}

	:global(::-webkit-scrollbar-thumb) {
		background: #2a2a3e;
		border-radius: 3px;
	}

	nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 2rem;
		height: 60px;
		background: rgba(10, 10, 15, 0.72);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border-bottom: 1px solid var(--border-grid);
		position: sticky;
		top: 0;
		z-index: 100;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		text-decoration: none;
	}

	.brand-mark {
		width: 26px;
		height: 26px;
		border-radius: 5px;
		flex-shrink: 0;
	}

	.brand-text {
		font-family: var(--font-display);
		font-size: 0.95rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		background: var(--gradient-primary);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.nav-links {
		display: flex;
		align-items: center;
		gap: 0.1rem;
	}

	.nav-links a {
		font-family: var(--font-ui);
		font-size: 0.82rem;
		font-weight: 400;
		color: var(--text-muted);
		padding: 4px 10px;
		border-bottom: 2px solid transparent;
		transition: color var(--dur-fast), border-color var(--dur-fast);
		text-decoration: none;
	}

	.nav-links a:hover {
		color: var(--text-primary);
	}

	.nav-links a[aria-current='page'] {
		color: var(--text-primary);
		font-weight: 600;
		border-bottom-color: var(--accent-highlight);
	}

	.hamburger {
		display: none;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		gap: 5px;
		background: transparent;
		border: none;
		cursor: pointer;
		padding: 0.5rem;
		border-radius: var(--radius-sm);
		width: 44px;
		height: 44px;
		flex-shrink: 0;
	}

	.hamburger-line {
		display: block;
		width: 20px;
		height: 2px;
		background: var(--text-muted);
		border-radius: 2px;
		transition: transform var(--dur-fast), opacity var(--dur-fast);
	}

	.hamburger:hover .hamburger-line {
		background: var(--text-primary);
	}

	.mobile-menu {
		display: flex;
		flex-direction: column;
		background: rgba(10, 10, 15, 0.97);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border-bottom: 1px solid var(--border-grid);
		position: sticky;
		top: 60px;
		z-index: 99;
	}

	.mobile-menu a {
		font-family: var(--font-ui);
		font-size: 0.95rem;
		font-weight: 500;
		color: var(--text-muted);
		padding: 0.9rem 1.5rem;
		border-bottom: 1px solid var(--border-grid);
		text-decoration: none;
		transition: color var(--dur-fast), background var(--dur-fast);
		min-height: 44px;
		display: flex;
		align-items: center;
	}

	.mobile-menu a:hover {
		color: var(--text-primary);
		background: rgba(255, 255, 255, 0.03);
	}

	.mobile-menu a[aria-current='page'] {
		color: var(--accent-highlight);
		font-weight: 600;
	}

	@media (max-width: 768px) {
		nav {
			padding: 0 1rem;
		}

		.nav-links {
			display: none;
		}

		.hamburger {
			display: flex;
		}
	}
</style>
