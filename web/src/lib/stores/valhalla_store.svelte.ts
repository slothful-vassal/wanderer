import GPX from "$lib/models/gpx/gpx";
import Track from "$lib/models/gpx/track";
import TrackSegment from "$lib/models/gpx/track-segment";
import { haversineDistance } from "$lib/models/gpx/utils";
import Waypoint from "$lib/models/gpx/waypoint";
import type { TrailSurface, TrailSurfacePoint, TrailWayTypeSummary, TrailWayTypes, TrailWayTypePoint } from "$lib/models/trail";
import { type RoutingOptions, type ValhallaAnchor, type ValhallaHeightResponse, type ValhallaRouteResponse, type ValhallaTraceAttributesResponse } from "$lib/models/valhalla";
import { APIError } from "$lib/util/api_util";
import { decodePolyline } from "$lib/util/polyline_util";
import { applyChangeset, diff, type Changeset } from 'json-diff-ts';
import type { LngLat } from "maplibre-gl";
import { _ } from "svelte-i18n";
import { get } from "svelte/store";

const emtpyTrack = new Track({ trkseg: [] })

class ValhallaStore {
    route: GPX = $state(new GPX({ trk: [emtpyTrack] }));
    anchors: ValhallaAnchor[] = $state([]);
    undoStack: { delta: Changeset, reverseDelta: Changeset }[] = $state([]);
    redoStack: { delta: Changeset, reverseDelta: Changeset }[] = $state([]);
    surface: TrailSurface = $state({});
    wayType: TrailWayTypes = $state({});
}

export const valhallaStore = new ValhallaStore();

type WayTypeSummaryAccumulator = {
    type: Record<string, number>;
    scale: Record<string, number>;
};

function buildSurfaceFromRoute(route: GPX): TrailSurface {
    const summary: Record<string, number> = {};
    const perPoint: TrailSurfacePoint[] = [];

    for (const track of route.trk ?? []) {
        for (const segment of track.trkseg ?? []) {
            const points = segment.trkpt ?? [];
            if (!points.length) {
                continue;
            }

            mergeClassificationSummaries(summary, summarizeSurfaceLengths(points));

            let currentSurface: string | undefined;
            for (const point of points) {
                if (!point.surface || point.surface == currentSurface) {
                    continue;
                }

                const lat = point.$.lat;
                const lon = point.$.lon;

                if (!lat || !lon || !Number.isFinite(lat) || !Number.isFinite(lon)) {
                    continue;
                }

                perPoint.push({ lat, lon, type: point.surface });
                currentSurface = point.surface;
            }
        }
    }

    if (perPoint.length == 0) {
        return {};
    }

    return { perPoint: perPoint, summary: summary };
}

function buildWayTypesFromRoute(route: GPX): TrailWayTypes {
    const summaryAccumulator = { type: {}, scale: {} };
    const perPoint: TrailWayTypePoint[] = [];

    for (const track of route.trk ?? []) {
        for (const segment of track.trkseg ?? []) {
            const points = segment.trkpt ?? [];
            if (!points.length) {
                continue;
            }

            mergeWayTypeSummaries(summaryAccumulator, summarizeWayTypeLengths(points));

            let currentWayType: { type: string; scale: number | undefined } | undefined;
            for (const point of points) {
                if (
                    !point.wayType ||
                    (point.wayType.type === currentWayType?.type &&
                        point.wayType.scale === currentWayType?.scale)
                ) {
                    continue;
                }

                const lat = point.$.lat;
                const lon = point.$.lon;

                if (!lat || !lon || !Number.isFinite(lat) || !Number.isFinite(lon)) {
                    continue;
                }

                perPoint.push({ lat, lon, type: point.wayType.type, scale: point.wayType.scale });
                currentWayType = point.wayType;
            }
        }
    }

    const result: TrailWayTypes = {};
    if (perPoint.length) {
        result.perPoint = perPoint;
    }

    const summary = finalizeWayTypeSummary(summaryAccumulator);
    if (summary) {
        result.summary = summary;
    }

    return Object.keys(result).length ? result : {};
}

function summarizeSurfaceLengths(points: Waypoint[]): Record<string, number> {
    const summary: Record<string, number> = {};

    for (let i = 1; i < points.length; i++) {
        const previous = points[i - 1];
        const current = points[i];

        const lat1 = previous.$.lat;
        const lon1 = previous.$.lon;
        const lat2 = current.$.lat;
        const lon2 = current.$.lon;

        if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) {
            continue;
        }

        const segmentLength = haversineDistance(lat1, lon1, lat2, lon2);
        accumulateSurfaceLength(summary, current.surface ?? previous.surface, segmentLength);
    }
    return summary;
}

function summarizeWayTypeLengths(points: Waypoint[]): WayTypeSummaryAccumulator {
    const summary = { type: {}, scale: {} };

    for (let i = 1; i < points.length; i++) {
        const previous = points[i - 1];
        const current = points[i];

        const lat1 = previous.$.lat;
        const lon1 = previous.$.lon;
        const lat2 = current.$.lat;
        const lon2 = current.$.lon;

        if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) {
            continue;
        }

        const segmentLength = haversineDistance(lat1, lon1, lat2, lon2);
        accumulateWayTypeLength(summary, current.wayType ?? previous.wayType, segmentLength);
    }
    return summary;
}

function mergeWayTypeSummaries(target: WayTypeSummaryAccumulator, addition: WayTypeSummaryAccumulator) {
    mergeClassificationSummaries(target.type, addition.type);
    mergeClassificationSummaries(target.scale, addition.scale);
}

function finalizeWayTypeSummary(summary: WayTypeSummaryAccumulator): TrailWayTypeSummary | undefined {
    const result: TrailWayTypeSummary = {};

    if (hasSummaryEntries(summary.type)) {
        result.type = summary.type;
    }

    if (hasSummaryEntries(summary.scale)) {
        result.scale = summary.scale;
    }

    return Object.keys(result).length ? result : undefined;
}

function hasSummaryEntries(summary: Record<string, number>): boolean {
    return Object.keys(summary).length > 0;
}

function mergeClassificationSummaries(target: Record<string, number>, addition: Record<string, number>) {
    for (const [surface, length] of Object.entries(addition)) {
        if (!Number.isFinite(length) || length <= 0) {
            continue;
        }
        target[surface] = (target[surface] ?? 0) + length;
    }
}

function setSurface() {
    valhallaStore.surface = buildSurfaceFromRoute(valhallaStore.route);
    valhallaStore.wayType = buildWayTypesFromRoute(valhallaStore.route);
}

export function clearRoute() {
    valhallaStore.route = new GPX({ trk: [emtpyTrack] });
    setSurface();
}

export function clearAnchors() {
    for (const anchor of valhallaStore.anchors) {
        anchor.marker?.remove();
    }
    valhallaStore.anchors = [];
}

export function clearUndoRedoStack() {
    valhallaStore.undoStack = []
    valhallaStore.redoStack = []
}

function pushToUndoStack(delta: Changeset, reverseDelta: Changeset) {
    valhallaStore.undoStack.push({ delta, reverseDelta })
    valhallaStore.redoStack = []
}

type ValhallaShapePoint = { lat: number; lon: number };


const UNKNOWN_SURFACE = "unknown";
const UNKNOWN_WAY_TYPE = "unknown";
const UNKNOWN_WAY_SCALE = 0;
const VALHALLA_MAX_PATH_LENGTH_METERS = 150_000;    // 200_000 specified, but ensure rounding differences

function accumulateSurfaceLength(summary: Record<string, number>, surface: string | undefined, length: number) {
    if (!Number.isFinite(length) || length <= 0) {
        return;
    }

    const key = surface && surface.length ? surface : UNKNOWN_SURFACE;
    summary[key] = (summary[key] ?? 0) + length;
}

function accumulateWayTypeLength(
    summary: WayTypeSummaryAccumulator,
    wayType: { type: string; scale: number | undefined } | undefined,
    length: number,
) {
    if (!Number.isFinite(length) || length <= 0) {
        return;
    }

    const typeKey = wayType && wayType.type.length ? wayType.type : UNKNOWN_WAY_TYPE;
    summary.type[typeKey] = (summary.type[typeKey] ?? 0) + length;

    const scaleValue = wayType?.scale;
    const scaleKey =
        scaleValue === undefined || scaleValue === null ? `${UNKNOWN_WAY_SCALE}` : `${scaleValue}`;
    summary.scale[scaleKey] = (summary.scale[scaleKey] ?? 0) + length;
}

type ShapeSegment = { start: number; points: ValhallaShapePoint[] };

function splitShapePointsByMaxLength(shapePoints: ValhallaShapePoint[], maxLengthMeters: number): ShapeSegment[] {
    if (shapePoints.length === 0) {
        return [];
    }

    const segments: ShapeSegment[] = [];
    let segmentStart = 0;
    let accumulatedLength = 0;

    for (let i = 1; i < shapePoints.length; i++) {
        const previous = shapePoints[i - 1];
        const current = shapePoints[i];
        const edgeLength = haversineDistance(previous.lat, previous.lon, current.lat, current.lon);

        if (accumulatedLength + edgeLength > maxLengthMeters && i - segmentStart >= 2) {
            segments.push({ start: segmentStart, points: shapePoints.slice(segmentStart, i) });
            segmentStart = i - 1;
            accumulatedLength = edgeLength;
        } else {
            accumulatedLength += edgeLength;
        }
    }

    segments.push({ start: segmentStart, points: shapePoints.slice(segmentStart) });

    return segments;
}

type RouteAttributes = {
    surfaces: (string | undefined)[];
    wayTypes: ({ type: string, scale: number | undefined} | undefined)[];
};

async function requestRouteAttributesForShapeSegment(shapePoints: ValhallaShapePoint[], costingBody: Record<string, unknown> | undefined): Promise<RouteAttributes> {
    if (!shapePoints.length || !costingBody) {
        return { surfaces: [], wayTypes: [] };
    }

    if (shapePoints.length < 2) {
        return {
            surfaces: Array<string | undefined>(shapePoints.length).fill(undefined),
            wayTypes: Array<{ type: string, scale: number | undefined} | undefined>(shapePoints.length).fill(undefined),
        };
    }

    const body = {
        shape: shapePoints,
        shape_match: "map_snap",
        filters: {
            attributes: [
                "edge.surface",
                "edge.road_class",
                "edge.sac_scale",
                "edge.use",
                "edge.begin_shape_index",
                "edge.end_shape_index"
            ],
            action: "include"
        },
        ...costingBody
    };

    try {
        const response = await fetch("/api/v1/valhalla/trace-attributes", {
            method: "POST",
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            try {
                const details = await response.json();
                console.warn("Failed to retrieve route attribute data", details);
            } finally {
                return { surfaces: [], wayTypes: [] };
            }
        }

        const trailAttributesResponse: ValhallaTraceAttributesResponse = await response.json();
        const surfaces = Array<string | undefined>(shapePoints.length).fill(undefined);
        const wayTypes = Array<{ type: string, scale: number | undefined} | undefined>(shapePoints.length).fill(undefined);

        for (const edge of trailAttributesResponse.edges ?? []) {
            if (typeof edge.begin_shape_index !== "number" || typeof edge.end_shape_index !== "number") {
                continue;
            }

            const startIndex = Math.max(0, edge.begin_shape_index);
            const endIndex = Math.min(shapePoints.length - 1, edge.end_shape_index);

            for (let i = startIndex; i <= endIndex; i++) {
                if (edge.surface) {
                    surfaces[i] = edge.surface;
                }
                if (edge.road_class) {
                    let scale: number | undefined = undefined;
                    if (edge.sac_scale != undefined && typeof edge.sac_scale === "number") {
                        scale = edge.sac_scale;
                    }
                    wayTypes[i] = { type: edge.road_class, scale: scale };
                }
                if (edge.use && edge.use == "ferry") {
                    wayTypes[i] = { type: edge.use, scale: undefined };
                }
            }
        }

        return { surfaces, wayTypes };
    } catch (error) {
        console.warn("Unable to fetch Valhalla route attribute data", error);
        return { surfaces: [], wayTypes: [] };
    }
}

async function fetchRouteAttributesForShape(shapePoints: ValhallaShapePoint[], costingBody: Record<string, unknown> | undefined): Promise<RouteAttributes> {
    if (!shapePoints.length || !costingBody) {
        return { surfaces: [], wayTypes: [] };
    }

    const segments = splitShapePointsByMaxLength(shapePoints, VALHALLA_MAX_PATH_LENGTH_METERS);

    if (segments.length <= 1) {
        return requestRouteAttributesForShapeSegment(shapePoints, costingBody);
    }

    const aggregatedSurfaces = Array<string | undefined>(shapePoints.length).fill(undefined);
    const aggregatedWayTypes = Array<{ type: string, scale: number | undefined} | undefined>(shapePoints.length).fill(undefined);

    for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
        const { start, points } = segments[segmentIndex];

        if (points.length < 2) {
            continue;
        }

        const { surfaces: segmentSurfaces, wayTypes: segmentWayTypes } = await requestRouteAttributesForShapeSegment(points, costingBody);

        for (let localIndex = 0; localIndex < points.length; localIndex++) {
            const globalIndex = start + localIndex;

            if (globalIndex >= shapePoints.length) {
                break;
            }

            const surface = segmentSurfaces[localIndex];
            if (surface !== undefined) {
                if (segmentIndex === 0 || localIndex > 0 || aggregatedSurfaces[globalIndex] === undefined) {
                    aggregatedSurfaces[globalIndex] = surface;
                }
            }

            const wayType = segmentWayTypes[localIndex];
            if (wayType !== undefined) {
                if (segmentIndex === 0 || localIndex > 0 || aggregatedWayTypes[globalIndex] === undefined) {
                    aggregatedWayTypes[globalIndex] = wayType;
                }
            }
        }
    }

    return { surfaces: aggregatedSurfaces, wayTypes: aggregatedWayTypes };
}

function setWaypointSurface(point: Waypoint, surface: string | undefined) {
    const setter = (point as any).setSurface as ((surface?: string) => void) | undefined;
    if (typeof setter === "function") {
        setter.call(point, surface);
    } else if (surface === undefined) {
        delete (point as any).surface;
    } else {
        point.surface = surface;
    }
}

function setWaypointWayType(point: Waypoint, wayType: { type: string, scale: number | undefined} | undefined) {
    const setter = (point as any).setWayType as ((wayType?: { type: string, scale: number | undefined}) => void) | undefined;
    if (typeof setter === "function") {
        setter.call(point, wayType);
    } else if (wayType === undefined) {
        delete (point as any).wayType;
    } else {
        (point as any).wayType = wayType;
    }
}

function extractRoutePoints(route: GPX): Array<{ point: Waypoint; lat: number; lon: number }> {
    const result: Array<{ point: Waypoint; lat: number; lon: number }> = [];
    const points = route.flatten();

    for (const point of points) {
        const lat = point.$.lat;
        const lon = point.$.lon;

        if (!lat || !lon || !Number.isFinite(lat) || !Number.isFinite(lon)) {
            continue;
        }

        result.push({ point, lat, lon });
    }

    return result;
}

export async function fetchRouteClassificationsForGPX(
    route: GPX,
    costingBody: Record<string, unknown> | undefined = undefined
): Promise<{ surface?: TrailSurface; wayTypes?: TrailWayTypes }> {
    const pointEntries = extractRoutePoints(route);

    if (pointEntries.length < 2) {
        return {};
    }    

    const shapePoints = pointEntries.map(({ lat, lon }) => ({ lat, lon }));
    const { surfaces, wayTypes } = await fetchRouteAttributesForShape(shapePoints, costingBody);

    let surfaceAssigned = false;
    let wayTypeAssigned = false;

    for (let i = 0; i < pointEntries.length; i += 1) {
        const { point } = pointEntries[i];

        const surface = surfaces[i];
        if (surface) {
            setWaypointSurface(point, surface);
            surfaceAssigned = true;
        }

        const wayType = wayTypes[i];
        if (wayType) {
            setWaypointWayType(point, wayType);
            wayTypeAssigned = true;
        }
    }

    let surface: TrailSurface | undefined;
    if (surfaceAssigned) {
        surface = buildSurfaceFromRoute(route);
        if (!surface.perPoint?.length && !surface.summary) {
            surface = undefined;
        }
    }

    let wayTypeData: TrailWayTypes | undefined;
    if (wayTypeAssigned) {
        wayTypeData = buildWayTypesFromRoute(route);
        if (!wayTypeData.perPoint?.length && !wayTypeData.summary) {
            wayTypeData = undefined;
        }
    }

    return { surface, wayTypes: wayTypeData };
}

export async function fetchSurfaceDataForGPX(
    route: GPX,
    costingBody: Record<string, unknown> | undefined = undefined
): Promise<TrailSurface | undefined> {
    const { surface } = await fetchRouteClassificationsForGPX(route, costingBody);
    return surface;
}

export async function fetchWayTypeDataForGPX(
    route: GPX,
    costingBody: Record<string, unknown> | undefined = undefined,
    hiking: boolean | undefined
): Promise<TrailWayTypes | undefined> {
    const { wayTypes } = await fetchRouteClassificationsForGPX(route, costingBody);
    return wayTypes;
}

export async function fetchTrailAttributesDataForGPX(route: GPX, costingBody: Record<string, unknown> | undefined = undefined): Promise<{surface?: TrailSurface, wayTypes?: TrailWayTypes}> {
    return await fetchRouteClassificationsForGPX(route, costingBody);
}


export function setRoute(newRoute: GPX, undoable: boolean = false) {
    const delta = diff(valhallaStore.route, newRoute);
    const reverseDelta = diff(newRoute, valhallaStore.route);
    valhallaStore.route = applyChangeset(valhallaStore.route, delta);
    if (undoable) {
        pushToUndoStack(delta, reverseDelta)
    }

    setSurface();
}

export async function calculateRouteBetween(startLat: number, startLon: number, endLat: number, endLon: number, options: RoutingOptions): Promise<{ waypoints: Waypoint[] }> {
    let shapePoints: ValhallaShapePoint[] = [];
    let duration: number = 0;
    let surfaceTypes: (string | undefined)[] = [];
    let wayTypes: ({ type: string, scale: number | undefined} | undefined)[] = [];

    if (options.autoRouting) {
        let costingBody;
        switch (options.modeOfTransport) {
            case "bicycle":
                costingBody = { "costing": options.modeOfTransport, "costing_options": { [options.modeOfTransport]: options.autoOptions } }
                break;
            case "auto":
                costingBody = { "costing": options.modeOfTransport, "costing_options": { [options.modeOfTransport]: options.bicycleOptions } }
                break;

            case "pedestrian":
                costingBody = { "costing": options.modeOfTransport, "costing_options": { [options.modeOfTransport]: options.pedestrianOptions } }
                break;
        }
        const requestBody = {
            "directions_type": "none",
            "format": "osrm",
            "locations": [{ "lat": startLat, "lon": startLon }, { "lat": endLat, "lon": endLon }],
            ...costingBody
        }

        let r = await fetch("/api/v1/valhalla/route", { method: "POST", body: JSON.stringify(requestBody) })

        if (!r.ok) {
            const response = await r.json();
            throw new APIError(r.status, response.message, response.detail)
        }

        const routeResponse: ValhallaRouteResponse = await r.json();

        const rawGeometry = routeResponse.routes?.[0]?.geometry;        
        if (typeof rawGeometry === "string") {
            shapePoints = decodePolyline(rawGeometry).map(([lon, lat]) => ({ lat, lon }));
            const { surfaces, wayTypes: fetchedWayTypes } = await fetchRouteAttributesForShape(shapePoints, costingBody);
            surfaceTypes = surfaces;
            wayTypes = fetchedWayTypes;
        }

        const osrmRoute = routeResponse.routes?.[0];
        if (typeof osrmRoute?.duration === "number") {
            duration = osrmRoute.duration;
        }

    } else {
        shapePoints = [
            { lat: startLat, lon: startLon },
            { lat: endLat, lon: endLon }
        ];
        duration = 0;
    }

    if (!shapePoints.length) {
        return { waypoints: [] };
    }

    const r2 = await fetch("/api/v1/valhalla/height", { method: "POST", body: JSON.stringify({ shape: shapePoints }) })

    if (!r2.ok) {
        const response = await r2.json();
        throw new APIError(r2.status, response.message, response.detail)
    }

    const heightResponse: ValhallaHeightResponse = await r2.json()
    const startTime = Date.now();
    const millisecondsPerPoint = shapePoints.length ? (duration * 1000) / shapePoints.length : 0;

    const waypoints = shapePoints.map((point, i) => new Waypoint({
        $: { lat: point.lat, lon: point.lon },
        ele: heightResponse.height?.[i],
        time: new Date(startTime + millisecondsPerPoint * i),
        surface: surfaceTypes[i],
        wayType: wayTypes[i]
    }))

    return { waypoints };
}

export async function insertIntoRoute(waypoints: Waypoint[], index?: number) {
    const snapshot = new GPX({ ...valhallaStore.route })
    const segment = new TrackSegment({ trkpt: waypoints })

    if (index) {
        snapshot.trk?.at(0)?.trkseg?.splice(index, 0, segment);
    } else {
        snapshot.trk?.at(0)?.trkseg?.push(segment);
    }

    const delta = diff(valhallaStore.route, snapshot);

    const reverseDelta = diff(snapshot, valhallaStore.route);
    valhallaStore.route = applyChangeset(valhallaStore.route, delta);
    pushToUndoStack(delta, reverseDelta)

    valhallaStore.route.features = valhallaStore.route.getTotals();
    setSurface();
}

export async function editRoute(index: number, waypoints: Waypoint[]) {
    const snapshot = new GPX({ ...valhallaStore.route })

    const segment = snapshot.trk?.at(0)?.trkseg?.at(index)
    if (segment) {
        segment.trkpt = waypoints
    }

    const delta = diff(valhallaStore.route, snapshot);
    const reverseDelta = diff(snapshot, valhallaStore.route)
    valhallaStore.route = applyChangeset(valhallaStore.route, delta);
    pushToUndoStack(delta, reverseDelta)



    valhallaStore.route.features = valhallaStore.route.getTotals();
    setSurface();
}

export function deleteFromRoute(index: number) {
    const snapshot = new GPX({ ...valhallaStore.route })

    snapshot.trk?.at(0)?.trkseg?.splice(index, 1);
    snapshot.features = valhallaStore.route.getTotals();

    const delta = diff(valhallaStore.route, snapshot);
    const reverseDelta = diff(snapshot, valhallaStore.route)
    valhallaStore.route = applyChangeset(valhallaStore.route, delta);
    pushToUndoStack(delta, reverseDelta)
    setSurface();
}

export function reverseRoute() {
    const snapshot = new GPX({ ...valhallaStore.route })
    for (const trk of snapshot.trk ?? []) {
        for (const seg of trk.trkseg ?? []) {
            seg.trkpt?.reverse()
        }
        trk.trkseg?.reverse()
    }
    snapshot.trk?.reverse()

    const delta = diff(valhallaStore.route, snapshot);
    const reverseDelta = diff(snapshot, valhallaStore.route);
    valhallaStore.route = applyChangeset(valhallaStore.route, delta);
    pushToUndoStack(delta, reverseDelta)

    valhallaStore.route.features = valhallaStore.route.getTotals();

    valhallaStore.anchors.reverse();

    valhallaStore.anchors.forEach((a, i) => {
        if (!a.marker) {
            return;
        }
        a.marker.getElement().textContent = "" + (i + 1);

        const anchorPopupHeading = a.marker
            .getPopup()
            ._content.getElementsByTagName("h5")[0];
        if (anchorPopupHeading) {
            anchorPopupHeading.textContent =
                get(_)("route-point") + " #" + (i + 1);
        }
    });

    setSurface();
}

export function resetRoute() {
    const delta = diff(valhallaStore.route, new GPX({ trk: [new Track({ ...emtpyTrack })] }));
    const reverseDelta = diff(new GPX({ trk: [new Track({ ...emtpyTrack })] }), valhallaStore.route);
    valhallaStore.route = applyChangeset(valhallaStore.route, delta);
    pushToUndoStack(delta, reverseDelta)

    valhallaStore.anchors.forEach((a) => {
        if (!a.marker) {
            return;
        }

        a.marker.remove();
    })

    valhallaStore.anchors = []
    setSurface();    // Todo: verify if needed
}

export async function recalculateHeight() {
    await valhallaStore.route.correctElevation();
}

export async function splitSegment(index: number, pos: LngLat) {
    let seg = valhallaStore.route.trk?.at(0)?.trkseg?.at(index);
    if (!seg || !seg.trkpt) {
        return;
    }
    const points = seg.trkpt;

    let bestSplitIndex: number = 0
    let minDistance = Infinity
    for (let i = 1; i < points.length; i++) {
        const pt = points[i]
        const dist = haversineDistance(pt.$.lat!, pt.$.lon!, pos.lat, pos.lng);

        if (dist < minDistance) {
            bestSplitIndex = i
            minDistance = dist
        }
    }

    const intersectionPoint = new Waypoint({ ...points[bestSplitIndex], $: { lat: pos.lat, lon: pos.lng } });
    const firstSegmentPoints = [...points.slice(0, bestSplitIndex), intersectionPoint];
    const secondSegmentPoints = [intersectionPoint, ...points.slice(bestSplitIndex)];

    editRoute(index, firstSegmentPoints)
    insertIntoRoute(secondSegmentPoints, index + 1)

}

export function normalizeRouteTime() {
    let currentTime = new Date();

    for (const seg of valhallaStore.route.trk?.at(0)?.trkseg ?? []) {

        if (!seg.trkpt?.length) {
            continue
        }
        const baseTime = seg.trkpt[0].time?.getTime() ?? 0;
        for (let i = 0; i < seg.trkpt.length; i++) {
            const wp = seg.trkpt![i];
            const offset = (wp.time?.getTime() ?? 0) - baseTime;
            const adjustedTime = new Date(currentTime.getTime() + offset);

            wp.time = adjustedTime
        }
        currentTime = new Date(seg.trkpt[seg.trkpt.length - 1].time!.getTime());
    }
}

export function undo() {
    const historyItem = valhallaStore.undoStack.pop()
    if (!historyItem) {
        return
    }
    valhallaStore.redoStack.push(historyItem)

    valhallaStore.route = applyChangeset(valhallaStore.route, historyItem.reverseDelta);
    valhallaStore.route.features = valhallaStore.route.getTotals();
    setSurface();
}

export function redo() {
    const historyItem = valhallaStore.redoStack.pop()
    if (!historyItem) {
        return
    }
    valhallaStore.undoStack.push(historyItem)

    valhallaStore.route = applyChangeset(valhallaStore.route, historyItem.delta);
    valhallaStore.route.features = valhallaStore.route.getTotals();
    setSurface();
}
