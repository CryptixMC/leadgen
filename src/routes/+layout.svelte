<script lang="ts">
	import { onMount } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';
	import DemoBanner from '$lib/components/DemoBanner.svelte';
	import { demoMode } from '$lib/demo/state';

	let { children } = $props();

	onMount(() => {
		if (sessionStorage.getItem('demo') === '1') {
			demoMode.set(true);
		}
	});
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
		<a href="/">Leads</a>
		<a href="/pipeline">Pipeline</a>
		<a href="/map">Map</a>
		<a href="/scraper">Scraper</a>
		<a href="/clients">Clients</a>
		<a href="/analytics">Analytics</a>
	</div>
</nav>

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
</style>
