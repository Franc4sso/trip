import { describe, expect, it } from 'vitest';
import { distanceKm, googleMapsUrl, routeKm, shortestOrder } from './route';

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

    it('builds Google Maps walking directions with waypoints', () => {
        const url = new URL(googleMapsUrl([gion, fushimi], kiyomizu));
        expect(url.searchParams.get('origin')).toBe('34.9949,135.785');
        expect(url.searchParams.get('destination')).toBe('34.9671,135.7727');
        expect(url.searchParams.get('waypoints')).toBe('35.0037,135.7788');
        expect(url.searchParams.get('travelmode')).toBe('walking');
    });
});
