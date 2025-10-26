import GPX from "$lib/models/gpx/gpx";
import Track from "$lib/models/gpx/track";
import TrackSegment from "$lib/models/gpx/track-segment";
import { haversineDistance } from "$lib/models/gpx/utils";
import Waypoint from "$lib/models/gpx/waypoint";
import type { TrailAttributes, TrailAttributePoint, TrailAttributeSummary } from "$lib/models/trail";
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
    attributes: TrailAttributes = $state({});
}

export const valhallaStore = new ValhallaStore();

type TrailAttributeSummaryAccumulator = {
    surface: Record<string, number>;
    type: Record<string, number>;
    diffScale: Record<string, number>;
};


function buildTrailAttributesFromRoute(route: GPX): TrailAttributes {
    const summaryAccumulator = { surface: {}, type: {}, diffScale: {} };
    const perPoint: TrailAttributePoint[] = [];

    for (const track of route.trk ?? []) {
        for (const segment of track.trkseg ?? []) {
            const points = segment.trkpt ?? [];
            if (!points.length) {
                continue;
            }

            mergeTrailAttributeSummaries(summaryAccumulator, summarizeTrailAttributePointLengths(points));

            let currentAttributes: TrailAttributePoint | undefined;
            for (const point of points) {
                if (
                    !point.attributes ||
                    (point.attributes.type === currentAttributes?.type &&
                        point.attributes.diffScale === currentAttributes?.diffScale &&
                        point.attributes.surface === currentAttributes?.surface)
                ) {
                    continue;
                }

                const lat = point.$.lat;
                const lon = point.$.lon;

                if (!lat || !lon || !Number.isFinite(lat) || !Number.isFinite(lon)) {
                    continue;
                }

                perPoint.push({ lat, lon, surface: point.attributes.surface, type: point.attributes.type, diffScale: point.attributes.diffScale });
                currentAttributes = point.attributes;
            }
        }
    }

    const result: TrailAttributes = {};
    if (perPoint.length) {
        result.perPoint = perPoint;
    }

    const summary = finalizeTrailAttributeSummary(summaryAccumulator);
    if (summary) {
        result.summary = summary;
    }

    return Object.keys(result).length ? result : {};
}

function summarizeTrailAttributePointLengths(points: Waypoint[]): TrailAttributeSummaryAccumulator {
    const summary = { surface: {}, type: {}, diffScale: {} };

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
        accumulateTrailAttributesLength(summary, current.attributes ?? previous.attributes, segmentLength);
    }
    return summary;
}

function mergeTrailAttributeSummaries(target: TrailAttributeSummaryAccumulator, addition: TrailAttributeSummaryAccumulator) {
    mergeClassificationSummaries(target.surface, addition.surface);
    mergeClassificationSummaries(target.type, addition.type);
    mergeClassificationSummaries(target.diffScale, addition.diffScale);
}

function finalizeTrailAttributeSummary(summary: TrailAttributeSummaryAccumulator): TrailAttributeSummary | undefined {
    const result: TrailAttributeSummary = {};

    if (hasSummaryEntries(summary.surface)) {
        result.surface = summary.surface;
    }

    if (hasSummaryEntries(summary.type)) {
        result.type = summary.type;
    }

    if (hasSummaryEntries(summary.diffScale)) {
        result.diffScale = summary.diffScale;
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

function setTrailAttributes() {
    valhallaStore.attributes = buildTrailAttributesFromRoute(valhallaStore.route);
}

export function clearRoute() {
    valhallaStore.route = new GPX({ trk: [emtpyTrack] });
    setTrailAttributes();
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


function accumulateTrailAttributesLength(
    summary: TrailAttributeSummaryAccumulator,
    attribute: TrailAttributePoint | undefined,
    length: number,
) {
    if (!Number.isFinite(length) || length <= 0) {
        return;
    }

    const surfaceKey = attribute && attribute.surface && attribute.surface.length ? attribute.surface : UNKNOWN_SURFACE;
    summary.surface[surfaceKey] = (summary.surface[surfaceKey] ?? 0) + length;

    const typeKey = attribute && attribute.type && attribute.type.length ? attribute.type : UNKNOWN_WAY_TYPE;
    summary.type[typeKey] = (summary.type[typeKey] ?? 0) + length;

    const scaleValue = attribute?.diffScale;
    const scaleKey = scaleValue === undefined || scaleValue === null ? `${UNKNOWN_WAY_SCALE}` : `${scaleValue}`;
    summary.diffScale[scaleKey] = (summary.diffScale[scaleKey] ?? 0) + length;
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

async function requestRouteAttributesForShapeSegment(shapePoints: ValhallaShapePoint[], costingBody: Record<string, unknown> | undefined): Promise<(TrailAttributePoint | undefined)[]> {
    if (!shapePoints.length || !costingBody) {
        return [];
    }

    if (shapePoints.length < 2) {
        return Array<TrailAttributePoint | undefined>(shapePoints.length).fill(undefined);
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
                return [];
            }
        }

        const trailAttributesResponse: ValhallaTraceAttributesResponse = await response.json();
        const trailAttributes = Array<TrailAttributePoint | undefined>(shapePoints.length).fill(undefined);

        for (const edge of trailAttributesResponse.edges ?? []) {
            if (typeof edge.begin_shape_index !== "number" || typeof edge.end_shape_index !== "number") {
                continue;
            }

            const startIndex = Math.max(0, edge.begin_shape_index);
            const endIndex = Math.min(shapePoints.length - 1, edge.end_shape_index);

            for (let i = startIndex; i <= endIndex; i++) {
                let surface = UNKNOWN_SURFACE;
                let type = UNKNOWN_WAY_TYPE;
                let diffScale = UNKNOWN_WAY_SCALE;

                if (edge.surface) {
                    surface = edge.surface;
                }
                if (edge.road_class) {
                    type = edge.road_class;
                }
                if (edge.sac_scale && typeof edge.sac_scale === "number") {
                    diffScale = edge.sac_scale;
                }
                if (edge.use && edge.use == "ferry") {
                    type = edge.use;
                    diffScale = UNKNOWN_WAY_SCALE;
                }

                trailAttributes[i] = { surface: surface, type: type, diffScale: diffScale };
            }
        }

        return trailAttributes;
    } catch (error) {
        console.warn("Unable to fetch Valhalla route attribute data", error);
        return [];
    }
}

async function fetchTrailAttributesForShape(shapePoints: ValhallaShapePoint[], costingBody: Record<string, unknown> | undefined): Promise<(TrailAttributePoint | undefined)[]> {
    if (!shapePoints.length || !costingBody) {
        return [];
    }

    const segments = splitShapePointsByMaxLength(shapePoints, VALHALLA_MAX_PATH_LENGTH_METERS);

    const aggregatedAttributes = Array<TrailAttributePoint | undefined>(shapePoints.length).fill(undefined);

    for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
        const { start, points } = segments[segmentIndex];

        if (points.length < 2) {
            continue;
        }

        const trailAttributes = await requestRouteAttributesForShapeSegment(points, costingBody);

        for (let localIndex = 0; localIndex < points.length; localIndex++) {
            const globalIndex = start + localIndex;

            if (globalIndex >= shapePoints.length) {
                break;
            }

            const attribute = trailAttributes[localIndex];
            if (attribute !== undefined) {
                if (segmentIndex === 0 || localIndex > 0 || aggregatedAttributes[globalIndex] === undefined) {
                    aggregatedAttributes[globalIndex] = attribute;
                }
            }
        }
    }

    return aggregatedAttributes;
}

function setWaypointAttribute(point: Waypoint, attributes: { surface: string, type: string, diffScale: number | undefined}) {
    const setter = (point as any).setAttributes as ((attributes?: { surface: string, type: string, diffScale: number | undefined}) => void) | undefined;
    if (typeof setter === "function") {
        setter.call(point, attributes);
    } else if (attributes === undefined) {
        delete (point as any).attribute;
    } else {
        point.attributes = attributes;
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

export async function fetchRouteClassificationsForGPX( route: GPX, costingBody: Record<string, unknown> | undefined = undefined): Promise<TrailAttributes | undefined> {
    
    const pointEntries = extractRoutePoints(route);

    if (pointEntries.length < 2) {
        return {};
    }    

    const shapePoints = pointEntries.map(({ lat, lon }) => ({ lat, lon }));
    const trailAttributes = await fetchTrailAttributesForShape(shapePoints, costingBody);

    let attributeAssigned = false;

    for (let i = 0; i < pointEntries.length; i += 1) {
        const { point } = pointEntries[i];

        const attributes = trailAttributes[i];
        if (attributes) {
            
            setWaypointAttribute(point, { surface: attributes.surface ?? "", type: attributes.type ?? "", diffScale: attributes.diffScale ?? 0 });
            attributeAssigned = true;
        }
    }

    let trailAttribute: TrailAttributes | undefined;
    if (attributeAssigned) {
        trailAttribute = buildTrailAttributesFromRoute(route);
        if (trailAttribute.perPoint?.length && !trailAttribute.summary) {
            trailAttribute = undefined;
        }
    }

    return trailAttribute;
}


export async function fetchTrailAttributesForGPX(route: GPX, costingBody: Record<string, unknown> | undefined = undefined): Promise<TrailAttributes | undefined> {
    return await fetchRouteClassificationsForGPX(route, costingBody);
}


export function setRoute(newRoute: GPX, undoable: boolean = false) {
    const delta = diff(valhallaStore.route, newRoute);
    const reverseDelta = diff(newRoute, valhallaStore.route);
    valhallaStore.route = applyChangeset(valhallaStore.route, delta);
    if (undoable) {
        pushToUndoStack(delta, reverseDelta)
    }

    setTrailAttributes();
}

export async function calculateRouteBetween(startLat: number, startLon: number, endLat: number, endLon: number, options: RoutingOptions): Promise<{ waypoints: Waypoint[] }> {
    let shapePoints: ValhallaShapePoint[] = [];
    let duration: number = 0;
    let attributes: (TrailAttributePoint | undefined)[] = [];

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
            const trailAttributes = await fetchTrailAttributesForShape(shapePoints, costingBody);
            attributes = trailAttributes;
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
        attributes: attributes[i],
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
    setTrailAttributes();
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
    setTrailAttributes();
}

export function deleteFromRoute(index: number) {
    const snapshot = new GPX({ ...valhallaStore.route })

    snapshot.trk?.at(0)?.trkseg?.splice(index, 1);
    snapshot.features = valhallaStore.route.getTotals();

    const delta = diff(valhallaStore.route, snapshot);
    const reverseDelta = diff(snapshot, valhallaStore.route)
    valhallaStore.route = applyChangeset(valhallaStore.route, delta);
    pushToUndoStack(delta, reverseDelta)
    setTrailAttributes();
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

    setTrailAttributes();
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
    setTrailAttributes();
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
    setTrailAttributes();
}

export function redo() {
    const historyItem = valhallaStore.redoStack.pop()
    if (!historyItem) {
        return
    }
    valhallaStore.undoStack.push(historyItem)

    valhallaStore.route = applyChangeset(valhallaStore.route, historyItem.delta);
    valhallaStore.route.features = valhallaStore.route.getTotals();
    setTrailAttributes();
}
