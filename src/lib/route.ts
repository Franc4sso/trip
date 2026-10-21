import type { Coordinates } from './places';

/** Great-circle distance in km. */
export function distanceKm(a: Coordinates, b: Coordinates): number {
    const R = 6371;
    const rad = (d: number) => (d * Math.PI) / 180;
    const dLat = rad(b.latitude - a.latitude);
    const dLon = rad(b.longitude - a.longitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

/** Length of a walk through the stops in order, starting (and ending) at `home` when given. */
export function routeKm(stops: Coordinates[], home: Coordinates | null = null): number {
    const path = home ? [home, ...stops, home] : stops;
    let km = 0;
    for (let i = 1; i < path.length; i++) km += distanceKm(path[i - 1], path[i]);
    return km;
}

/**
 * Order of `stops` (as indexes) with the shortest walk. Exact for up to 8 stops,
 * nearest-neighbour + 2-opt beyond that (a day rarely has more).
 */
export function shortestOrder(stops: Coordinates[], home: Coordinates | null = null): number[] {
    const n = stops.length;
    const ids = stops.map((_, i) => i);
    if (n < 3) return ids;
    const cost = (order: number[]) => routeKm(order.map((i) => stops[i]), home);

    if (n <= 8) {
        let best = ids;
        let bestCost = cost(ids);
        for (const order of permutations(ids)) {
            const c = cost(order);
            if (c < bestCost - 1e-9) {
                best = order;
                bestCost = c;
            }
        }
        return best;
    }

    // nearest neighbour from home (or from the first stop), then 2-opt
    const start = home ?? stops[0];
    const left = new Set(ids);
    const order: number[] = [];
    let at = start;
    while (left.size) {
        let next = -1;
        for (const i of left) if (next < 0 || distanceKm(at, stops[i]) < distanceKm(at, stops[next])) next = i;
        order.push(next);
        left.delete(next);
        at = stops[next];
    }
    let improved = true;
    while (improved) {
        improved = false;
        for (let i = 0; i < n - 1; i++) {
            for (let j = i + 1; j < n; j++) {
                const candidate = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
                if (cost(candidate) < cost(order) - 1e-9) {
                    order.splice(0, n, ...candidate);
                    improved = true;
                }
            }
        }
    }
    return order;
}

function* permutations(items: number[]): Generator<number[]> {
    if (items.length <= 1) {
        yield items;
        return;
    }
    for (let i = 0; i < items.length; i++) {
        const rest = [...items.slice(0, i), ...items.slice(i + 1)];
        for (const p of permutations(rest)) yield [items[i], ...p];
    }
}

/** One stretch of the day on foot, from a stop to the next. */
export interface Leg {
    km: number;
    minutes: number;
    /** True when estimated from the straight line (router unreachable or offline). */
    approximate?: boolean;
}

// streets are rarely straight: a walk is about 30% longer than the crow flies
const DETOUR = 1.3;
const WALK_KMH = 4.5;

// farther than this from the first/last stop, a stay is in another city (travel day)
const WALK_REACH_KM = 15;

/** True when going between the two on foot makes sense at all. */
export function withinWalk(a: Coordinates, b: Coordinates): boolean {
    return distanceKm(a, b) <= WALK_REACH_KM;
}

export function straightLeg(a: Coordinates, b: Coordinates): Leg {
    const km = distanceKm(a, b) * DETOUR;
    return { km, minutes: (km / WALK_KMH) * 60, approximate: true };
}

// Rough door-to-door model for a Japanese city: reaching the station and waiting,
// then metro/train at its average speed including stops. Not a timetable.
const TRANSIT_OVERHEAD_MIN = 12;
const TRANSIT_KMH = 25;

/** Estimated time by metro/train, when it beats walking by enough to be worth it. */
export function transitHint(leg: Pick<Leg, 'km' | 'minutes'>): { minutes: number } | null {
    if (leg.minutes < 30) return null;
    const minutes = TRANSIT_OVERHEAD_MIN + (leg.km / TRANSIT_KMH) * 60;
    return leg.minutes - minutes >= 10 ? { minutes } : null;
}

export function formatKm(km: number): string {
    if (km < 1) return `${Math.round(km * 100) * 10} m`;
    return `${km.toLocaleString('it-IT', { maximumFractionDigits: km < 10 ? 1 : 0 })} km`;
}
