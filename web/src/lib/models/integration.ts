
export interface BaseIntegration {
    active: boolean
}

export interface StravaIntegration extends BaseIntegration {
    clientId: string | number;
    clientSecret?: string;
    routes: boolean;
    activities: boolean;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    after?: string
}

export interface KomootIntegration extends BaseIntegration {
    email: string,
    password: string,
    completed: boolean,
    planned: boolean
}

export interface ImmichIntegration extends BaseIntegration {
    url: string;
    apiKey: string;
    timeWindowMinutes: number;
    maxDistanceMeters: number;
    maxWaypoints: number;
    useForStrava: boolean;
    useForKomoot: boolean;
}


export class Integration {
    id?: string;
    user: string;
    strava?: StravaIntegration | null;
    komoot?: KomootIntegration | null
    immich?: ImmichIntegration | null

    constructor(user: string, strava?: StravaIntegration, komoot?: KomootIntegration, immich?: ImmichIntegration) {
        this.user = user;
        this.strava = strava;
        this.komoot = komoot;
        this.immich = immich;
    }
}
