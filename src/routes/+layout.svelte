<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<nav>
	<a href="/" class="brand">LeadGen</a>
	<div class="nav-links">
		<a href="/">Leads</a>
		<a href="/pipeline">Pipeline</a>
		<a href="/map">Map</a>
		<a href="/scraper">Scraper</a>
		<a href="/clients">Clients</a>
	</div>
</nav>

{@render children()}

<style>
	:global(*, *::before, *::after) {
		box-sizing: border-box;
		margin: 0;
		padding: 0;
	}

	:global(body) {
		background: #0a0a0f;
		color: #e2e8f0;
		font-family: 'DM Sans', sans-serif;
		min-height: 100vh;
		-webkit-font-smoothing: antialiased;
	}

	:global(h1, h2, h3, h4) {
		font-family: 'JetBrains Mono', monospace;
	}

	:global(a) {
		color: #7c3aed;
		text-decoration: none;
	}

	:global(a:hover) {
		color: #d946ef;
	}

	:global(input, select, textarea, button) {
		font-family: inherit;
		font-size: inherit;
	}

	nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 2rem;
		border-bottom: 1px solid #1a1a2e;
		background: #0a0a0f;
		position: sticky;
		top: 0;
		z-index: 10;
	}

	.brand {
		font-family: 'JetBrains Mono', monospace;
		font-size: 1.1rem;
		font-weight: 700;
		color: #7c3aed;
		letter-spacing: -0.02em;
	}

	.brand:hover {
		color: #d946ef;
	}

	.nav-links {
		display: flex;
		gap: 1.5rem;
	}

	.nav-links a {
		color: #94a3b8;
		font-size: 0.9rem;
		font-weight: 500;
		transition: color 0.15s;
	}

	.nav-links a:hover {
		color: #d946ef;
	}
</style>
