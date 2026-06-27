<script lang="ts">
	import { triggerScrape, fetchLeads, enrichLead } from '$lib/api';

	let category = $state('');
	let city = $state('Winnipeg MB');
	let target = $state(60);
	let loading = $state(false);
	let result = $state<{ upserted: number; category: string; city: string; pages_fetched: number } | null>(null);
	let error = $state('');

	let rescoreLoading = $state(false);
	let rescoreResult = $state<{ updated: number; total: number } | null>(null);
	let rescoreError = $state('');
	let rescoreProgress = $state({ done: 0, failed: 0, total: 0, currentName: '' });

	async function handleRescore() {
		rescoreLoading = true;
		rescoreError = '';
		rescoreResult = null;
		rescoreProgress = { done: 0, failed: 0, total: 0, currentName: '' };
		try {
			const leads = await fetchLeads({}, fetch);
			rescoreProgress = { ...rescoreProgress, total: leads.length };
			for (const lead of leads) {
				rescoreProgress = { ...rescoreProgress, currentName: lead.business_name };
				try {
					await enrichLead(lead.id);
					rescoreProgress = { ...rescoreProgress, done: rescoreProgress.done + 1 };
				} catch {
					rescoreProgress = { ...rescoreProgress, failed: rescoreProgress.failed + 1 };
				}
			}
			rescoreResult = { updated: rescoreProgress.done, total: rescoreProgress.total };
		} catch (err) {
			rescoreError = err instanceof Error ? err.message : 'Rescore failed';
		} finally {
			rescoreLoading = false;
		}
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!category.trim()) return;

		loading = true;
		error = '';
		result = null;

		try {
			result = await triggerScrape(category.trim(), city.trim(), target);
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

		<div class="field">
			<label for="target">Target leads</label>
			<input
				id="target"
				type="number"
				bind:value={target}
				min="1"
				max="300"
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
			Scraping up to <strong>{target}</strong> leads for <strong>{category}</strong> in <strong>{city}</strong>…
		</div>
	{/if}

	{#if result}
		<div class="status-card success">
			<div class="result-headline">
				<span class="result-num">{result.upserted}</span>
				<span>leads processed</span>
			</div>
			<p class="result-detail">
				Category: <strong>{result.category}</strong> · City: <strong>{result.city}</strong> · Pages fetched: <strong>{result.pages_fetched}</strong>
			</p>
			<a href="/" class="view-link">View leads →</a>
		</div>
	{/if}

	{#if error}
		<div class="status-card err">{error}</div>
	{/if}

	<div class="section-divider"></div>

	<h2 class="section-title">Enrich &amp; Rescore Leads</h2>
	<p class="subtitle">Discovers websites and emails, then recalculates lead score and priority for every lead. May take several minutes.</p>

	<div class="card">
		<button class="submit-btn" onclick={handleRescore} disabled={rescoreLoading}>
			{rescoreLoading ? 'Enriching & rescoring…' : 'Enrich & Rescore All Leads'}
		</button>
	</div>

	{#if rescoreLoading && rescoreProgress.total > 0}
		{@const pct = Math.round(((rescoreProgress.done + rescoreProgress.failed) / rescoreProgress.total) * 100)}
		<div class="status-card info progress-card">
			<div class="progress-header">
				<span class="progress-label">Enriching & rescoring…</span>
				<span class="progress-pct">{pct}%</span>
			</div>
			<div class="progress-track">
				<div class="progress-fill" style="width: {pct}%"></div>
			</div>
			<div class="progress-meta">
				<span class="progress-name">{rescoreProgress.currentName}</span>
				<span class="progress-counts">{rescoreProgress.done} done · {rescoreProgress.failed} failed · {rescoreProgress.total - rescoreProgress.done - rescoreProgress.failed} left</span>
			</div>
		</div>
	{:else if rescoreLoading}
		<div class="status-card info"><span class="spinner"></span> Loading leads…</div>
	{/if}

	{#if rescoreResult}
		<div class="status-card success">
			<div class="result-headline">
				<span class="result-num">{rescoreResult.updated}</span>
				<span>/ {rescoreResult.total} leads updated</span>
			</div>
		</div>
	{/if}

	{#if rescoreError}
		<div class="status-card err">{rescoreError}</div>
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

	.section-divider {
		border-top: 1px solid #1a1a2e;
		margin: 2rem 0 1.5rem;
	}

	.section-title {
		font-size: 1.25rem;
		color: #f1f5f9;
		margin-bottom: 0.4rem;
	}

	.progress-card {
		flex-direction: column;
		gap: 0.5rem;
	}

	.progress-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.progress-label {
		color: #94a3b8;
		font-size: 0.875rem;
	}

	.progress-pct {
		color: #7c3aed;
		font-weight: 600;
		font-size: 0.875rem;
	}

	.progress-track {
		width: 100%;
		height: 6px;
		background: #2a2a3e;
		border-radius: 3px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #7c3aed, #a855f7);
		border-radius: 3px;
		transition: width 0.3s ease;
	}

	.progress-meta {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
	}

	.progress-name {
		color: #e2e8f0;
		font-style: italic;
		max-width: 60%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.progress-counts {
		color: #64748b;
	}
</style>
