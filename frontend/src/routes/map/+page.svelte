<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabase';
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
		if (priority === 'high') return { fill: '#e879f9', border: '#a21caf' };
		if (priority === 'medium') return { fill: '#818cf8', border: '#4f46e5' };
		return { fill: '#64748b', border: '#334155' };
	}

	function renderMarkers() {
		if (!mapInstance || !L) return;
		if (markersLayer) markersLayer.remove();
		markersLayer = L.layerGroup().addTo(mapInstance);

		for (const lead of filtered) {
			const { fill, border } = markerColor(lead.priority);
			const icon = L.divIcon({
				className: '',
				html: `<div style="width:14px;height:14px;background:${fill};border:2px solid ${border};border-radius:50%;box-shadow:0 0 6px ${fill}88;cursor:pointer;"></div>`,
				iconSize: [14, 14],
				iconAnchor: [7, 7],
				popupAnchor: [0, -10]
			});
			const marker = L.marker([lead.latitude!, lead.longitude!], { icon });
			const priorityBadge = `<span style="background:${fill}22;color:${fill};padding:2px 6px;border-radius:4px;font-size:0.7rem;">${lead.priority ?? '—'}</span>`;
			marker.bindPopup(
				L.popup({ maxWidth: 260 }).setContent(`
					<div style="font-family:'DM Sans',sans-serif;color:#e2e8f0;background:#10101a;padding:0.5rem;">
						<strong style="font-family:'JetBrains Mono',monospace;font-size:0.9rem;color:#f1f5f9;">${lead.business_name}</strong>
						<p style="color:#94a3b8;font-size:0.75rem;margin:0.2rem 0;">${lead.address}</p>
						<div style="display:flex;gap:0.4rem;margin:0.3rem 0;align-items:center;">
							${priorityBadge}
							<span style="color:#64748b;font-size:0.7rem;">${lead.status}</span>
						</div>
						<p style="color:#e879f9;font-family:'JetBrains Mono',monospace;font-size:1rem;font-weight:700;margin:0.2rem 0;">${lead.lead_score ?? '—'}</p>
						<a href="/leads/${lead.id}" style="color:#7c3aed;font-size:0.8rem;">View details →</a>
					</div>
				`)
			);
			markersLayer.addLayer(marker);
		}
	}

	$effect(() => {
		// Track reactive deps — filtered changes when statusFilter, priorityFilter, or leads change
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
			const {
				data: { session }
			} = await supabase.auth.getSession();
			geocodeResult = await geocodeMissing(session?.access_token ?? undefined);
			leads = await fetchLeads({}, fetch, session?.access_token ?? undefined);
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
		background: #0d0d1a;
		border-bottom: 1px solid #1a1a2e;
		flex-wrap: wrap;
	}

	h1 {
		font-size: 1rem;
		color: #f1f5f9;
		margin-right: 0.5rem;
	}

	.filters {
		display: flex;
		gap: 0.5rem;
	}

	select {
		background: #13131f;
		border: 1px solid #2a2a3e;
		color: #e2e8f0;
		padding: 0.3rem 0.6rem;
		border-radius: 6px;
		font-size: 0.85rem;
		cursor: pointer;
	}

	.counts {
		color: #64748b;
		font-size: 0.85rem;
	}

	.geocode-btn {
		background: #1a1a2e;
		border: 1px solid #7c3aed;
		color: #a78bfa;
		padding: 0.3rem 0.75rem;
		border-radius: 6px;
		font-size: 0.85rem;
		cursor: pointer;
		transition: border-color 0.15s;
	}

	.geocode-btn:hover:not(:disabled) {
		border-color: #d946ef;
		color: #e879f9;
	}

	.geocode-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.geocode-result {
		color: #4ade80;
		font-size: 0.8rem;
	}

	.map {
		width: 100%;
		height: calc(100vh - 57px - 49px);
	}

	:global(.leaflet-popup-content-wrapper) {
		background: #10101a;
		border: 1px solid #2a2a3e;
		border-radius: 8px;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
		padding: 0;
	}

	:global(.leaflet-popup-content) {
		margin: 0;
	}

	:global(.leaflet-popup-tip) {
		background: #10101a;
	}

	:global(.leaflet-popup-close-button) {
		color: #64748b !important;
		font-size: 1rem !important;
		padding: 4px 6px !important;
	}
</style>
