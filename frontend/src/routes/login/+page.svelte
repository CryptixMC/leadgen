<script lang="ts">
	import { supabase } from '$lib/supabase.js';
	import { goto } from '$app/navigation';

	let email = $state('');
	let password = $state('');
	let error = $state('');
	let loading = $state(false);

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
		<h1>LeadGen</h1>
		<p class="sub">Sign in to continue</p>

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
		background: #10101a;
		border: 1px solid #1a1a2e;
		border-radius: 12px;
		padding: 2rem;
		width: 100%;
		max-width: 360px;
	}

	h1 {
		font-size: 1.4rem;
		color: #7c3aed;
		margin-bottom: 0.25rem;
		text-align: center;
	}

	.sub {
		color: #64748b;
		font-size: 0.85rem;
		text-align: center;
		margin-bottom: 1.75rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin-bottom: 1rem;
	}

	label {
		font-size: 0.8rem;
		font-weight: 500;
		color: #94a3b8;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	input {
		background: #13131f;
		border: 1px solid #2a2a3e;
		color: #e2e8f0;
		padding: 0.6rem 0.8rem;
		border-radius: 6px;
		outline: none;
		width: 100%;
		transition: border-color 0.15s;
	}

	input:focus {
		border-color: #7c3aed;
	}

	input::placeholder {
		color: #4a5568;
	}

	input:disabled {
		opacity: 0.5;
	}

	.error {
		color: #f87171;
		font-size: 0.82rem;
		margin-bottom: 0.75rem;
		background: #2a1a1a;
		border: 1px solid #7f1d1d;
		border-radius: 6px;
		padding: 0.5rem 0.75rem;
	}

	button {
		width: 100%;
		background: #7c3aed;
		border: none;
		color: #fff;
		padding: 0.65rem 1.25rem;
		border-radius: 6px;
		cursor: pointer;
		font-weight: 600;
		font-size: 0.9rem;
		margin-top: 0.5rem;
		transition: background 0.15s;
	}

	button:hover:not(:disabled) {
		background: #6d28d9;
	}

	button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
</style>
