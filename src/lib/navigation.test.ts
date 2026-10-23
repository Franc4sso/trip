import { describe, expect, it } from 'vitest';
import { bearing, formatMeters, instruction, meters, navigationUrl, parseNavigation, progress, spoken } from './navigation';

const at = (latitude: number, longitude: number) => ({ latitude, longitude });

// an L-shaped walk in Shinjuku: ~111 m north, then ~90 m east
const corner = at(35.691, 139.7);
const answer = {
    code: 'Ok',
    routes: [
        {
            distance: 200,
            duration: 160,
            geometry: { coordinates: [[139.7, 35.69], [139.7, 35.691], [139.701, 35.691]] },
            legs: [
                {
                    steps: [
                        { distance: 110, name: 'Meiji-dori', maneuver: { type: 'depart', bearing_after: 0 } },
                        { distance: 90, name: 'Yasukuni-dori', maneuver: { type: 'turn', modifier: 'right' } },
                        { distance: 0, name: '', maneuver: { type: 'arrive' } },
                    ],
                },
            ],
        },
    ],
};

describe('navigation', () => {
    it('asks the foot router for turn-by-turn steps', () => {
        const url = new URL(navigationUrl(at(35.69, 139.7), at(35.7, 139.71)));
        expect(url.pathname).toBe('/routed-foot/route/v1/driving/139.7,35.69;139.71,35.7');
        expect(url.searchParams.get('steps')).toBe('true');
    });

    it('speaks Italian', () => {
        expect(instruction({ type: 'depart', bearing_after: 85 }, 'Meiji-dori')).toBe('Cammina verso est su Meiji-dori');
        expect(instruction({ type: 'turn', modifier: 'left' }, '')).toBe('Gira a sinistra');
        expect(instruction({ type: 'turn', modifier: 'straight' }, 'Omotesando')).toBe('Prosegui dritto su Omotesando');
        expect(instruction({ type: 'end of road', modifier: 'sharp right' }, '')).toBe('In fondo alla strada gira tutto a destra');
        expect(instruction({ type: 'roundabout', exit: 2 }, 'Chuo-dori')).toBe('Alla rotonda prendi la 2ª uscita su Chuo-dori');
        expect(instruction({ type: 'fork', modifier: 'slight left' }, '')).toBe('Al bivio tieni la sinistra');
        expect(instruction({ type: 'continue', modifier: 'uturn' }, '')).toBe('Torna indietro');
    });

    it('rounds distances the way you say them', () => {
        expect(formatMeters(7)).toBe('5 m');
        expect(formatMeters(83)).toBe('85 m');
        expect(formatMeters(162)).toBe('150 m');
        expect(formatMeters(1240)).toBe('1,2 km');
        expect(spoken({ type: 'turn', modifier: 'right', text: 'Gira a destra', at: 0 }, 148)).toBe('Tra 150 metri, gira a destra');
        expect(spoken({ type: 'turn', modifier: 'right', text: 'Gira a destra', at: 0 }, 12)).toBe('Gira a destra');
    });

    it('measures and orients at walking scale', () => {
        expect(meters(at(35.69, 139.7), corner)).toBeCloseTo(111, 0);
        expect(bearing(at(35.69, 139.7), corner)).toBeCloseTo(0, 0);
        expect(bearing(corner, at(35.691, 139.701))).toBeCloseTo(90, 0);
    });

    it('follows the walker along the route', () => {
        const route = parseNavigation(answer);
        expect(route.steps.map((s) => s.text)).toEqual(['Cammina verso nord su Meiji-dori', 'Gira a destra su Yasukuni-dori', 'Sei arrivato']);

        // halfway up the first street, a few metres off to the side
        const p = progress(route, at(35.6905, 139.70003));
        expect(p.current.type).toBe('depart');
        expect(p.next?.text).toBe('Gira a destra su Yasukuni-dori');
        expect(p.toNext).toBeGreaterThan(50);
        expect(p.toNext).toBeLessThan(62);
        expect(p.offRoute).toBeGreaterThan(1);
        expect(p.offRoute).toBeLessThan(5);

        // past the corner: the next thing is the arrival
        const later = progress(route, at(35.691, 139.7005));
        expect(later.current.type).toBe('turn');
        expect(later.next?.type).toBe('arrive');
        expect(later.remaining).toBeCloseTo(45, -1);
        expect(later.seconds).toBeCloseTo(later.remaining * 0.8, 5);
    });

    it('knows when the walker left the route', () => {
        const route = parseNavigation(answer);
        // 55 m south of the second street, 72 m east of the first
        expect(progress(route, at(35.6905, 139.7008)).offRoute).toBeCloseTo(55.6, 0);
    });

    it('refuses an answer without a route', () => {
        expect(() => parseNavigation({ code: 'NoRoute' })).toThrow();
    });
});
