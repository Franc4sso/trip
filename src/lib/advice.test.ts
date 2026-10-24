import { describe, expect, it } from 'vitest';
import { AdviceSchema, itineraryHash, itineraryText } from './advice';
import type { Activity, Stay } from './types';

const trip = { id: 1, name: 'Giappone', destination: 'Kyoto', start_date: '2026-11-06', end_date: '2026-11-08', color: '#2F43C9', currency: 'JPY' };

const activity = (attrs: Partial<Activity>): Activity => ({
    id: 1,
    trip_id: 1,
    created_by: null,
    date: null,
    start_time: null,
    duration_minutes: 60,
    type: 'visit',
    title: 'x',
    location: null,
    city: null,
    notes: null,
    cost: null,
    booking_required: false,
    booking_deadline: null,
    booked: false,
    booking_url: null,
    latitude: null,
    longitude: null,
    options: [],
    info: null,
    ...attrs,
});

const stay: Stay = { id: 9, trip_id: 1, name: 'Ryokan', city: 'Kyoto', address: null, check_in: '2026-11-06', check_out: '2026-11-08', confirmed: false, booking_ref: null, cost: null, notes: null, latitude: null, longitude: null };

describe('itineraryText', () => {
    const text = itineraryText(
        trip,
        [
            activity({ id: 1, date: '2026-11-06', start_time: '09:00', duration_minutes: 120, title: 'Kiyomizu-dera', city: 'Kyoto' }),
            activity({ id: 2, date: '2026-11-06', start_time: '14:00', title: 'Gion' }),
            activity({ id: 3, date: '2026-11-06', start_time: '19:30', type: 'food', title: 'Cena kaiseki', booking_required: true, booking_deadline: '2026-10-30' }),
            activity({ id: 4, title: 'Nara' }),
        ],
        [stay],
    );

    it('writes days with weekday, city, gaps and activities in time order', () => {
        expect(text).toContain('2026-11-06 (venerdì, giorno 1, Kyoto)');
        expect(text).toContain('buco 11:00-14:00');
        expect(text.indexOf('Kiyomizu-dera')).toBeLessThan(text.indexOf('Gion'));
        expect(text).toContain('[da prenotare entro 2026-10-30]');
    });

    it('lists empty days, ideas, stays and computed problems', () => {
        expect(text).toContain('2026-11-07 (sabato, giorno 2, Kyoto) — VUOTO');
        expect(text).toContain('LISTA IDEE');
        expect(text).toMatch(/LISTA IDEE[^\n]*\n- senza orario Nara/);
        expect(text).toContain('Ryokan, Kyoto: 2026-11-06 → 2026-11-08 (da confermare)');
        expect(text).toContain('Prenotazioni da fare: Cena kaiseki (entro 2026-10-30)');
    });

    it('is stable, so the hash changes only when the trip changes', async () => {
        const again = itineraryText(trip, [activity({ id: 4, title: 'Nara' })], [stay]);
        const changed = itineraryText(trip, [activity({ id: 4, title: 'Nara e Todai-ji' })], [stay]);
        expect(await itineraryHash(again)).toBe(await itineraryHash(itineraryText(trip, [activity({ id: 4, title: 'Nara' })], [stay])));
        expect(await itineraryHash(again)).not.toBe(await itineraryHash(changed));
        expect(await itineraryHash('a')).toMatch(/^[0-9a-f]{64}$/);
    });
});

describe('AdviceSchema', () => {
    it('accepts a well-formed answer and rejects a wrong kind', () => {
        const ok = {
            suggestions: [{ kind: 'gap', title: 'Buco a Kyoto', body: 'Pranzo al Nishiki Market.', date: '2026-11-06', add: { title: 'Nishiki Market', date: '2026-11-06', start_time: '12:00', duration_minutes: 90, type: 'food', city: 'Kyoto' } }],
            answer: null,
        };
        expect(AdviceSchema.safeParse(ok).success).toBe(true);
        expect(AdviceSchema.safeParse({ ...ok, suggestions: [{ ...ok.suggestions[0], kind: 'boh' }] }).success).toBe(false);
    });
});
