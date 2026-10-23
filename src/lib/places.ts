/**
 * Place search on OpenStreetMap data through Photon (photon.komoot.io): free, no key,
 * CORS-enabled, made for search-as-you-type. Fair use: debounce and cancel stale requests.
 */
export interface Place {
    /** Short name to show and store, e.g. "Kiyomizu-dera" or "Kyoto". */
    name: string;
    /** Extra context for the suggestion list, e.g. "Higashiyama, Kyoto, Japan". */
    detail: string;
    /** Street address when the place has one. */
    address: string | null;
    city: string | null;
    country: string | null;
    latitude: number;
    longitude: number;
}

export interface Coordinates {
    latitude: number;
    longitude: number;
}

export type PlaceKind = 'any' | 'city';

interface PhotonFeature {
    geometry: { coordinates: [number, number] };
    properties: {
        name?: string;
        street?: string;
        housenumber?: string;
        city?: string;
        district?: string;
        county?: string;
        state?: string;
        country?: string;
        type?: string;
    };
}

const ENDPOINT = 'https://photon.komoot.io/api/';

export async function searchPlaces(
    query: string,
    opts: { kind?: PlaceKind; near?: Coordinates | null; city?: string | null; signal?: AbortSignal } = {},
): Promise<Place[]> {
    const params = new URLSearchParams({ q: query, limit: '6', lang: 'en' });
    if (opts.kind === 'city') {
        for (const layer of ['city', 'locality', 'district', 'county']) params.append('layer', layer);
    }
    if (opts.near) {
        params.set('lat', String(opts.near.latitude));
        params.set('lon', String(opts.near.longitude));
    }

    const res = await fetch(`${ENDPOINT}?${params}`, { signal: opts.signal });
    if (!res.ok) throw new Error(`Ricerca luoghi non disponibile (${res.status})`);
    const data = (await res.json()) as { features: PhotonFeature[] };

    const seen = new Set<string>();
    const places = data.features.map(toPlace).filter((p): p is Place => {
        if (!p) return false;
        const key = `${p.name}|${p.detail}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    return preferCity(places, opts.city);
}

/** Moves places in `city` to the top, keeping Photon's order otherwise. */
export function preferCity(places: Place[], city: string | null | undefined): Place[] {
    if (!city) return places;
    const target = city.trim().toLowerCase();
    const inCity = (p: Place) => p.city?.toLowerCase() === target || p.detail.toLowerCase().includes(target);
    return [...places.filter(inCity), ...places.filter((p) => !inCity(p))];
}

export function toPlace(f: PhotonFeature): Place | null {
    const p = f.properties;
    const street = p.street ? [p.street, p.housenumber].filter(Boolean).join(' ') : null;
    const name = p.name ?? street;
    if (!name) return null;

    // a city result is its own city
    const isCity = p.type === 'city' || p.type === 'town' || p.type === 'village';
    const city = isCity ? name : (p.city ?? p.district ?? p.county ?? p.state ?? null);
    const [longitude, latitude] = f.geometry.coordinates;

    return {
        name,
        detail: unique([p.district !== name ? p.district : null, city !== name ? city : null, p.country]).join(', '),
        address: street && street !== name ? [street, city].filter(Boolean).join(', ') : null,
        city,
        country: p.country ?? null,
        latitude,
        longitude,
    };
}

function unique(parts: (string | null | undefined)[]): string[] {
    return parts.filter((p, i): p is string => !!p && parts.indexOf(p) === i);
}

/**
 * Picking a suggestion while typing the next stop ("Tokyo, Kyo") replaces the
 * half-typed last stop with the picked city and leaves room for the next one.
 */
/** The stop being typed: text after the last comma. */
export function lastStop(value: string): string {
    const parts = value.split(',');
    return parts[parts.length - 1];
}

export function addStop(current: string, city: string): string {
    const stops = current.split(',').map((s) => s.trim());
    stops[stops.length - 1] = city;
    return stops.filter(Boolean).join(', ');
}

// ---------------------------------------------------------------- addresses

// building and floor details the map never knows: "OKI Bldg 1F", "3階"
const BUILDING = /\b(bldg|building|bld|tower|plaza|floor|fl)\b\.?|\b\d+\s*f\b|ビル|階/i;
// Kyoto-style directions: "Takoyakushi-dori Shinkyogoku Higashi-iru"
const DIRECTIONS = /-dori\b|\b(agaru|sagaru|iru|higashi-iru|nishi-iru)\b/i;
const POSTCODE = /\b\d{3}-\d{4}\b|〒/g;

/**
 * What to ask the map for a written address, most precise first: the address as written,
 * without building and postcode, then each part (block, neighbourhood) with ward and city.
 */
export function addressQueries(address: string, city?: string | null): string[] {
    const parts = address
        .replace(POSTCODE, '')
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p && !BUILDING.test(p));
    // ward and city close the address: keep them on every simpler query
    const kept = parts.length >= 3 ? 2 : 1;
    const tail = parts.slice(-kept);
    if (city && !tail.some((p) => p.toLowerCase().includes(city.toLowerCase()))) tail.push(city);
    const queries = [address.trim(), parts.join(', ')];
    for (const part of parts.slice(0, -kept)) {
        if (DIRECTIONS.test(part)) continue;
        queries.push([part, ...tail].join(', '));
        // without the house number: the neighbourhood is usually known
        const bare = part.replace(/^[\d-]+\s+/, '');
        if (bare !== part) queries.push([bare, ...tail].join(', '));
    }
    return [...new Set(queries.filter(Boolean))].slice(0, 6);
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// results this coarse would pin a whole ward or city: not a position for a place
const TOO_COARSE = new Set(['city', 'district', 'county', 'state', 'country', 'region']);

/**
 * Finds where a written address is, trying simpler forms of it until the map knows one.
 * `approximate` when only the street or neighbourhood was found, not the building.
 */
export async function geocodeAddress(
    address: string,
    opts: { city?: string | null; near?: Coordinates | null; signal?: AbortSignal } = {},
): Promise<(Coordinates & { approximate: boolean }) | null> {
    const queries = addressQueries(address, opts.city);
    for (const [i, q] of queries.entries()) {
        const params = new URLSearchParams({ q, limit: '3', lang: 'en' });
        if (opts.near) {
            params.set('lat', String(opts.near.latitude));
            params.set('lon', String(opts.near.longitude));
        }
        const res = await fetch(`${ENDPOINT}?${params}`, { signal: opts.signal });
        if (!res.ok) throw new Error(`Ricerca luoghi non disponibile (${res.status})`);
        const { features } = (await res.json()) as { features: PhotonFeature[] };
        const hit = features.find((f) => {
            if (TOO_COARSE.has(f.properties.type ?? '')) return false;
            const [longitude, latitude] = f.geometry.coordinates;
            // in the right place: near where the day happens, or at least in the named city
            if (opts.near) return Math.abs(latitude - opts.near.latitude) < 0.3 && Math.abs(longitude - opts.near.longitude) < 0.3;
            if (opts.city) return [f.properties.city, f.properties.county, f.properties.state].some((c) => c && fold(c).includes(fold(opts.city!)));
            return true;
        });
        if (hit) {
            const [longitude, latitude] = hit.geometry.coordinates;
            return { latitude, longitude, approximate: i > 1 || hit.properties.type !== 'house' };
        }
    }
    return null;
}
