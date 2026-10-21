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

/** Google Maps walking directions through the stops (opens the app on phones). */
export function googleMapsUrl(stops: Coordinates[], home: Coordinates | null = null): string {
    const fmt = (c: Coordinates) => `${c.latitude},${c.longitude}`;
    const path = home ? [home, ...stops] : stops;
    const params = new URLSearchParams({ api: '1', travelmode: 'walking', origin: fmt(path[0]), destination: fmt(path[path.length - 1]) });
    const middle = path.slice(1, -1);
    if (middle.length) params.set('waypoints', middle.map(fmt).join('|'));
    return `https://www.google.com/maps/dir/?${params}`;
}
