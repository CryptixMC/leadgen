export type LatLng = [number, number];

const EARTH_RADIUS_M = 6371000;

/** Default Nearby Search circle radius used to tile a drawn polygon into a covering grid. */
export const DEFAULT_CELL_RADIUS_M = 400;

/** Max grid cells a polygon scrape will tile into, to bound Places API cost. */
export const MAX_GRID_CELLS = 60;

/** Ray-casting point-in-polygon test. `polygon` is a ring of [lat, lng] pairs. */
export function pointInPolygon(lat: number, lng: number, polygon: LatLng[]): boolean {
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const [latI, lngI] = polygon[i];
		const [latJ, lngJ] = polygon[j];
		const intersects =
			latI > lat !== latJ > lat &&
			lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI;
		if (intersects) inside = !inside;
	}
	return inside;
}

export function polygonBounds(polygon: LatLng[]): {
	minLat: number;
	maxLat: number;
	minLng: number;
	maxLng: number;
} {
	let minLat = Infinity;
	let maxLat = -Infinity;
	let minLng = Infinity;
	let maxLng = -Infinity;
	for (const [lat, lng] of polygon) {
		if (lat < minLat) minLat = lat;
		if (lat > maxLat) maxLat = lat;
		if (lng < minLng) minLng = lng;
		if (lng > maxLng) maxLng = lng;
	}
	return { minLat, maxLat, minLng, maxLng };
}

function metersToLatDegrees(m: number): number {
	return m / 111320;
}

function metersToLngDegrees(m: number, atLat: number): number {
	return m / (111320 * Math.cos((atLat * Math.PI) / 180));
}

/**
 * Tiles a polygon's bounding box into a grid of candidate circle centers
 * spaced with slight overlap. Callers are expected to filter results by
 * `pointInPolygon` downstream — cells outside the polygon just yield no
 * usable results, so this doesn't attempt precise circle/polygon intersection.
 */
export function generateCoveringGrid(polygon: LatLng[], cellRadiusMeters: number): LatLng[] {
	const { minLat, maxLat, minLng, maxLng } = polygonBounds(polygon);
	const midLat = (minLat + maxLat) / 2;
	const latStep = metersToLatDegrees(cellRadiusMeters * 1.5);
	const lngStep = metersToLngDegrees(cellRadiusMeters * 1.5, midLat);

	const points: LatLng[] = [];
	for (let lat = minLat; lat <= maxLat + latStep / 2; lat += latStep) {
		for (let lng = minLng; lng <= maxLng + lngStep / 2; lng += lngStep) {
			points.push([lat, lng]);
		}
	}
	return points;
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
	const dLat = ((lat2 - lat1) * Math.PI) / 180;
	const dLng = ((lng2 - lng1) * Math.PI) / 180;
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
	return (EARTH_RADIUS_M / 1000) * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
