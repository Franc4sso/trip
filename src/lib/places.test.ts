import { describe, expect, it } from 'vitest';
import { addStop, lastStop, preferCity, toPlace, type Place } from './places';

// shapes copied from real photon.komoot.io responses
const temple = {
    geometry: { coordinates: [135.785, 34.995] as [number, number] },
    properties: { type: 'house', name: 'Kiyomizu-dera', street: 'Kiyomizu Slope', district: 'Higashiyama Ward', city: 'Kyoto', state: 'Kyoto Prefecture', country: 'Japan' },
};
const city = {
    geometry: { coordinates: [135.768, 35.011] as [number, number] },
    properties: { type: 'city', name: 'Kyoto', state: 'Kyoto Prefecture', country: 'Japan' },
};

describe('toPlace', () => {
    it('keeps name, city, address and coordinates of a point of interest', () => {
        expect(toPlace(temple)).toEqual({
            name: 'Kiyomizu-dera',
            detail: 'Higashiyama Ward, Kyoto, Japan',
            address: 'Kiyomizu Slope, Kyoto',
            city: 'Kyoto',
            country: 'Japan',
            latitude: 34.995,
            longitude: 135.785,
        });
    });

    it('treats a city result as its own city', () => {
        expect(toPlace(city)).toMatchObject({ name: 'Kyoto', city: 'Kyoto', detail: 'Japan', address: null });
    });

    it('falls back to the street when there is no name', () => {
        expect(toPlace({ geometry: { coordinates: [0, 0] }, properties: { street: 'Via Roma', housenumber: '1', city: 'Napoli', country: 'Italy' } })).toMatchObject({
            name: 'Via Roma 1',
            city: 'Napoli',
            address: null,
        });
    });

    it('drops results without a name or street', () => {
        expect(toPlace({ geometry: { coordinates: [0, 0] }, properties: { country: 'Italy' } })).toBeNull();
    });
});

describe('addStop', () => {
    it('replaces the half-typed last stop with the picked city', () => {
        expect(addStop('Tokyo, Kyo', 'Kyoto')).toBe('Tokyo, Kyoto');
        expect(addStop('Tok', 'Tokyo')).toBe('Tokyo');
        expect(addStop('', 'Osaka')).toBe('Osaka');
    });

    it('searches only the stop being typed', () => {
        expect(lastStop('Tokyo, kyot').trim()).toBe('kyot');
        expect(lastStop('Tokyo').trim()).toBe('Tokyo');
    });
});

describe('preferCity', () => {
    const place = (name: string, city: string | null): Place => ({ name, detail: city ?? '', address: null, city, country: 'Japan', latitude: 0, longitude: 0 });

    it('puts places of the current city first', () => {
        const ranked = preferCity([place('Kiyomizu', 'Saito'), place('Kiyomizu-dera', 'Kyoto'), place('Kiyomizu', 'Itako')], 'kyoto');
        expect(ranked.map((p) => p.city)).toEqual(['Kyoto', 'Saito', 'Itako']);
    });

    it('keeps the order when no city is known', () => {
        const list = [place('A', 'X'), place('B', 'Y')];
        expect(preferCity(list, null)).toBe(list);
    });
});
