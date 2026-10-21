import { describe, expect, it } from 'vitest';
import { computeInsights } from './insights';
import type { Activity, Stay } from './trip';

const trip = { start_date: '2026-11-03', end_date: '2026-11-06' };

let nextId = 1;
function activity(attrs: Partial<Activity>): Activity {
    return {
        id: nextId++,
        trip_id: 1,
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
        created_by: null,
        latitude: null,
        longitude: null,
        ...attrs,
    };
}

function stay(attrs: Partial<Stay>): Stay {
    return { id: nextId++, trip_id: 1, name: 'Hotel', city: 'Tokyo', address: null, check_in: '2026-11-03', check_out: '2026-11-04', confirmed: true, booking_ref: null, cost: null, notes: null, latitude: null, longitude: null, ...attrs };
}

const dayOf = (insights: ReturnType<typeof computeInsights>, date: string) => insights.days.find((d) => d.date === date)!;

describe('computeInsights', () => {
    it('lists every day of the trip', () => {
        const insights = computeInsights(trip, [], []);
        expect(insights.days.map((d) => d.date)).toEqual(['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
        expect(insights.days.map((d) => d.number)).toEqual([1, 2, 3, 4]);
    });

    it('marks days without activities (notes do not count) as empty', () => {
        const insights = computeInsights(trip, [activity({ date: '2026-11-04', start_time: '10:00:00', duration_minutes: 120 }), activity({ date: '2026-11-05', type: 'note' })], []);
        expect(insights.empty_days).toEqual(['2026-11-03', '2026-11-05', '2026-11-06']);
        expect(dayOf(insights, '2026-11-04').load).toBe('ok');
    });

    it('sums minutes by type and flags overloaded days', () => {
        const day = dayOf(
            computeInsights(trip, [
                activity({ date: '2026-11-03', start_time: '08:00', duration_minutes: 300, type: 'visit' }),
                activity({ date: '2026-11-03', start_time: '13:00', duration_minutes: 60, type: 'food' }),
                activity({ date: '2026-11-03', start_time: '14:00', duration_minutes: 300, type: 'experience' }),
            ], []),
            '2026-11-03',
        );
        expect(day.planned_minutes).toBe(660);
        expect(day.minutes_by_type).toEqual({ visit: 300, food: 60, experience: 300 });
        expect(day.load).toBe('full');
    });

    it('finds gaps of two hours or more between timed activities', () => {
        const day = dayOf(
            computeInsights(trip, [
                activity({ date: '2026-11-04', start_time: '09:00', duration_minutes: 120 }),
                activity({ date: '2026-11-04', start_time: '14:00:00', duration_minutes: 60 }),
                activity({ date: '2026-11-04', start_time: '16:30', duration_minutes: 60 }),
            ], []),
            '2026-11-04',
        );
        expect(day.gaps).toEqual([{ from: '11:00', to: '14:00', minutes: 180 }]);
    });

    it('merges overlapping activities before looking for gaps', () => {
        const day = dayOf(
            computeInsights(trip, [
                activity({ date: '2026-11-04', start_time: '09:00', duration_minutes: 300 }),
                activity({ date: '2026-11-04', start_time: '10:00', duration_minutes: 60 }),
                activity({ date: '2026-11-04', start_time: '15:00', duration_minutes: 60 }),
            ], []),
            '2026-11-04',
        );
        expect(day.gaps).toEqual([]);
    });

    it('takes the city from the stay and reports uncovered nights', () => {
        const insights = computeInsights(trip, [], [stay({ city: 'Tokyo', check_in: '2026-11-03', check_out: '2026-11-05' })]);
        expect(dayOf(insights, '2026-11-03').city).toBe('Tokyo');
        expect(dayOf(insights, '2026-11-05').city).toBe('Tokyo'); // check-out day
        expect(insights.uncovered_nights).toEqual(['2026-11-05']); // last day is departure
        expect(insights.city_nights).toEqual([{ city: 'Tokyo', nights: 2 }]);
    });

    it('sorts pending bookings by deadline, undated last', () => {
        const titles = computeInsights(trip, [
            activity({ title: 'Late', booking_required: true, booking_deadline: '2026-10-30' }),
            activity({ title: 'Done', booking_required: true, booked: true, booking_deadline: '2026-10-01' }),
            activity({ title: 'Soon', booking_required: true, booking_deadline: '2026-10-25' }),
            activity({ title: 'Whenever', booking_required: true }),
        ], []).pending_bookings.map((b) => b.title);
        expect(titles).toEqual(['Soon', 'Late', 'Whenever']);
    });
});
