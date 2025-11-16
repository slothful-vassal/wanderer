import GPX from "$lib/models/gpx/gpx";
import { haversineDistance } from "$lib/models/gpx/utils";
import type { ImmichIntegration, Integration } from "$lib/models/integration";
import { Waypoint } from "$lib/models/waypoint";
import type { AssetResponseDto } from "@immich/sdk";
import {
    getAssetOriginalPath,
    getAssetThumbnailPath,
    searchAssets,
} from "@immich/sdk";
import type { AuthRecord } from "pocketbase";
import PocketBase, { ClientResponseError } from "pocketbase";

type TrackPoint = {
    lat: number;
    lon: number;
    time?: Date;
    distanceFromStart: number;
};

type ImmichAssetMatch = {
    asset: AssetResponseDto;
    distance: number;
    point: TrackPoint;
};

export async function fetchImmichWaypoints(
    pb: PocketBase,
    user: AuthRecord | null,
    gpx: GPX,
): Promise<Waypoint[]> {
    if (!user) {
        return [];
    }

    const trackPoints = buildTrack(gpx);
    if (trackPoints.length < 2) {
        return [];
    }

    const timeBounds = getTimeBounds(trackPoints);
    if (!timeBounds) {
        return [];
    }

    const integration = await loadIntegration(pb, user.id);
    if (!integration) {
        return [];
    }

    const apiBaseUrl = normalizeImmichUrl(integration.url);
    if (!apiBaseUrl || !integration.apiKey?.length) {
        return [];
    }
    const timeWindowMs = integration.timeWindowMinutes * 60 * 1000;
    const takenAfter = new Date(timeBounds.start.getTime() - timeWindowMs);
    const takenBefore = new Date(timeBounds.end.getTime() + timeWindowMs);

    const assets = await collectImmichAssets(
        apiBaseUrl,
        integration.apiKey,
        takenAfter.toISOString(),
        takenBefore.toISOString(),
        integration.maxWaypoints * 3,
    );

    if (!assets.length) {
        return [];
    }

    const matches: ImmichAssetMatch[] = [];

    for (const asset of assets) {
        const lat = asset.exifInfo?.latitude;
        const lon = asset.exifInfo?.longitude;
        if (lat == null || lon == null) {
            continue;
        }

        const nearest = findNearestTrackPoint(lat, lon, trackPoints);
        if (!nearest || nearest.distance > integration.maxDistanceMeters) {
            continue;
        }

        matches.push({
            asset,
            distance: nearest.distance,
            point: nearest.point,
        });
    }

    if (!matches.length) {
        return [];
    }

    matches.sort(
        (a, b) =>
            (a.point.distanceFromStart ?? 0) -
            (b.point.distanceFromStart ?? 0),
    );

    const limitedMatches = matches.slice(0, integration.maxWaypoints);

    const waypoints: Waypoint[] = [];
    for (const match of limitedMatches) {
        const photo = await downloadImmichAsset(
            apiBaseUrl,
            integration.apiKey,
            match.asset,
        );
        if (!photo) {
            continue;
        }

        const waypoint = new Waypoint(match.point.lat, match.point.lon);
        waypoint.distance_from_start = Math.round(match.point.distanceFromStart);
        waypoint.icon = "camera";
        waypoint.name = buildWaypointName(match.asset);
        const immichDescription = buildWaypointDescription(match.asset);
        if (immichDescription) {
            waypoint.description = immichDescription;
        }
        waypoint.photos = [];
        waypoint._photos = [photo];

        waypoints.push(waypoint);
    }

    return waypoints;
}

async function loadIntegration(
    pb: PocketBase,
    userId: string,
): Promise<ImmichIntegration | null> {
    try {
        const record = await pb
            .collection("integrations")
            .getFirstListItem<Integration>(`user="${userId}"`, {
                requestKey: null,
            });
        if (!record?.immich?.active) {
            return null;
        }
        return record.immich as ImmichIntegration;
    } catch (error) {
        if (
            error instanceof ClientResponseError &&
            (error.status === 404 || error.status === 403)
        ) {
            return null;
        }
        throw error;
    }
}

function normalizeImmichUrl(url: string): string {
    let normalized = url.trim();
    if (!normalized.length) {
        return "";
    }
    if (!/^https?:\/\//i.test(normalized)) {
        normalized = `https://${normalized}`;
    }
    normalized = normalized.replace(/\/+$/g, "");
    if (!normalized.endsWith("/api")) {
        normalized = `${normalized}/api`;
    }
    return normalized;
}

function buildTrack(gpx: GPX): TrackPoint[] {
    const points: TrackPoint[] = [];

    const collect = (lat?: number | null, lon?: number | null, time?: Date) => {
        if (lat === undefined || lat === null || lon === undefined || lon === null) {
            return;
        }
        const previous = points.at(-1);
        const distanceFromStart =
            (previous?.distanceFromStart ?? 0) +
            (previous
                ? haversineDistance(previous.lat, previous.lon, lat, lon)
                : 0);
        points.push({ lat, lon, time, distanceFromStart });
    };

    for (const track of gpx.trk ?? []) {
        for (const segment of track.trkseg ?? []) {
            for (const point of segment.trkpt ?? []) {
                collect(point.$.lat, point.$.lon, point.time);
            }
        }
    }

    if (!points.length) {
        for (const route of gpx.rte ?? []) {
            for (const point of route.rtept ?? []) {
                collect(point.$.lat, point.$.lon, point.time);
            }
        }
    }

    return points;
}

function getTimeBounds(points: TrackPoint[]) {
    const times = points
        .map((p) => p.time)
        .filter((time): time is Date => time instanceof Date);
    if (!times.length) {
        return null;
    }
    times.sort((a, b) => a.getTime() - b.getTime());
    return {
        start: times[0],
        end: times.at(-1)!,
    };
}

function findNearestTrackPoint(
    lat: number,
    lon: number,
    track: TrackPoint[],
) {
    let closest: { point: TrackPoint; distance: number } | null = null;
    for (const point of track) {
        const distance = haversineDistance(lat, lon, point.lat, point.lon);
        if (!closest || distance < closest.distance) {
            closest = { point, distance };
        }
    }
    return closest;
}

async function collectImmichAssets(
    baseUrl: string,
    apiKey: string,
    takenAfter: string,
    takenBefore: string,
    maxAssets: number,
) {
    const assets: AssetResponseDto[] = [];
    let page = 1;
    let hasNext = true;

    while (hasNext && assets.length < maxAssets) {
        const response = await searchAssets(
            {
                metadataSearchDto: {
                    withExif: true,
                    takenAfter,
                    takenBefore,
                    page,
                },
            },
            {
                baseUrl,
                headers: {
                    "x-api-key": apiKey,
                },
            },
        );

        assets.push(...response.assets.items);

        const next = response.assets.nextPage;
        if (!next) {
            hasNext = false;
        } else {
            const parsed = parseNextPage(next);
            if (parsed) {
                page = parsed;
            } else {
                hasNext = false;
            }
        }
    }

    return assets.slice(0, maxAssets);
}

function parseNextPage(next: string): number | null {
    if (/^\d+$/.test(next)) {
        return Number(next);
    }
    const match = next.match(/page=(\d+)/i);
    if (match) {
        return Number(match[1]);
    }
    return null;
}

async function downloadImmichAsset(
    baseUrl: string,
    apiKey: string,
    asset: AssetResponseDto,
): Promise<File | null> {
    const attempts: { url: string; label: string }[] = [
        { url: `${baseUrl}${getAssetOriginalPath(asset.id)}`, label: "original" },
        {
            url: `${baseUrl}${getAssetThumbnailPath(asset.id)}?size=preview`,
            label: "preview",
        },
    ];

    for (const attempt of attempts) {
        try {
            const response = await fetch(attempt.url, {
                headers: {
                    "x-api-key": apiKey,
                },
            });
            if (!response.ok) {
                console.warn(
                    `Unable to download Immich ${attempt.label} for asset ${asset.id}: ${response.status}`,
                );
                continue;
            }
            const blob = await response.blob();
            const contentType =
                response.headers.get("content-type") ?? "image/jpeg";
            const extension = mimeToExtension(contentType);
            return new File([blob], `${asset.id}.${extension}`, {
                type: contentType,
            });
        } catch (error) {
            console.warn(
                `Immich ${attempt.label} download error for asset ${asset.id}`,
                error,
            );
        }
    }

    return null;
}

function mimeToExtension(type: string) {
    if (type.includes("png")) {
        return "png";
    }
    if (type.includes("webp")) {
        return "webp";
    }
    if (type.includes("gif")) {
        return "gif";
    }
    return "jpg";
}

function buildWaypointDescription(asset: AssetResponseDto) {
    const description = asset.exifInfo?.description?.trim();
    return description?.length ? description : undefined;
}

function buildWaypointName(asset: AssetResponseDto) {
    const location = [asset.exifInfo?.city, asset.exifInfo?.country]
        .filter(Boolean)
        .join(", ");
    if (!location.length) {
        return "Imported from Immich";
    }
    return location;
}
