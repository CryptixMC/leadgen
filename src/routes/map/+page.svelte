<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fetchLeads, geocodeMissing, type Lead } from '$lib/api';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let leads = $state<Lead[]>(data.leads);
	let statusFilter = $state('');
	let priorityFilter = $state('');
	let geocoding = $state(false);
	let geocodeResult = $state<{ geocoded: number; failed: number; skipped: number } | null>(null);

	let mapContainer: HTMLDivElement;
	let mapInstance: any = null;
	let L: any = null;
	let markersLayer: any = null;

	const withCoords = $derived(leads.filter((l) => l.latitude !== null && l.longitude !== null));
	const withoutCoords = $derived(leads.filter((l) => l.latitude === null || l.longitude === null));
	const filtered = $derived(
		withCoords
			.filter((l) => (statusFilter ? l.status === statusFilter : true))
			.filter((l) => (priorityFilter ? l.priority === priorityFilter : true))
	);

	function markerColor(priority: string | null) {
		if (priority === 'high') return { fill: '#D946EF', border: '#6B21A8' };
		if (priority === 'medium') return { fill: '#818cf8', border: '#4f46e5' };
		return { fill: '#9090B0', border: '#4a4a6e' };
	}

	function renderMarkers() {
		if (!mapInstance || !L) return;
		if (markersLayer) markersLayer.remove();
		markersLayer = L.layerGroup().addTo(mapInstance);

		for (const lead of filtered) {
			const { fill, border } = markerColor(lead.priority);
			const icon = L.divIcon({
				className: '',
				html: `<div style="width:14px;height:14px;background:${fill};border:2px solid ${border};border-radius:50%;box-shadow:0 0 8px ${fill}88;cursor:pointer;"></div>`,
				iconSize: [14, 14],
				iconAnchor: [7, 7],
				popupAnchor: [0, -10]
			});
			const marker = L.marker([lead.latitude!, lead.longitude!], { icon });
			const priorityBadge = `<span style="background:${fill}22;color:${fill};padding:2px 6px;border-radius:100px;font-size:0.68rem;font-family:'Syne',sans-serif;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">${lead.priority ?? '—'}</span>`;
			marker.bindPopup(
				L.popup({ maxWidth: 260 }).setContent(`
					<div style="font-family:'DM Sans',sans-serif;color:#F5F0FF;background:#111118;padding:0.65rem 0.75rem;border-radius:8px;">
						<strong style="font-family:'JetBrains Mono',monospace;font-size:0.9rem;color:#F5F0FF;letter-spacing:-0.02em;">${lead.business_name}</strong>
						<p style="color:#9090B0;font-size:0.75rem;margin:0.25rem 0;">${lead.address}</p>
						<div style="display:flex;gap:0.4rem;margin:0.35rem 0;align-items:center;">
							${priorityBadge}
							<span style="color:#9090B0;font-size:0.7rem;">${lead.status}</span>
						</div>
						<p style="color:#D946EF;font-family:'JetBrains Mono',monospace;font-size:1rem;font-weight:700;margin:0.2rem 0;">${lead.lead_score ?? '—'}</p>
						<a href="/leads/${lead.id}" style="color:#7C3AED;font-size:0.8rem;">View details →</a>
					</div>
				`)
			);
			markersLayer.addLayer(marker);
		}
	}

	$effect(() => {
		void filtered;
		renderMarkers();
	});

	onMount(async () => {
		L = (await import('leaflet')).default;
		mapInstance = L.map(mapContainer).setView([49.8, -97.1], 10);
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
		}).addTo(mapInstance);
		renderMarkers();
		if (withCoords.length > 0) {
			const pts = withCoords.map((l) => [l.latitude!, l.longitude!] as [number, number]);
			mapInstance.fitBounds(L.latLngBounds(pts), { padding: [40, 40] });
		}
	});

	onDestroy(() => mapInstance?.remove());

	async function handleGeocode() {
		geocoding = true;
		geocodeResult = null;
		try {
			geocodeResult = await geocodeMissing();
			leads = await fetchLeads({}, fetch);
		} finally {
			geocoding = false;
		}
	}
</script>

<svelte:head>
	<title>Map — LeadGen</title>
	<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
</svelte:head>

<div class="toolbar">
	<h1>Lead Map</h1>
	<div class="filters">
		<select bind:value={statusFilter}>
			<option value="">All statuses</option>
			<option value="cold">Cold</option>
			<option value="contacted">Contacted</option>
			<option value="proposal">Proposal</option>
			<option value="closed_won">Closed Won</option>
			<option value="closed_lost">Closed Lost</option>
		</select>
		<select bind:value={priorityFilter}>
			<option value="">All priorities</option>
			<option value="high">High</option>
			<option value="medium">Medium</option>
			<option value="low">Low</option>
		</select>
	</div>
	<span class="counts">{filtered.length} pins shown</span>
	{#if withoutCoords.length > 0}
		<button onclick={handleGeocode} disabled={geocoding} class="geocode-btn">
			{geocoding ? 'Geocoding…' : `Geocode ${withoutCoords.length} missing`}
		</button>
	{/if}
	{#if geocodeResult}
		<span class="geocode-result">✓ {geocodeResult.geocoded} geocoded, {geocodeResult.failed} failed</span>
	{/if}
</div>

<div bind:this={mapContainer} class="map"></div>

<style>
	.toolbar {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 2rem;
		background: rgba(10, 10, 15, 0.72);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border-bottom: 1px solid var(--border-grid);
		flex-wrap: wrap;
	}

	h1 {
		font-family: var(--font-display);
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--text-primary);
		letter-spacing: -0.02em;
	}

	.filters {
		display: flex;
		gap: 0.5rem;
	}

	select {
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		color: var(--text-primary);
		padding: 0.3rem 0.6rem;
		border-radius: var(--radius-sm);
		font-size: 0.85rem;
		cursor: pointer;
		outline: none;
		transition: border-color var(--dur-fast);
	}

	select:focus {
		border-color: var(--accent-primary);
	}

	.counts {
		color: var(--text-muted);
		font-size: 0.85rem;
	}

	.geocode-btn {
		background: transparent;
		border: 1px solid rgba(124, 58, 237, 0.35);
		color: #a78bfa;
		padding: 0.3rem 0.85rem;
		border-radius: var(--radius-pill);
		font-size: 0.85rem;
		cursor: pointer;
		transition: border-color var(--dur-fast), color var(--dur-fast);
	}

	.geocode-btn:hover:not(:disabled) {
		border-color: var(--accent-highlight);
		color: #F0ABFC;
	}

	.geocode-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.geocode-result {
		color: var(--state-success);
		font-size: 0.8rem;
	}

	.map {
		width: 100%;
		height: calc(100vh - 60px - 49px);
	}

	:global(.leaflet-popup-content-wrapper) {
		background: #111118;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.6);
		padding: 0;
	}

	:global(.leaflet-popup-content) {
		margin: 0;
	}

	:global(.leaflet-popup-tip) {
		background: #111118;
	}

	:global(.leaflet-popup-close-button) {
		color: #9090B0 !important;
		font-size: 1rem !important;
		padding: 4px 6px !important;
	}
</style>
