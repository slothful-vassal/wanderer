import GPX from "$lib/models/gpx/gpx";
import Track from "$lib/models/gpx/track";
import TrackSegment from "$lib/models/gpx/track-segment";
import { haversineDistance } from "$lib/models/gpx/utils";
import Waypoint from "$lib/models/gpx/waypoint";
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
    surfaceSummary: Record<string, number> = $state({});
}

export const valhallaStore = new ValhallaStore();

function buildSurfaceSummaryFromRoute(route: GPX): Record<string, number> {
    const summary: Record<string, number> = {};

    for (const track of route.trk ?? []) {
        for (const segment of track.trkseg ?? []) {
            if (!segment.trkpt?.length) {
                continue;
            }
            mergeSurfaceSummaries(summary, summarizeSurfaceLengths(segment.trkpt));
        }
    }

    return summary;
}

function recalculateSurfaceSummary() {
    valhallaStore.surfaceSummary = buildSurfaceSummaryFromRoute(valhallaStore.route);
}

export function clearRoute() {
    valhallaStore.route = new GPX({ trk: [emtpyTrack] });
    recalculateSurfaceSummary();
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

function accumulateSurfaceLength(summary: Record<string, number>, surface: string | undefined, length: number) {
    if (!Number.isFinite(length) || length <= 0) {
        return;
    }

    const key = surface && surface.length ? surface : UNKNOWN_SURFACE;
    summary[key] = (summary[key] ?? 0) + length;
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

function mergeSurfaceSummaries(target: Record<string, number>, addition: Record<string, number>) {
    for (const [surface, length] of Object.entries(addition)) {
        if (!Number.isFinite(length) || length <= 0) {
            continue;
        }
        target[surface] = (target[surface] ?? 0) + length;
    }
}

async function fetchSurfaceTypesForShape(shapePoints: ValhallaShapePoint[], costingBody: Record<string, unknown> | undefined): Promise<(string | undefined)[]> {
    if (!shapePoints.length) {
        return [];
    }

    const body = {
        shape: shapePoints,
        shape_match: "map_snap",
        filters: {
            attributes: [
                "edge.surface",
                "edge.begin_shape_index",
                "edge.end_shape_index"
            ],
            action: "include"
        },
        ...(costingBody ?? {})
    };

    try {
        const response = await fetch("/api/v1/valhalla/trace-attributes", {
            method: "POST",
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            try {
                const details = await response.json();
                console.warn("Failed to retrieve surface data", details);
            } finally { 
                return [];
            }
        }

        const surfaceResponse: ValhallaTraceAttributesResponse = await response.json();
        const surfaces = Array<string | undefined>(shapePoints.length).fill(undefined);

        for (const edge of surfaceResponse.edges ?? []) {
            if (typeof edge.begin_shape_index !== "number" || typeof edge.end_shape_index !== "number") {
                continue;
            }

            const surface = edge.surface;
            if (!surface) {
                continue;
            }

            const startIndex = Math.max(0, edge.begin_shape_index);
            const endIndex = Math.min(shapePoints.length - 1, edge.end_shape_index);

            for (let i = startIndex; i <= endIndex; i++) {
                surfaces[i] = surface;
            }
        }

        return surfaces;
    } catch (error) {
        console.warn("Unable to fetch Valhalla surface data", error);
        return [];
    }
}


export function setRoute(newRoute: GPX, undoable: boolean = false) {
    const delta = diff(valhallaStore.route, newRoute);
    const reverseDelta = diff(newRoute, valhallaStore.route);
    valhallaStore.route = applyChangeset(valhallaStore.route, delta);
    if (undoable) {
        pushToUndoStack(delta, reverseDelta)
    }

    recalculateSurfaceSummary();
}

export async function calculateRouteBetween(startLat: number, startLon: number, endLat: number, endLon: number, options: RoutingOptions): Promise<{ waypoints: Waypoint[]; surfaceSummary: Record<string, number> }> {
    let shapePoints: ValhallaShapePoint[] = [];
    let duration: number = 0;
    let surfaceTypes: (string | undefined)[] = [];

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
            surfaceTypes = await fetchSurfaceTypesForShape(shapePoints, costingBody);
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
        return { waypoints: [], surfaceSummary: {} };
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
        surface: surfaceTypes[i]
    }))

    const surfaceSummary = summarizeSurfaceLengths(waypoints);

    return { waypoints, surfaceSummary };
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
    recalculateSurfaceSummary();
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
    recalculateSurfaceSummary();
}

export function deleteFromRoute(index: number) {
    const snapshot = new GPX({ ...valhallaStore.route })

    snapshot.trk?.at(0)?.trkseg?.splice(index, 1);
    snapshot.features = valhallaStore.route.getTotals();

    const delta = diff(valhallaStore.route, snapshot);
    const reverseDelta = diff(snapshot, valhallaStore.route)
    valhallaStore.route = applyChangeset(valhallaStore.route, delta);
    pushToUndoStack(delta, reverseDelta)
    recalculateSurfaceSummary();
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

    recalculateSurfaceSummary();
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
    recalculateSurfaceSummary();    // Todo: verify if needed
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
    recalculateSurfaceSummary();
}

export function redo() {
    const historyItem = valhallaStore.redoStack.pop()
    if (!historyItem) {
        return
    }
    valhallaStore.undoStack.push(historyItem)

    valhallaStore.route = applyChangeset(valhallaStore.route, historyItem.delta);
    valhallaStore.route.features = valhallaStore.route.getTotals();
    recalculateSurfaceSummary();
}
