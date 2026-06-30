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
		color: var(--text-primary);
		margin-bottom: 0.4rem;
	}

	.subtitle {
		color: var(--text-muted);
		font-size: 0.875rem;
		margin-bottom: 2rem;
	}

	.card {
		background: var(--bg-card);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
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
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.12em;
	}

	input {
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		color: var(--text-primary);
		padding: 0.55rem 0.85rem;
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

	.submit-btn {
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

	.submit-btn:hover:not(:disabled) {
		box-shadow: var(--glow-cta);
		transform: translateY(-1px);
	}

	.submit-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.status-card {
		border-radius: var(--radius-md);
		padding: 1.25rem 1.5rem;
		font-size: 0.875rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.status-card.info {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid var(--border-subtle);
		color: var(--text-muted);
		flex-direction: row;
		align-items: center;
		gap: 0.75rem;
	}

	.status-card.success {
		background: rgba(45, 198, 83, 0.08);
		border: 1px solid rgba(45, 198, 83, 0.25);
		color: #86efac;
	}

	.status-card.err {
		background: rgba(248, 113, 113, 0.08);
		border: 1px solid rgba(248, 113, 113, 0.2);
		color: #f87171;
	}

	.result-headline {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}

	.result-num {
		font-family: var(--font-display);
		font-size: 2rem;
		font-weight: 700;
		color: var(--accent-highlight);
	}

	.result-detail {
		color: var(--state-success);
		font-size: 0.8rem;
	}

	.view-link {
		color: var(--accent-highlight);
		font-size: 0.85rem;
		font-weight: 500;
	}

	.view-link:hover {
		color: var(--accent-primary);
	}

	.spinner {
		display: inline-block;
		width: 14px;
		height: 14px;
		border: 2px solid var(--border-subtle);
		border-top-color: var(--accent-primary);
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
		flex-shrink: 0;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.section-divider {
		border-top: 1px solid var(--border-grid);
		margin: 2rem 0 1.5rem;
	}

	.section-title {
		font-size: 1.25rem;
		color: var(--text-primary);
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
		color: var(--text-muted);
		font-size: 0.875rem;
	}

	.progress-pct {
		color: var(--accent-primary);
		font-weight: 600;
		font-size: 0.875rem;
	}

	.progress-track {
		width: 100%;
		height: 6px;
		background: var(--border-subtle);
		border-radius: 3px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: var(--gradient-primary);
		border-radius: 3px;
		transition: width 0.3s ease;
	}

	.progress-meta {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
	}

	.progress-name {
		color: var(--text-primary);
		font-style: italic;
		max-width: 60%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.progress-counts {
		color: var(--text-muted);
	}
</style>
