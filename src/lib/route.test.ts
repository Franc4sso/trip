import { describe, expect, it } from 'vitest';
import { distanceKm, formatKm, routeKm, shortestOrder, straightLeg, transitHint, withinWalk } from './route';

const at = (latitude: number, longitude: number) => ({ latitude, longitude });

// Kyoto: Kiyomizu-dera, Gion, Fushimi Inari, Kinkaku-ji
const kiyomizu = at(34.9949, 135.785);
const gion = at(35.0037, 135.7788);
const fushimi = at(34.9671, 135.7727);
const kinkakuji = at(35.0394, 135.7292);

describe('route', () => {
    it('measures distances in km', () => {
        expect(distanceKm(kiyomizu, gion)).toBeCloseTo(1.17, 1);
        expect(distanceKm(gion, gion)).toBe(0);
    });

    it('sums a walk, optionally from and back home', () => {
        expect(routeKm([kiyomizu, gion])).toBeCloseTo(distanceKm(kiyomizu, gion));
        expect(routeKm([gion], kiyomizu)).toBeCloseTo(2 * distanceKm(kiyomizu, gion));
    });

    it('finds a shorter order than a zig-zag', () => {
        const stops = [fushimi, kinkakuji, kiyomizu, gion];
        const order = shortestOrder(stops, kiyomizu);
        expect(routeKm(order.map((i) => stops[i]), kiyomizu)).toBeLessThan(routeKm(stops, kiyomizu));
        expect([...order].sort()).toEqual([0, 1, 2, 3]);
    });

    it('handles many stops with the heuristic', () => {
        const stops = Array.from({ length: 10 }, (_, i) => at(35 + (i % 2) * 0.05, 135.7 + i * 0.01));
        const order = shortestOrder(stops);
        expect(new Set(order).size).toBe(10);
        expect(routeKm(order.map((i) => stops[i]))).toBeLessThanOrEqual(routeKm(stops));
    });

    it('estimates a walk from the straight line when the router is unavailable', () => {
        const leg = straightLeg(kiyomizu, gion);
        expect(leg.km).toBeCloseTo(distanceKm(kiyomizu, gion) * 1.3, 5);
        expect(leg.minutes).toBeCloseTo((leg.km / 4.5) * 60, 5);
        expect(leg.approximate).toBe(true);
    });

    it('treats a stay in another city as out of walking reach', () => {
        expect(withinWalk(gion, kinkakuji)).toBe(true);
        // Kyoto -> Tokyo: the shinkansen covers that, not the feet
        expect(withinWalk(gion, at(35.6812, 139.7671))).toBe(false);
    });

    it('suggests transit only when it saves real time', () => {
        // 15 minutes on foot: just walk
        expect(transitHint({ km: 1.1, minutes: 15 })).toBeNull();
        // Shinjuku -> Ueno, ~2 hours on foot
        const hint = transitHint({ km: 8.6, minutes: 114 });
        expect(hint).not.toBeNull();
        expect(hint!.minutes).toBeGreaterThan(20);
        expect(hint!.minutes).toBeLessThan(45);
        // a long but straight walk where waiting for a train would not pay off
        expect(transitHint({ km: 2.2, minutes: 28 })).toBeNull();
    });

    it('formats distances in Italian', () => {
        expect(formatKm(0.42)).toBe('420 m');
        expect(formatKm(1.25)).toBe('1,3 km');
        expect(formatKm(12.04)).toBe('12 km');
    });
});
