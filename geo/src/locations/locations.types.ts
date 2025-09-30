export type NominatimResponse = {
    type: string
    licence: string
    features: Feature[]
}

export type LocationSearchResult = {
    name: string;
    description: string;
    lat: number;
    lon: number;
    category: string;
    type: string;
}

type Feature = {
    type: string
    properties: Properties
    bbox: number[]
    geometry: Geometry
}

type Properties = {
    place_id: number
    osm_type: string
    osm_id: number
    place_rank: number
    category: string
    type: string
    importance: number
    addresstype: string
    name: string
    display_name: string
    address: Address
}

type Geometry = {
    type: string
    coordinates: number[]
}

export type Address = {
    amenity: string
    road: string
    neighbourhood: string
    suburb: string
    city_district?: string
    city?: string
    town?: string
    hamlet?: string
    village?: string;
    state: string
    "ISO3166-2-lvl4": string
    postcode: string
    country: string
    country_code: string
}