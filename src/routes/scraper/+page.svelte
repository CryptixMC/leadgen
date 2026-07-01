<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { triggerScrape, rescoreLeads } from '$lib/api';
	import { generateCoveringGrid, DEFAULT_CELL_RADIUS_M, type LatLng } from '$lib/geo';

	let allBusinesses = $state(false);
	let category = $state('');
	let city = $state('Winnipeg MB');
	let neighborhood = $state('');
	let target = $state(60);
	let loading = $state(false);
	let result = $state<{ upserted: number; category: string; city: string; pages_fetched: number } | null>(null);
	let error = $state('');

	let rescoreLoading = $state(false);
	let rescoreResult = $state<{ updated: number; total: number } | null>(null);
	let rescoreError = $state('');

	// Area (polygon) mode
	let mode = $state<'text' | 'polygon'>('text');
	let polygon = $state<LatLng[] | null>(null);
	let mapContainer: HTMLDivElement | undefined = $state();
	let mapInstance: any = null;
	let L: any = null;
	let drawnItemsLayer: any = null;
	let drawControl: any = null;

	const cellEstimate = $derived(
		polygon && polygon.length >= 3 ? generateCoveringGrid(polygon, DEFAULT_CELL_RADIUS_M).length : 0
	);

	async function setMode(newMode: 'text' | 'polygon') {
		mode = newMode;
		if (newMode === 'polygon') {
			await tick();
			await initMap();
		}
	}

	async function initMap() {
		if (mapInstance || !mapContainer) return;
		L = (await import('leaflet')).default;
		await import('leaflet-draw');
		mapInstance = L.map(mapContainer).setView([49.8, -97.1], 12);
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
		}).addTo(mapInstance);

		drawnItemsLayer = new L.FeatureGroup().addTo(mapInstance);
		drawControl = new L.Control.Draw({
			draw: {
				polygon: true,
				rectangle: true,
				marker: false,
				circle: false,
				circlemarker: false,
				polyline: false
			},
			edit: { featureGroup: drawnItemsLayer }
		});
		mapInstance.addControl(drawControl);
		mapInstance.on(L.Draw.Event.CREATED, handleDrawCreated);
	}

	function handleDrawCreated(e: any) {
		drawnItemsLayer.clearLayers();
		drawnItemsLayer.addLayer(e.layer);
		const latlngs = e.layer.getLatLngs()[0] as Array<{ lat: number; lng: number }>;
		polygon = latlngs.map((p) => [p.lat, p.lng] as LatLng);
	}

	function clearPolygon() {
		if (drawnItemsLayer) drawnItemsLayer.clearLayers();
		polygon = null;
	}

	onDestroy(() => mapInstance?.remove());

	async function handleRescore() {
		rescoreLoading = true;
		rescoreError = '';
		rescoreResult = null;
		try {
			rescoreResult = await rescoreLeads({ force: true });
		} catch (err) {
			rescoreError = err instanceof Error ? err.message : 'Rescore failed';
		} finally {
			rescoreLoading = false;
		}
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!allBusinesses && !category.trim()) return;
		if (mode === 'polygon' && (!polygon || polygon.length < 3)) return;

		loading = true;
		error = '';
		result = null;

		try {
			result =
				mode === 'polygon'
					? await triggerScrape(allBusinesses ? '' : category.trim(), '', target, undefined, polygon!)
					: await triggerScrape(allBusinesses ? '' : category.trim(), city.trim(), target, neighborhood.trim() || undefined);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Scrape failed';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Scraper — LeadGen</title>
	{#if mode === 'polygon'}
		<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
		<link rel="stylesheet" href="https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css" />
	{/if}
</svelte:head>

<main>
	<h1>Run Scraper</h1>
	<p class="subtitle">Pulls leads from Google Places and upserts them into the database.</p>

	<form onsubmit={handleSubmit} class="card">
		<div class="field">
			<div class="category-header">
				<label for="category">Category</label>
				<label class="all-toggle">
					<input type="checkbox" bind:checked={allBusinesses} disabled={loading} />
					All business types
				</label>
			</div>
			{#if !allBusinesses}
				<input
					id="category"
					type="text"
					bind:value={category}
					placeholder="e.g. restaurant, plumber, dentist"
					required
					disabled={loading}
				/>
			{:else}
				<div class="all-badge">Every type of business — no filter applied</div>
			{/if}
		</div>

		<div class="field">
			<label for="location-mode">Location</label>
			<div class="mode-toggle" id="location-mode">
				<button
					type="button"
					class="mode-btn"
					class:active={mode === 'text'}
					disabled={loading}
					onclick={() => setMode('text')}
				>City / Neighborhood</button>
				<button
					type="button"
					class="mode-btn"
					class:active={mode === 'polygon'}
					disabled={loading}
					onclick={() => setMode('polygon')}
				>Draw Area on Map</button>
			</div>
		</div>

		{#if mode === 'text'}
			<div class="field">
				<label for="city">City</label>
				<input
					id="city"
					type="text"
					bind:value={city}
					placeholder="e.g. Winnipeg MB"
					required={mode === 'text'}
					disabled={loading}
				/>
			</div>

			<div class="field">
				<label for="neighborhood">Neighborhood <span class="optional">(optional)</span></label>
				<input
					id="neighborhood"
					type="text"
					bind:value={neighborhood}
					placeholder="e.g. Exchange District, St. Vital"
					disabled={loading}
				/>
				<p class="field-hint">Narrows the search to a specific area — great for D2D walking routes.</p>
			</div>
		{:else}
			<div class="field">
				<p class="field-hint">Draw a polygon or rectangle around the block(s) you want to canvass. Only businesses inside the shape are pulled in.</p>
				<div bind:this={mapContainer} class="draw-map"></div>
				<div class="polygon-status">
					{#if polygon}
						<span>Area selected — ~{cellEstimate} search cell{cellEstimate === 1 ? '' : 's'}</span>
						<button type="button" class="clear-polygon-btn" onclick={clearPolygon} disabled={loading}>Clear area</button>
					{:else}
						<span>No area drawn yet.</span>
					{/if}
				</div>
			</div>
		{/if}

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

		<button
			type="submit"
			class="submit-btn"
			disabled={loading || (!allBusinesses && !category.trim()) || (mode === 'polygon' && (!polygon || polygon.length < 3))}
		>
			{loading ? 'Scraping…' : 'Run Scrape'}
		</button>
	</form>

	{#if loading}
		<div class="status-card info">
			<span class="spinner"></span>
			{#if mode === 'polygon'}
				Scraping up to <strong>{target}</strong> leads for <strong>{category}</strong> in the drawn area…
			{:else}
				Scraping up to <strong>{target}</strong> leads for <strong>{category}</strong> in {neighborhood.trim() ? `<strong>${neighborhood}</strong>, ` : ''}<strong>{city}</strong>…
			{/if}
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

	{#if rescoreLoading}
		<div class="status-card info"><span class="spinner"></span> Enriching & rescoring all leads in parallel…</div>
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

	.category-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.all-toggle {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 500;
		color: var(--text-muted);
		text-transform: none;
		letter-spacing: 0;
		cursor: pointer;
	}

	.all-toggle input[type='checkbox'] {
		width: auto;
		accent-color: var(--accent-primary);
		cursor: pointer;
	}

	.all-badge {
		background: rgba(124, 58, 237, 0.1);
		border: 1px dashed rgba(124, 58, 237, 0.35);
		color: #a78bfa;
		padding: 0.55rem 0.85rem;
		border-radius: var(--radius-sm);
		font-size: 0.8rem;
	}

	.optional {
		font-weight: 400;
		text-transform: none;
		letter-spacing: 0;
		color: var(--text-muted);
		opacity: 0.6;
		font-size: 0.7rem;
	}

	.field-hint {
		color: var(--text-muted);
		font-size: 0.72rem;
		opacity: 0.65;
		margin: 0;
	}

	input:disabled {
		opacity: 0.5;
	}

	.mode-toggle {
		display: flex;
		gap: 0.5rem;
	}

	.mode-btn {
		flex: 1;
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		color: var(--text-muted);
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius-sm);
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: border-color var(--dur-fast), color var(--dur-fast), background var(--dur-fast);
	}

	.mode-btn.active {
		background: rgba(124, 58, 237, 0.15);
		border-color: #7C3AED;
		color: #C4B5FD;
	}

	.mode-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.draw-map {
		width: 100%;
		height: 280px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-subtle);
		overflow: hidden;
	}

	.polygon-status {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.clear-polygon-btn {
		background: transparent;
		border: 1px solid var(--border-subtle);
		color: var(--text-muted);
		padding: 0.3rem 0.75rem;
		border-radius: var(--radius-pill);
		font-size: 0.75rem;
		cursor: pointer;
	}

	.clear-polygon-btn:hover:not(:disabled) {
		border-color: #f87171;
		color: #f87171;
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

	@media (max-width: 768px) {
		main {
			padding: 1rem;
		}

		.card {
			padding: 1.25rem;
		}

		.submit-btn {
			min-height: 44px;
		}

		input {
			min-height: 44px;
		}

		.mode-btn {
			min-height: 44px;
		}
	}
</style>
