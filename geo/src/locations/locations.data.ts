import type { LocationSearchResult, NominatimResponse, Address } from "./locations.types";
import type { Hits } from "../types"

export async function searchLocations(searchTerm: string, limit?: number): Promise<Hits<LocationSearchResult>> {
    const nominatimURL = process.env.PUBLIC_NOMINATIM_URL ?? "https://nominatim.openstreetmap.org"// ToDo: correct env
    const r = await fetch(`${nominatimURL}/search?q=${searchTerm}&format=geojson&addressdetails=1${limit ? '&limit=' + limit : ''}`, {
        method: "GET",
        headers: new Headers({
            "User-Agent": "wanderer/" //+ version// ToDo
        })
    });
    if (!r.ok) {
        const response = await r.json();
        //throw new APIError(r.status, response.message, response.detail)// ToDo
        return null
    }
    const response: NominatimResponse = await r.json() as NominatimResponse;
    return response.features.map(f => ({
        category: f.properties.category,
        type: f.properties.type == "administrative" ? f.properties.addresstype : f.properties.type,
        description: getLocationDescription(f.properties.address),
        name: f.properties.name.length ? f.properties.name : f.properties.display_name,
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
    }))
}

export async function searchLocationReverse(lat: number, lon: number) {
    const nominatimURL = process.env.PUBLIC_NOMINATIM_URL ?? "https://nominatim.openstreetmap.org"// ToDo: correct env
    const r = await fetch(`${nominatimURL}/reverse?lat=${lat}&lon=${lon}&format=geojson&addressdetails=1`, {
        method: "GET",
        headers: new Headers({
            "User-Agent": "wanderer/" //+ version// ToDo
        })
    });
    if (!r.ok) {
        const response = await r.json();
        //throw new APIError(r.status, response.message, response.detail)   // ToDo
        return null
    }
    const response: NominatimResponse = await r.json() as NominatimResponse;

    if (response.features?.at(0)?.properties.address) { // ToDo: return not the final description, return some meta information instead
        return getLocationDescription(response.features[0].properties.address)
    }
    return ""
}

function getLocationDescription(address: Address) {
    let description = ""

    if (address.country) {
        description += address.country;
    }
    if (address.state) {
        description = `${address.state}, ` + description
    }
    if (address.city) {
        description = `${address.city}, ` + description
    } else if (address.town) {
        description = `${address.town}, ` + description
    } else if (address.hamlet) {
        description = `${address.hamlet}, ` + description
    } else if (address.village) {
        description = `${address.village}, ` + description
    }
    return description;
}