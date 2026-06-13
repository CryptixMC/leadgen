<script lang="ts">
	import { triggerScrape } from '$lib/api';
	import { supabase } from '$lib/supabase.js';

	let category = $state('');
	let city = $state('Winnipeg MB');
	let loading = $state(false);
	let result = $state<{ upserted: number; category: string; city: string } | null>(null);
	let error = $state('');

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!category.trim()) return;

		loading = true;
		error = '';
		result = null;

		try {
			const { data: { session } } = await supabase.auth.getSession();
			result = await triggerScrape(category.trim(), city.trim(), session?.access_token);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Scrape failed';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Scraper — LeadGen</title>
</svelte:head>

<main>
	<h1>Run Scraper</h1>
	<p class="subtitle">Pulls leads from Google Places and upserts them into the database.</p>

	<form onsubmit={handleSubmit} class="card">
		<div class="field">
			<label for="category">Category</label>
			<input
				id="category"
				type="text"
				bind:value={category}
				placeholder="e.g. restaurant, plumber, dentist"
				required
				disabled={loading}
			/>
		</div>

		<div class="field">
			<label for="city">City</label>
			<input
				id="city"
				type="text"
				bind:value={city}
				placeholder="e.g. Winnipeg MB"
				required
				disabled={loading}
			/>
		</div>

		<button type="submit" class="submit-btn" disabled={loading || !category.trim()}>
			{loading ? 'Scraping…' : 'Run Scrape'}
		</button>
	</form>

	{#if loading}
		<div class="status-card info">
			<span class="spinner"></span>
			Calling Google Places API for <strong>{category}</strong> in <strong>{city}</strong>…
		</div>
	{/if}

	{#if result}
		<div class="status-card success">
			<div class="result-headline">
				<span class="result-num">{result.upserted}</span>
				<span>leads processed</span>
			</div>
			<p class="result-detail">
				Category: <strong>{result.category}</strong> · City: <strong>{result.city}</strong>
			</p>
			<a href="/" class="view-link">View leads →</a>
		</div>
	{/if}

	{#if error}
		<div class="status-card err">{error}</div>
	{/if}
</main>

<style>
	main {
		padding: 2rem;
		max-width: 560px;
		margin: 0 auto;
	}

	h1 {
		font-size: 1.5rem;
		color: #f1f5f9;
		margin-bottom: 0.4rem;
	}

	.subtitle {
		color: #64748b;
		font-size: 0.875rem;
		margin-bottom: 2rem;
	}

	.card {
		background: #10101a;
		border: 1px solid #1a1a2e;
		border-radius: 10px;
		padding: 1.5rem;
		margin-bottom: 1.25rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-bottom: 1.1rem;
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
		padding: 0.55rem 0.8rem;
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

	.submit-btn {
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

	.submit-btn:hover:not(:disabled) {
		background: #6d28d9;
	}

	.submit-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.status-card {
		border-radius: 10px;
		padding: 1.25rem 1.5rem;
		font-size: 0.875rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.status-card.info {
		background: #1a1a2e;
		border: 1px solid #2a2a3e;
		color: #94a3b8;
		flex-direction: row;
		align-items: center;
		gap: 0.75rem;
	}

	.status-card.success {
		background: #14291a;
		border: 1px solid #166534;
		color: #86efac;
	}

	.status-card.err {
		background: #2a1a1a;
		border: 1px solid #7f1d1d;
		color: #f87171;
	}

	.result-headline {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}

	.result-num {
		font-family: 'JetBrains Mono', monospace;
		font-size: 2rem;
		font-weight: 700;
		color: #d946ef;
	}

	.result-detail {
		color: #4ade80;
		font-size: 0.8rem;
	}

	.view-link {
		color: #d946ef;
		font-size: 0.85rem;
		font-weight: 500;
	}

	.view-link:hover {
		color: #7c3aed;
	}

	.spinner {
		display: inline-block;
		width: 14px;
		height: 14px;
		border: 2px solid #2a2a3e;
		border-top-color: #7c3aed;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
