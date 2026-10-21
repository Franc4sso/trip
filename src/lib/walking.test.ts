import { describe, expect, it } from 'vitest';
import { parseWalk, walkUrl } from './walking';

const at = (latitude: number, longitude: number) => ({ latitude, longitude });

describe('walking', () => {
    it('asks the foot router for the whole day in one request', () => {
        const url = new URL(walkUrl([at(35.6895, 139.7006), at(35.7148, 139.7745)]));
        expect(url.hostname).toBe('routing.openstreetmap.de');
        expect(url.pathname).toBe('/routed-foot/route/v1/driving/139.7006,35.6895;139.7745,35.7148');
        expect(url.searchParams.get('geometries')).toBe('geojson');
        expect(url.searchParams.get('overview')).toBe('full');
    });

    it('reads legs (km, minutes) and the street geometry', () => {
        const walk = parseWalk({
            code: 'Ok',
            routes: [
                {
                    geometry: {
                        coordinates: [
                            [139.7, 35.68],
                            [139.71, 35.69],
                            [139.72, 35.7],
                        ],
                    },
                    legs: [
                        { distance: 1200, duration: 900 },
                        { distance: 8558, duration: 6840 },
                    ],
                },
            ],
        });
        expect(walk.legs).toEqual([
            { km: 1.2, minutes: 15 },
            { km: 8.558, minutes: 114 },
        ]);
        expect(walk.line).toEqual([at(35.68, 139.7), at(35.69, 139.71), at(35.7, 139.72)]);
    });

    it('rejects an answer without a route', () => {
        expect(() => parseWalk({ code: 'NoRoute', routes: [] })).toThrow();
    });
});
