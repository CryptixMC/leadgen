<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { Lead } from '$lib/api';
	import { pointInPolygon, haversineKm, type LatLng } from '$lib/geo';
	import 'leaflet/dist/leaflet.css';

	let {
		leads,
		statusFilter,
		priorityFilter,
		categoryFilter,
		searchQuery,
		selected,
		onToggleSelect,
		onSelectMany,
		onGeocodeMissing
	}: {
		leads: Lead[];
		statusFilter: string;
		priorityFilter: string;
		categoryFilter: string;
		searchQuery: string;
		selected: Set<string>;
		onToggleSelect: (id: string) => void;
		onSelectMany: (ids: string[]) => void;
		onGeocodeMissing: () => Promise<{ geocoded: number; failed: number; skipped: number }>;
	} = $props();

	let geocoding = $state(false);
	let geocodeResult = $state<{ geocoded: number; failed: number; skipped: number } | null>(null);

	// Route mode state
	let routeMode = $state(false);
	let routeStops = $state<Lead[]>([]);
	let routePolyline: any = null;

	// Freeform lasso drawing state (gesture-driven, no mode toggle)
	let drawingPolygon: LatLng[] = [];
	let vertexMarkersLayer: any = null;
	let previewShapeLayer: any = null;
	let rectPreviewLayer: any = null;

	// Press-and-hold gesture bookkeeping
	const HOLD_MS = 500;
	const MOVE_CANCEL_PX = 10;
	const DRAG_THRESHOLD_PX = 8;
	let holdTimer: ReturnType<typeof setTimeout> | null = null;
	let holdOrigin: { point: any; latlng: LatLng } | null = null;
	let holdTriggered = false;
	let isDraggingRect = false;
	let holdIndicatorEl: HTMLDivElement | null = null;

	let mapContainer: HTMLDivElement;
	let mapInstance: any = null;
	let L: any = null;
	let markersLayer: any = null;
	let resizeObserver: ResizeObserver | null = null;

	const withCoords = $derived(leads.filter((l) => l.latitude !== null && l.longitude !== null));
	const withoutCoords = $derived(leads.filter((l) => l.latitude === null || l.longitude === null));
	const filtered = $derived(
		withCoords
			.filter((l) => (statusFilter ? l.status === statusFilter : true))
			.filter((l) => (priorityFilter ? l.priority === priorityFilter : true))
			.filter((l) => (categoryFilter ? l.category === categoryFilter : true))
			.filter((l) => {
				if (!searchQuery.trim()) return true;
				const q = searchQuery.toLowerCase();
				return (
					l.business_name?.toLowerCase().includes(q) ||
					l.address?.toLowerCase().includes(q) ||
					l.phone?.toLowerCase().includes(q) ||
					l.email?.toLowerCase().includes(q) ||
					l.website_url?.toLowerCase().includes(q)
				);
			})
	);

	const routeStopIds = $derived(new Set(routeStops.map((s) => s.id)));

	function markerColor(priority: string | null) {
		if (priority === 'high') return { fill: '#D946EF', border: '#6B21A8' };
		if (priority === 'medium') return { fill: '#818cf8', border: '#4f46e5' };
		return { fill: '#9090B0', border: '#4a4a6e' };
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
		cancelDrawing();
		if (!routeMode) clearRoute();
		else renderMarkers();
	}

	function cancelDrawing() {
		drawingPolygon = [];
		if (vertexMarkersLayer) vertexMarkersLayer.clearLayers();
		if (previewShapeLayer) { previewShapeLayer.remove(); previewShapeLayer = null; }
		if (rectPreviewLayer) { rectPreviewLayer.remove(); rectPreviewLayer = null; }
		if (holdTriggered && mapInstance) mapInstance.dragging.enable();
		clearHoldState();
	}

	// Press-and-hold indicator: a small ring that "charges" while the pointer
	// is held down, so the gesture is visible instead of a blind timing race.
	function containerPointOf(latlng: LatLng): any {
		return mapInstance.latLngToContainerPoint(latlng);
	}

	function showHoldIndicator(point: any) {
		if (!mapContainer) return;
		hideHoldIndicator();
		holdIndicatorEl = document.createElement('div');
		holdIndicatorEl.className = 'hold-indicator';
		holdIndicatorEl.style.left = `${point.x}px`;
		holdIndicatorEl.style.top = `${point.y}px`;
		holdIndicatorEl.style.setProperty('--hold-ms', `${HOLD_MS}ms`);
		mapContainer.appendChild(holdIndicatorEl);
	}

	function triggerHoldIndicatorVisual() {
		holdIndicatorEl?.classList.add('triggered');
	}

	function hideHoldIndicator() {
		if (holdIndicatorEl) {
			holdIndicatorEl.remove();
			holdIndicatorEl = null;
		}
	}

	function clearHoldState() {
		if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
		hideHoldIndicator();
		holdOrigin = null;
		holdTriggered = false;
		isDraggingRect = false;
	}

	function applyEnclosedSelection(enclosed: Lead[]) {
		if (routeMode) {
			routeStops = enclosed;
			drawRoutePolyline();
			renderMarkers();
		} else {
			onSelectMany(enclosed.map((l) => l.id));
		}
	}

	function renderDrawingPreview() {
		if (!mapInstance || !L) return;
		if (vertexMarkersLayer) vertexMarkersLayer.clearLayers();
		else vertexMarkersLayer = L.layerGroup().addTo(mapInstance);

		if (previewShapeLayer) { previewShapeLayer.remove(); previewShapeLayer = null; }
		if (drawingPolygon.length >= 2) {
			previewShapeLayer = L.polyline(drawingPolygon, {
				color: '#2DC653',
				weight: 2,
				dashArray: '6 4'
			}).addTo(mapInstance);
		}

		drawingPolygon.forEach((latlng, i) => {
			const isFirst = i === 0;
			const vertexMarker = L.circleMarker(latlng, {
				radius: isFirst ? 7 : 5,
				color: isFirst ? '#F0ABFC' : '#86efac',
				fillColor: isFirst ? '#D946EF' : '#2DC653',
				fillOpacity: 1,
				weight: 2
			});

			// Same tap-vs-hold primitive as the map: a quick tap on the first
			// vertex closes the shape; holding any vertex deletes it.
			let vertexTimer: ReturnType<typeof setTimeout> | null = null;
			let vertexTriggered = false;
			vertexMarker.on('mousedown', (e: any) => {
				L.DomEvent.stopPropagation(e);
				vertexTriggered = false;
				showHoldIndicator(containerPointOf(latlng));
				vertexTimer = setTimeout(() => {
					vertexTimer = null;
					vertexTriggered = true;
					hideHoldIndicator();
					removeVertex(i);
				}, HOLD_MS);
			});
			vertexMarker.on('mouseup', (e: any) => {
				L.DomEvent.stopPropagation(e);
				if (vertexTimer) { clearTimeout(vertexTimer); vertexTimer = null; }
				hideHoldIndicator();
				if (vertexTriggered) return;
				if (isFirst && drawingPolygon.length >= 3) closePolygon();
			});
			vertexMarkersLayer.addLayer(vertexMarker);
		});
	}

	function addVertex(latlng: LatLng) {
		drawingPolygon = [...drawingPolygon, latlng];
		renderDrawingPreview();
	}

	function removeVertex(index: number) {
		drawingPolygon = drawingPolygon.filter((_, i) => i !== index);
		renderDrawingPreview();
	}

	function closePolygon() {
		if (drawingPolygon.length < 3) return;
		const enclosed = withCoords.filter((l) => pointInPolygon(l.latitude!, l.longitude!, drawingPolygon));
		applyEnclosedSelection(enclosed);
		cancelDrawing();
	}

	function updateRectPreview(a: LatLng, b: LatLng) {
		if (rectPreviewLayer) { rectPreviewLayer.remove(); rectPreviewLayer = null; }
		rectPreviewLayer = L.rectangle(L.latLngBounds([a, b]), {
			color: '#2DC653',
			weight: 2,
			fillOpacity: 0.08,
			dashArray: '6 4'
		}).addTo(mapInstance);
	}

	function finalizeRectangle(a: LatLng, b: LatLng) {
		if (rectPreviewLayer) { rectPreviewLayer.remove(); rectPreviewLayer = null; }
		const bounds = L.latLngBounds([a, b]);
		const enclosed = withCoords.filter((l) => bounds.contains([l.latitude!, l.longitude!]));
		applyEnclosedSelection(enclosed);
	}

	function triggerHold() {
		if (!holdOrigin) return;
		holdTriggered = true;
		triggerHoldIndicatorVisual();
		mapInstance.dragging.disable();
	}

	function handleMapMouseDown(e: any) {
		holdOrigin = { point: e.containerPoint, latlng: [e.latlng.lat, e.latlng.lng] };
		holdTriggered = false;
		isDraggingRect = false;
		showHoldIndicator(e.containerPoint);
		holdTimer = setTimeout(triggerHold, HOLD_MS);
	}

	function handleMapMouseMove(e: any) {
		if (!holdOrigin) return;
		const pt = e.containerPoint;
		if (!holdTriggered) {
			if (pt.distanceTo(holdOrigin.point) > MOVE_CANCEL_PX) clearHoldState();
			return;
		}
		if (!isDraggingRect && pt.distanceTo(holdOrigin.point) > DRAG_THRESHOLD_PX) {
			isDraggingRect = true;
			hideHoldIndicator();
		}
		if (isDraggingRect) {
			updateRectPreview(holdOrigin.latlng, [e.latlng.lat, e.latlng.lng]);
		}
	}

	function handleMapMouseUp(e: any) {
		if (!holdOrigin) return;
		const wasTriggered = holdTriggered;
		const wasDragging = isDraggingRect;
		const origin = holdOrigin;
		if (wasTriggered) mapInstance.dragging.enable();
		clearHoldState();

		if (!wasTriggered) return; // plain tap/drag on empty map — unchanged Leaflet default

		if (wasDragging) {
			finalizeRectangle(origin.latlng, [e.latlng.lat, e.latlng.lng]);
		} else {
			addVertex(origin.latlng);
		}
	}

	function handleMapMouseLeave() {
		if (!holdOrigin) return;
		if (holdTriggered) mapInstance.dragging.enable();
		clearHoldState();
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') cancelDrawing();
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

	let markerById: Map<string, any> = new Map();

	function computeMarkerIcon(lead: Lead): any {
		const isInRoute = routeStopIds.has(lead.id);
		const routeIdx = routeStops.findIndex((s) => s.id === lead.id);
		const isSelected = selected.has(lead.id);
		const { fill, border } = markerColor(lead.priority);

		let iconHtml: string;
		let iconSize: [number, number] = [14, 14];
		let iconAnchor: [number, number] = [7, 7];

		if (routeMode && isInRoute) {
			iconHtml = `<div style="width:22px;height:22px;background:#7C3AED;border:2px solid #A78BFA;border-radius:50%;box-shadow:0 0 10px #7C3AED99;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:0.6rem;font-weight:700;color:#fff;font-family:'JetBrains Mono',monospace;">${routeIdx + 1}</div>`;
			iconSize = [22, 22];
			iconAnchor = [11, 11];
		} else if (routeMode) {
			iconHtml = `<div style="width:14px;height:14px;background:${fill};border:2px solid ${border};border-radius:50%;box-shadow:0 0 8px ${fill}88;cursor:pointer;opacity:0.5;"></div>`;
		} else if (isSelected) {
			iconHtml = `<div style="width:20px;height:20px;background:#2DC653;border:2px solid #86efac;border-radius:50%;box-shadow:0 0 10px #2DC65399;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;color:#fff;">✓</div>`;
			iconSize = [20, 20];
			iconAnchor = [10, 10];
		} else {
			iconHtml = `<div style="width:14px;height:14px;background:${fill};border:2px solid ${border};border-radius:50%;box-shadow:0 0 8px ${fill}88;cursor:pointer;"></div>`;
		}

		return L.divIcon({
			className: '',
			html: iconHtml,
			iconSize,
			iconAnchor,
			popupAnchor: [0, -12]
		});
	}

	// Full rebuild: tears down and recreates every marker (and any open popup).
	// Only needed when the underlying set of markers or their click-handling
	// (route mode vs. default) changes.
	function renderMarkers() {
		if (!mapInstance || !L) return;
		if (markersLayer) markersLayer.remove();
		markersLayer = L.layerGroup().addTo(mapInstance);
		markerById = new Map();

		for (const lead of filtered) {
			const marker = L.marker([lead.latitude!, lead.longitude!], { icon: computeMarkerIcon(lead) });
			marker.on('mousedown', (e: any) => L.DomEvent.stopPropagation(e));

			if (routeMode) {
				marker.on('click', () => {
					toggleRouteStop(lead);
				});
			} else {
				marker.on('click', () => {
					onToggleSelect(lead.id);
				});
				const { fill } = markerColor(lead.priority);
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
			markerById.set(lead.id, marker);
			markersLayer.addLayer(marker);
		}
	}

	// Lightweight update: swaps each marker's icon in place without touching the
	// marker/popup instances, so selecting/deselecting a pin doesn't close an
	// open popup or interrupt an in-progress click on it.
	function refreshMarkerIcons() {
		for (const lead of filtered) {
			const marker = markerById.get(lead.id);
			if (marker) marker.setIcon(computeMarkerIcon(lead));
		}
	}

	$effect(() => {
		void filtered;
		renderMarkers();
	});

	$effect(() => {
		void selected;
		void routeStopIds;
		refreshMarkerIcons();
	});

	onMount(async () => {
		L = (await import('leaflet')).default;
		mapInstance = L.map(mapContainer).setView([49.8, -97.1], 10);
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
		}).addTo(mapInstance);

		mapInstance.on('mousedown', handleMapMouseDown);
		mapInstance.on('mousemove', handleMapMouseMove);
		mapInstance.on('mouseup', handleMapMouseUp);
		mapInstance.on('mouseleave', handleMapMouseLeave);
		window.addEventListener('keydown', handleKeyDown);

		renderMarkers();

		// The flex-based layout may not have settled yet when onMount runs, so the
		// container can still be zero-sized here — fitBounds against a zero-sized
		// container computes a nonsensical zoom/origin. Defer both invalidateSize
		// and the initial fitBounds to the ResizeObserver, which fires immediately
		// with the container's current size and again whenever it actually changes.
		let didInitialFit = false;
		resizeObserver = new ResizeObserver(() => {
			if (!mapInstance) return;
			mapInstance.invalidateSize();
			if (!didInitialFit && withCoords.length > 0 && mapContainer.offsetWidth > 0 && mapContainer.offsetHeight > 0) {
				didInitialFit = true;
				const pts = withCoords.map((l) => [l.latitude!, l.longitude!] as [number, number]);
				mapInstance.fitBounds(L.latLngBounds(pts), { padding: [40, 40] });
			}
		});
		resizeObserver.observe(mapContainer);
	});

	onDestroy(() => {
		if (!mapInstance) return;
		resizeObserver?.disconnect();
		window.removeEventListener('keydown', handleKeyDown);
		mapInstance.remove();
	});

	async function handleGeocode() {
		geocoding = true;
		geocodeResult = null;
		try {
			geocodeResult = await onGeocodeMissing();
		} finally {
			geocoding = false;
		}
	}
</script>

<div class="toolbar">
	<span class="counts">{filtered.length} pins shown</span>
	{#if withoutCoords.length > 0}
		<button onclick={handleGeocode} disabled={geocoding} class="geocode-btn">
			{geocoding ? 'Geocoding…' : `Geocode ${withoutCoords.length} missing`}
		</button>
	{/if}
	{#if geocodeResult}
		<span class="geocode-result">✓ {geocodeResult.geocoded} geocoded, {geocodeResult.failed} failed</span>
	{/if}
	<div class="mode-toggles">
		<button onclick={toggleRouteMode} class="route-toggle-btn" class:active={routeMode}>
			{routeMode ? '✕ Exit Route Mode' : '🚶 Plan Route'}
		</button>
	</div>
</div>
{#if !routeMode}
	<p class="gesture-hint">
		Tap a pin to select it · press and hold empty map to drop a point, drag while holding for a rectangle · tap the first point to close a shape, hold any point to delete it
	</p>
{/if}

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

	.mode-toggles {
		display: flex;
		gap: 0.5rem;
		margin-left: auto;
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

	.gesture-hint {
		width: 100%;
		padding: 0.4rem 2rem 0;
		margin: 0;
		color: var(--text-muted);
		font-size: 0.78rem;
		opacity: 0.75;
	}

	.map-wrapper {
		position: relative;
		width: 100%;
		flex: 1;
		min-height: 0;
		display: flex;
	}

	.map {
		flex: 1;
		height: 100%;
		position: relative;
		touch-action: none;
		-webkit-touch-callout: none;
		-webkit-user-select: none;
		user-select: none;
	}

	:global(.hold-indicator) {
		position: absolute;
		width: 28px;
		height: 28px;
		margin-left: -14px;
		margin-top: -14px;
		border-radius: 50%;
		border: 2px solid #2DC653;
		background: rgba(45, 198, 83, 0.15);
		pointer-events: none;
		transform: scale(0.3);
		opacity: 0.6;
		animation: hold-charge var(--hold-ms, 500ms) linear forwards;
		z-index: 1000;
	}

	:global(.hold-indicator.triggered) {
		border-color: #D946EF;
		background: rgba(217, 70, 239, 0.25);
		animation: hold-pulse 300ms ease-out forwards;
	}

	@keyframes hold-charge {
		from { transform: scale(0.3); opacity: 0.6; }
		to { transform: scale(1); opacity: 1; }
	}

	@keyframes hold-pulse {
		from { transform: scale(1); opacity: 1; }
		to { transform: scale(1.6); opacity: 0; }
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

		.geocode-btn {
			min-height: 44px;
		}

		.mode-toggles {
			margin-left: 0;
			flex-wrap: wrap;
			width: 100%;
		}

		.route-toggle-btn {
			min-height: 44px;
			flex: 1;
		}

		.map-wrapper {
			flex-direction: column;
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
