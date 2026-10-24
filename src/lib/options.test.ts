import { describe, expect, it } from 'vitest';
import { choosePatch, chosenOption, suggestAnchors } from './options';
import type { ActivityOption } from './types';

const ichiran: ActivityOption = { name: 'Ichiran', address: '1-22-7 Jinnan, Shibuya', city: 'Tokyo', latitude: 35.66, longitude: 139.7 };
const izakaya: ActivityOption = { name: 'Izakaya Torikizoku', address: null, city: null, latitude: null, longitude: null };

describe('choosePatch', () => {
    it('makes the picked option the location of the activity', () => {
        const patch = choosePatch({ options: [ichiran, izakaya], city: null }, 0);
        expect(patch).toMatchObject({ location: '1-22-7 Jinnan, Shibuya', city: 'Tokyo', latitude: 35.66, longitude: 139.7 });
        expect(chosenOption(patch)).toEqual({ ...ichiran, chosen: true });
    });

    it('keeps a single choice when switching', () => {
        const first = choosePatch({ options: [ichiran, izakaya], city: 'Tokyo' }, 0);
        const second = choosePatch({ ...first, city: 'Tokyo' }, 1);
        expect(second.options.filter((o) => o.chosen)).toHaveLength(1);
        // no address: the name is still something to search for
        expect(second).toMatchObject({ location: 'Izakaya Torikizoku', city: 'Tokyo', latitude: null, longitude: null });
    });

    it('drops the choice and the place with null', () => {
        const chosen = choosePatch({ options: [ichiran], city: 'Tokyo' }, 0);
        const patch = choosePatch({ ...chosen, city: 'Tokyo' }, null);
        expect(chosenOption(patch)).toBeUndefined();
        expect(patch).toMatchObject({ location: null, latitude: null, longitude: null, city: 'Tokyo' });
    });
});

describe('suggestAnchors', () => {
    const at = (id: number, start_time: string | null, title: string, located = true) => ({
        id,
        date: '2026-11-06',
        start_time,
        title,
        type: 'visit' as const,
        latitude: located ? 34.97 : null,
        longitude: located ? 135.77 : null,
    });
    const stays = [{ check_in: '2026-11-05', check_out: '2026-11-08', name: 'Hotel Gracery', latitude: 35.0, longitude: 135.76 }];

    it('starts from the last placed activity before the slot, then the hotel', () => {
        const day = [at(1, '10:00', 'Kinkaku-ji'), at(2, '15:00', 'Fushimi Inari'), at(3, '21:00', 'Gion'), at(4, '16:00', 'Senza posto', false)];
        expect(suggestAnchors(day, stays, '2026-11-06', '19:30').map((a) => a.label)).toEqual(['Dopo Fushimi Inari', 'Hotel Gracery']);
    });

    it('leaves out the activity being edited and works without a date', () => {
        expect(suggestAnchors([at(2, '15:00', 'Fushimi Inari')], stays, '2026-11-06', '19:30', 2).map((a) => a.label)).toEqual(['Hotel Gracery']);
        expect(suggestAnchors([at(2, '15:00', 'Fushimi Inari')], stays, null, '19:30')).toEqual([]);
    });
});
