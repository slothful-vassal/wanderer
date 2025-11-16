import { env } from "$env/dynamic/public";
import { haversineDistance } from "$lib/models/gpx/utils";
import type { OverpassElement, OverpassResponse } from "$lib/vendor/maplibre-layer-manager/types";

const DEFAULT_OVERPASS_URL = "https://overpass-api.de";

function getOverpassApiURL(): string {
    const base = (env.PUBLIC_OVERPASS_API_URL && env.PUBLIC_OVERPASS_API_URL.length > 0 ? env.PUBLIC_OVERPASS_API_URL : DEFAULT_OVERPASS_URL).replace(/\/+$/, "");
    return `${base}/api/interpreter`;
}

const OVERPASS_API_URL = getOverpassApiURL();
const MTB_SCALE_POINT_ASSOCIATION_THRESHOLD_METERS = 75;
const EARTH_METERS_PER_DEGREE_LAT = 111_320;

type BoundingBox = { minLat: number; maxLat: number; minLon: number; maxLon: number };
type ShapePoint = { lat: number; lon: number };

type OverpassGeometryPoint = { lat: number; lon: number };
type OverpassElementWithGeometry = OverpassElement & { geometry?: OverpassGeometryPoint[] };
type MtbScaleWay = { scale: number; geometry: OverpassGeometryPoint[]; bounds: BoundingBox };

async function fetchOverpassData(query: string): Promise<OverpassResponse | undefined> {
    if (!query.length) {
        return undefined;
    }

    try {
        const response = await fetch(`${OVERPASS_API_URL}?data=${encodeURIComponent(query)}`);

        if (!response.ok) {
            let details: string | undefined;
            try {
                details = await response.text();
            } catch {
                details = undefined;
            }
            console.warn("Failed to fetch Overpass data", details);
            return undefined;
        }

        return await response.json() as OverpassResponse;
    } catch (error) {
        console.warn("Unable to fetch Overpass data", error);
        return undefined;
    }
}

function computeBoundingBox(points: { lat: number; lon: number }[]): BoundingBox | undefined {
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLon = Infinity;
    let maxLon = -Infinity;

    for (const point of points) {
        const { lat, lon } = point;

        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            continue;
        }

        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
    }

    if (minLat === Infinity || minLon === Infinity || maxLat === -Infinity || maxLon === -Infinity) {
        return undefined;
    }

    return { minLat, maxLat, minLon, maxLon };
}

function parseMtbScaleFromTags(tags?: Record<string, string>): number | undefined {
    if (!tags) {
        return undefined;
    }

    const mtbScaleValue = typeof tags["mtb:scale"] === "string" ? parseMtbScaleValue(tags["mtb:scale"]) : undefined;
    if (mtbScaleValue !== undefined) {
        return mtbScaleValue;
    }

    const imbaValue = typeof tags["mtb:scale:imba"] === "string" ? parseImbaScaleValue(tags["mtb:scale:imba"]) : undefined;
    if (imbaValue !== undefined) {
        return imbaValue;
    }

    return undefined;
}

function parseMtbScaleValue(rawValue: string): number | undefined {
    if (!rawValue) {
        return undefined;
    }

    const normalized = rawValue.trim().toLowerCase();
    const withoutPrefix = normalized.startsWith("s") && normalized.length > 1 ? normalized.slice(1) : normalized;
    const numericPortion = withoutPrefix.replace(/[^0-9.+-]/g, "");

    if (!numericPortion.length) {
        return undefined;
    }

    const parsed = Number.parseFloat(numericPortion);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function parseImbaScaleValue(value: string): number | undefined {
    if (!value) {
        return undefined;
    }

    const normalized = value.trim().toLowerCase().replace(/[\s-]/g, "_");

    switch (normalized) {
        case "white":
            return 0;
        case "green":
            return 1;
        case "blue":
            return 2;
        case "black":
            return 3;
        case "double_black":
        case "doubleblack":
        case "double_black_diamond":
            return 4;
        default:
            return undefined;
    }
}

function metersToLatDegrees(meters: number): number {
    return meters / EARTH_METERS_PER_DEGREE_LAT;
}

function metersToLonDegrees(meters: number, latitude: number): number {
    const metersPerDegreeLon = Math.cos(latitude * (Math.PI / 180)) * EARTH_METERS_PER_DEGREE_LAT;

    if (!Number.isFinite(metersPerDegreeLon) || metersPerDegreeLon === 0) {
        return meters / EARTH_METERS_PER_DEGREE_LAT;
    }

    return meters / metersPerDegreeLon;
}

function getMinimumDistanceToWayGeometry(lat: number, lon: number, geometry: OverpassGeometryPoint[]): number {
    let minDistance = Infinity;

    for (const node of geometry) {
        const nodeLat = node.lat;
        const nodeLon = node.lon;

        if (!Number.isFinite(nodeLat) || !Number.isFinite(nodeLon)) {
            continue;
        }

        const distance = haversineDistance(lat, lon, nodeLat, nodeLon);
        if (distance < minDistance) {
            minDistance = distance;
        }
    }

    return minDistance;
}

function assignMtbScaleToShapePoints(shapePoints: ShapePoint[], ways: MtbScaleWay[]): (number | undefined)[] {
    const assignments = Array<number | undefined>(shapePoints.length).fill(undefined);
    const latMargin = metersToLatDegrees(MTB_SCALE_POINT_ASSOCIATION_THRESHOLD_METERS);

    for (let pointIndex = 0; pointIndex < shapePoints.length; pointIndex++) {
        const lat = shapePoints[pointIndex].lat;
        const lon = shapePoints[pointIndex].lon;

        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            continue;
        }

        const lonMargin = metersToLonDegrees(MTB_SCALE_POINT_ASSOCIATION_THRESHOLD_METERS, lat);

        let bestScale: number | undefined;
        let bestDistance = Infinity;

        for (const way of ways) {
            if (
                lat < way.bounds.minLat - latMargin ||
                lat > way.bounds.maxLat + latMargin ||
                lon < way.bounds.minLon - lonMargin ||
                lon > way.bounds.maxLon + lonMargin
            ) {
                continue;
            }

            const distance = getMinimumDistanceToWayGeometry(lat, lon, way.geometry);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestScale = way.scale;
            }
        }

        if (bestScale !== undefined && bestDistance <= MTB_SCALE_POINT_ASSOCIATION_THRESHOLD_METERS) {
            assignments[pointIndex] = bestScale;
        }
    }

    return assignments;
}

async function fetchMtbScaleAssignmentsForShape(shapePoints: ShapePoint[]): Promise<(number | undefined)[] | undefined> {
    if (!shapePoints.length) {
        return undefined;
    }

    const bbox = computeBoundingBox(shapePoints);
    if (!bbox) {
        return undefined;
    }

    const bboxQuery = `${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon}`;
    const query = `[out:json][timeout:5000];(way["mtb:scale"](${bboxQuery});way["mtb:scale:imba"](${bboxQuery}););out geom;`;
    const payload = await fetchOverpassData(query);

    if (!payload) {
        return undefined;
    }

    const elements = (payload.elements ?? []) as OverpassElementWithGeometry[];
    const ways: MtbScaleWay[] = elements
        .map((element) => {
            if (element.type !== "way" || !element.geometry) {
                return undefined;
            }

            const scale = parseMtbScaleFromTags(element.tags);
            if (scale === undefined) {
                return undefined;
            }

            const bounds = computeBoundingBox(element.geometry);
            if (!bounds) {
                return undefined;
            }

            return { scale, geometry: element.geometry, bounds };
        })
        .filter((way): way is MtbScaleWay => way !== undefined);

    if (!ways.length) {
        return Array<number | undefined>(shapePoints.length).fill(undefined);
    }

    return assignMtbScaleToShapePoints(shapePoints, ways);
}

export { fetchMtbScaleAssignmentsForShape, fetchOverpassData };
