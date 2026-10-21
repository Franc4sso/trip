import { useQuery } from '@tanstack/react-query';
import type { Coordinates } from './places';
import { straightLeg, type Leg } from './route';

export interface Walk {
    legs: Leg[];
    /** Path along the streets, or the straight line between stops when approximate. */
    line: Coordinates[];
    approximate: boolean;
}

// FOSSGIS walking router: OpenStreetMap data, free, no key, CORS enabled.
// The profile segment says "driving" but the foot instance only knows feet.
const ROUTER = 'https://routing.openstreetmap.de/routed-foot/route/v1/driving/';

export function walkUrl(points: Coordinates[]): string {
    const path = points.map((p) => `${p.longitude},${p.latitude}`).join(';');
    return `${ROUTER}${path}?${new URLSearchParams({ overview: 'full', geometries: 'geojson', steps: 'false' })}`;
}

interface OsrmAnswer {
    code: string;
    routes?: {
        geometry: { coordinates: number[][] };
        legs: { distance: number; duration: number }[];
    }[];
}

export function parseWalk(answer: OsrmAnswer): Omit<Walk, 'approximate'> {
    const route = answer.routes?.[0];
    if (answer.code !== 'Ok' || !route) throw new Error(`Percorso non disponibile (${answer.code})`);
    return {
        legs: route.legs.map((l) => ({
            km: l.distance / 1000,
            minutes: l.duration / 60,
        })),
        line: route.geometry.coordinates.map(([longitude, latitude]) => ({
            latitude,
            longitude,
        })),
    };
}

function straightWalk(points: Coordinates[]): Walk {
    return {
        legs: points.slice(1).map((p, i) => straightLeg(points[i], p)),
        line: points,
        approximate: true,
    };
}

/**
 * Walk through `points` in order along real streets. Until the router answers, or when it
 * can't (offline, service down), falls back to straight-line estimates so the page never breaks.
 */
export function useWalk(points: Coordinates[]): Walk & { loading: boolean } {
    const enabled = points.length >= 2;
    const { data, isPending } = useQuery({
        queryKey: ['walk', points.map((p) => [p.latitude, p.longitude])],
        queryFn: async ({ signal }) => {
            const res = await fetch(walkUrl(points), { signal });
            if (!res.ok) throw new Error(`Router ${res.status}`);
            return parseWalk(await res.json());
        },
        enabled,
        staleTime: Infinity,
        retry: 1,
    });
    if (data) return { ...data, approximate: false, loading: false };
    return { ...straightWalk(points), loading: enabled && isPending };
}
