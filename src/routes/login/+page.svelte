<script lang="ts">
	import { supabase } from '$lib/supabase.js';
	import { goto } from '$app/navigation';
	import favicon from '$lib/assets/favicon.svg';
	import { enterDemo } from '$lib/demo/state';

	let email = $state('');
	let password = $state('');
	let error = $state('');
	let loading = $state(false);

	function handleDemo() {
		enterDemo();
		goto('/pipeline');
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		loading = true;
		error = '';

		const { data, error: authError } = await supabase.auth.signInWithPassword({
			email,
			password
		});

		if (authError || !data.session) {
			error = authError?.message ?? 'Sign in failed';
			loading = false;
			return;
		}

		const maxAge = data.session.expires_in ?? 3600;
		document.cookie = `sb_access_token=${data.session.access_token}; path=/; max-age=${maxAge}; SameSite=Lax`;

		goto('/');
	}
</script>

<svelte:head>
	<title>Sign In — LeadGen</title>
</svelte:head>

<main>
	<div class="card">
		<div class="logo-mark">
			<img src={favicon} alt="LN." class="mark-img" />
		</div>
		<div class="eyebrow">// sign in to continue</div>
		<h1>LeadGen.</h1>
		<p class="sub">Liam Nicholson · Internal tool</p>

		<form onsubmit={handleSubmit}>
			<div class="field">
				<label for="email">Email</label>
				<input
					id="email"
					type="email"
					bind:value={email}
					placeholder="you@example.com"
					required
					disabled={loading}
					autocomplete="email"
				/>
			</div>

			<div class="field">
				<label for="password">Password</label>
				<input
					id="password"
					type="password"
					bind:value={password}
					placeholder="••••••••"
					required
					disabled={loading}
					autocomplete="current-password"
				/>
			</div>

			{#if error}
				<p class="error">{error}</p>
			{/if}

			<button type="submit" disabled={loading || !email || !password}>
				{loading ? 'Signing in…' : 'Sign In'}
			</button>
		</form>

		<button type="button" class="demo-btn" onclick={handleDemo}>
			Explore without signing in →
		</button>
	</div>
</main>

<style>
	main {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}

	.card {
		background: rgba(17, 17, 24, 0.92);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		padding: 2.5rem 2.25rem;
		width: 100%;
		max-width: 380px;
	}

	.logo-mark {
		display: flex;
		justify-content: center;
		margin-bottom: 1.5rem;
	}

	.mark-img {
		width: 52px;
		height: 52px;
		border-radius: 12px;
	}

	.eyebrow {
		font-family: var(--font-display);
		font-size: 0.67rem;
		color: var(--text-muted);
		letter-spacing: 0.15em;
		text-transform: uppercase;
		text-align: center;
		margin-bottom: 0.45rem;
	}

	h1 {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--text-primary);
		text-align: center;
		letter-spacing: -0.02em;
		margin-bottom: 0.3rem;
	}

	.sub {
		color: var(--text-muted);
		font-size: 0.875rem;
		text-align: center;
		margin-bottom: 2rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin-bottom: 1rem;
	}

	label {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.12em;
	}

	input {
		background: var(--bg-base);
		border: 1px solid var(--border-subtle);
		color: var(--text-primary);
		padding: 0.6rem 0.85rem;
		border-radius: var(--radius-sm);
		outline: none;
		width: 100%;
		transition: border-color var(--dur-fast);
	}

	input:focus {
		border-color: var(--accent-primary);
	}

	input::placeholder {
		color: var(--text-muted);
		opacity: 0.5;
	}

	input:disabled {
		opacity: 0.5;
	}

	.error {
		color: #f87171;
		font-size: 0.82rem;
		margin-bottom: 0.75rem;
		background: rgba(248, 113, 113, 0.08);
		border: 1px solid rgba(248, 113, 113, 0.2);
		border-radius: var(--radius-sm);
		padding: 0.5rem 0.75rem;
	}

	button {
		width: 100%;
		background: var(--gradient-primary);
		border: none;
		color: var(--bg-base);
		padding: 0.65rem 1.25rem;
		border-radius: var(--radius-pill);
		cursor: pointer;
		font-weight: 600;
		font-size: 0.9rem;
		margin-top: 0.5rem;
		transition: box-shadow var(--dur-fast), transform var(--dur-fast);
	}

	button:hover:not(:disabled) {
		box-shadow: var(--glow-cta);
		transform: translateY(-1px);
	}

	button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.demo-btn {
		width: 100%;
		background: none;
		border: 1px solid var(--border-subtle);
		color: var(--text-muted);
		padding: 0.6rem 1.25rem;
		border-radius: var(--radius-pill);
		cursor: pointer;
		font-size: 0.85rem;
		margin-top: 0.75rem;
		transition: border-color var(--dur-fast), color var(--dur-fast);
	}

	.demo-btn:hover {
		border-color: var(--border-strong);
		color: var(--text-primary);
	}
</style>
