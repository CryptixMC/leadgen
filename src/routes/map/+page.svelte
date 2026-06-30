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

	// Route mode state
	let routeMode = $state(false);
	let routeStops = $state<Lead[]>([]);
	let routePolyline: any = null;

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

	const routeStopIds = $derived(new Set(routeStops.map((s) => s.id)));

	function markerColor(priority: string | null) {
		if (priority === 'high') return { fill: '#D946EF', border: '#6B21A8' };
		if (priority === 'medium') return { fill: '#818cf8', border: '#4f46e5' };
		return { fill: '#9090B0', border: '#4a4a6e' };
	}

	function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
		const R = 6371;
		const dLat = ((lat2 - lat1) * Math.PI) / 180;
		const dLng = ((lng2 - lng1) * Math.PI) / 180;
		const a =
			Math.sin(dLat / 2) ** 2 +
			Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
		return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	}

	function optimizeRoute() {
		if (routeStops.length < 3) return;
		const stops = [...routeStops];
		const visited = [stops[0]];
		const remaining = stops.slice(1);
		while (remaining.length) {
			const last = visited[visited.length - 1];
			let bestIdx = 0;
			let bestDist = Infinity;
			for (let i = 0; i < remaining.length; i++) {
				const d = haversineKm(last.latitude!, last.longitude!, remaining[i].latitude!, remaining[i].longitude!);
				if (d < bestDist) { bestDist = d; bestIdx = i; }
			}
			visited.push(remaining.splice(bestIdx, 1)[0]);
		}
		routeStops = visited;
		drawRoutePolyline();
	}

	function toggleRouteStop(lead: Lead) {
		if (routeStopIds.has(lead.id)) {
			routeStops = routeStops.filter((s) => s.id !== lead.id);
		} else {
			routeStops = [...routeStops, lead];
		}
		drawRoutePolyline();
	}

	function drawRoutePolyline() {
		if (!mapInstance || !L) return;
		if (routePolyline) { routePolyline.remove(); routePolyline = null; }
		if (routeStops.length < 2) return;
		const latlngs = routeStops.map((s) => [s.latitude!, s.longitude!]);
		routePolyline = L.polyline(latlngs, {
			color: '#7C3AED',
			weight: 3,
			opacity: 0.85,
			dashArray: '8 6'
		}).addTo(mapInstance);
	}

	function clearRoute() {
		routeStops = [];
		if (routePolyline) { routePolyline.remove(); routePolyline = null; }
		renderMarkers();
	}

	function toggleRouteMode() {
		routeMode = !routeMode;
		if (!routeMode) clearRoute();
		else renderMarkers();
	}

	function buildGoogleMapsUrl(): string {
		if (routeStops.length < 2) return '';
		const stops = routeStops.map((s) =>
			s.latitude && s.longitude
				? `${s.latitude},${s.longitude}`
				: encodeURIComponent(s.address)
		);
		return `https://www.google.com/maps/dir/${stops.join('/')}`;
	}

	function renderMarkers() {
		if (!mapInstance || !L) return;
		if (markersLayer) markersLayer.remove();
		markersLayer = L.layerGroup().addTo(mapInstance);

		for (const lead of filtered) {
			const isInRoute = routeStopIds.has(lead.id);
			const routeIdx = routeStops.findIndex((s) => s.id === lead.id);
			const { fill, border } = markerColor(lead.priority);

			let iconHtml: string;
			if (routeMode && isInRoute) {
				iconHtml = `<div style="width:22px;height:22px;background:#7C3AED;border:2px solid #A78BFA;border-radius:50%;box-shadow:0 0 10px #7C3AED99;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:0.6rem;font-weight:700;color:#fff;font-family:'JetBrains Mono',monospace;">${routeIdx + 1}</div>`;
			} else if (routeMode) {
				iconHtml = `<div style="width:14px;height:14px;background:${fill};border:2px solid ${border};border-radius:50%;box-shadow:0 0 8px ${fill}88;cursor:pointer;opacity:0.5;"></div>`;
			} else {
				iconHtml = `<div style="width:14px;height:14px;background:${fill};border:2px solid ${border};border-radius:50%;box-shadow:0 0 8px ${fill}88;cursor:pointer;"></div>`;
			}

			const iconSize: [number, number] = routeMode && isInRoute ? [22, 22] : [14, 14];
			const iconAnchor: [number, number] = routeMode && isInRoute ? [11, 11] : [7, 7];

			const icon = L.divIcon({
				className: '',
				html: iconHtml,
				iconSize,
				iconAnchor,
				popupAnchor: [0, -12]
			});

			const marker = L.marker([lead.latitude!, lead.longitude!], { icon });

			if (routeMode) {
				marker.on('click', () => {
					toggleRouteStop(lead);
					renderMarkers();
				});
			} else {
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
			}
			markersLayer.addLayer(marker);
		}
	}

	$effect(() => {
		void filtered;
		void routeStopIds;
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
		<select bind:value={statusFilter} disabled={routeMode}>
			<option value="">All statuses</option>
			<option value="cold">Cold</option>
			<option value="contacted">Contacted</option>
			<option value="proposal">Proposal</option>
			<option value="closed_won">Closed Won</option>
			<option value="closed_lost">Closed Lost</option>
		</select>
		<select bind:value={priorityFilter} disabled={routeMode}>
			<option value="">All priorities</option>
			<option value="high">High</option>
			<option value="medium">Medium</option>
			<option value="low">Low</option>
		</select>
	</div>
	<span class="counts">{filtered.length} pins shown</span>
	{#if withoutCoords.length > 0}
		<button onclick={handleGeocode} disabled={geocoding || routeMode} class="geocode-btn">
			{geocoding ? 'Geocoding…' : `Geocode ${withoutCoords.length} missing`}
		</button>
	{/if}
	{#if geocodeResult}
		<span class="geocode-result">✓ {geocodeResult.geocoded} geocoded, {geocodeResult.failed} failed</span>
	{/if}
	<button onclick={toggleRouteMode} class="route-toggle-btn" class:active={routeMode}>
		{routeMode ? '✕ Exit Route Mode' : '🚶 Plan Route'}
	</button>
</div>

<div class="map-wrapper">
	<div bind:this={mapContainer} class="map"></div>

	{#if routeMode}
		<div class="route-panel">
			<div class="route-panel-header">
				<span class="route-panel-title">Walking Route</span>
				<span class="route-stop-count">{routeStops.length} stops</span>
			</div>
			<p class="route-hint">Click pins on the map to add stops.</p>

			{#if routeStops.length > 0}
				<ol class="route-stop-list">
					{#each routeStops as stop, i (stop.id)}
						<li class="route-stop-item">
							<span class="stop-num">{i + 1}</span>
							<div class="stop-info">
								<span class="stop-name">{stop.business_name}</span>
								<span class="stop-addr">{stop.address}</span>
							</div>
							<button class="stop-remove" onclick={() => { toggleRouteStop(stop); renderMarkers(); }} aria-label="Remove stop">✕</button>
						</li>
					{/each}
				</ol>

				<div class="route-actions">
					{#if routeStops.length >= 3}
						<button class="route-btn optimize" onclick={optimizeRoute}>Optimize order</button>
					{/if}
					{#if routeStops.length >= 2}
						<a
							href={buildGoogleMapsUrl()}
							target="_blank"
							rel="noopener noreferrer"
							class="route-btn gmaps"
						>Open in Google Maps</a>
					{/if}
					<button class="route-btn clear" onclick={clearRoute}>Clear</button>
				</div>
			{/if}
		</div>
	{/if}
</div>

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

	.route-toggle-btn {
		background: transparent;
		border: 1px solid rgba(124, 58, 237, 0.35);
		color: #a78bfa;
		padding: 0.3rem 0.85rem;
		border-radius: var(--radius-pill);
		font-size: 0.85rem;
		cursor: pointer;
		transition: border-color var(--dur-fast), color var(--dur-fast), background var(--dur-fast);
		margin-left: auto;
	}

	.route-toggle-btn:hover {
		border-color: var(--accent-highlight);
		color: #F0ABFC;
	}

	.route-toggle-btn.active {
		background: rgba(124, 58, 237, 0.2);
		border-color: #7C3AED;
		color: #C4B5FD;
	}

	.map-wrapper {
		position: relative;
		width: 100%;
		height: calc(100vh - 60px - 49px);
		display: flex;
	}

	.map {
		flex: 1;
		height: 100%;
	}

	.route-panel {
		width: 280px;
		flex-shrink: 0;
		background: rgba(10, 10, 15, 0.92);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border-left: 1px solid var(--border-grid);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.route-panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.85rem 1rem 0.5rem;
		border-bottom: 1px solid var(--border-grid);
	}

	.route-panel-title {
		font-family: var(--font-display);
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--text-primary);
	}

	.route-stop-count {
		font-size: 0.75rem;
		color: #A78BFA;
		background: rgba(124, 58, 237, 0.15);
		padding: 2px 8px;
		border-radius: 100px;
	}

	.route-hint {
		color: var(--text-muted);
		font-size: 0.75rem;
		padding: 0.5rem 1rem 0;
		margin: 0;
		opacity: 0.7;
	}

	.route-stop-list {
		list-style: none;
		margin: 0;
		padding: 0.5rem 0;
		overflow-y: auto;
		flex: 1;
	}

	.route-stop-item {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.04);
	}

	.stop-num {
		flex-shrink: 0;
		width: 20px;
		height: 20px;
		background: #7C3AED;
		border-radius: 50%;
		font-size: 0.6rem;
		font-weight: 700;
		font-family: var(--font-mono);
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-top: 2px;
	}

	.stop-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}

	.stop-name {
		font-size: 0.8rem;
		color: var(--text-primary);
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.stop-addr {
		font-size: 0.7rem;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.stop-remove {
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 0.7rem;
		padding: 2px 4px;
		border-radius: 4px;
		flex-shrink: 0;
		opacity: 0.5;
		transition: opacity var(--dur-fast), color var(--dur-fast);
	}

	.stop-remove:hover {
		opacity: 1;
		color: #f87171;
	}

	.route-actions {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.75rem 1rem;
		border-top: 1px solid var(--border-grid);
	}

	.route-btn {
		width: 100%;
		padding: 0.5rem;
		border-radius: var(--radius-sm);
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		text-align: center;
		text-decoration: none;
		display: block;
		transition: opacity var(--dur-fast);
	}

	.route-btn:hover {
		opacity: 0.85;
	}

	.route-btn.optimize {
		background: rgba(124, 58, 237, 0.2);
		border: 1px solid rgba(124, 58, 237, 0.4);
		color: #C4B5FD;
	}

	.route-btn.gmaps {
		background: rgba(45, 198, 83, 0.12);
		border: 1px solid rgba(45, 198, 83, 0.3);
		color: #86efac;
	}

	.route-btn.clear {
		background: transparent;
		border: 1px solid var(--border-subtle);
		color: var(--text-muted);
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

	@media (max-width: 768px) {
		.toolbar {
			padding: 0.6rem 1rem;
			gap: 0.5rem;
		}

		.filters {
			flex-wrap: wrap;
		}

		select {
			min-height: 44px;
			flex: 1;
		}

		.geocode-btn {
			min-height: 44px;
		}

		.route-toggle-btn {
			min-height: 44px;
			margin-left: 0;
		}

		.map-wrapper {
			flex-direction: column;
			height: calc(100vh - 60px - 90px);
		}

		.map {
			flex: 1;
			height: auto;
		}

		.route-panel {
			width: 100%;
			height: 220px;
			border-left: none;
			border-top: 1px solid var(--border-grid);
		}
	}
</style>
