import type { Activity, ActivityType, DayInsight, Gap, Insights, PendingBooking, Stay } from './types.ts';

/**
 * Reads a trip and tells what is missing: empty or overloaded days,
 * free gaps inside a day, nights without a place to sleep, bookings to do.
 */
export const GAP_MINUTES = 120;
export const FULL_DAY_MINUTES = 600;

interface TripDates {
    start_date: string;
    end_date: string;
}

export function computeInsights(trip: TripDates, activities: Activity[], stays: Stay[]): Insights {
    const sortedStays = [...stays].sort((a, b) => a.check_in.localeCompare(b.check_in));
    const byDate = new Map<string, Activity[]>();
    for (const a of activities) {
        if (!a.date) continue;
        byDate.set(a.date, [...(byDate.get(a.date) ?? []), a]);
    }

    const dates = tripDays(trip);
    const days = dates.map((date, i) => day(date, i + 1, byDate.get(date) ?? [], sortedStays));

    return {
        days,
        empty_days: days.filter((d) => d.load === 'empty').map((d) => d.date),
        full_days: days.filter((d) => d.load === 'full').map((d) => d.date),
        uncovered_nights: dates.slice(0, -1).filter((d) => !sortedStays.some((s) => coversNight(s, d))),
        city_nights: cityNights(sortedStays),
        pending_bookings: pendingBookings(activities),
    };
}

/** Every date of the trip as YYYY-MM-DD, first to last. */
export function tripDays({ start_date, end_date }: TripDates): string[] {
    const out: string[] = [];
    for (let d = start_date; d <= end_date; d = addDays(d, 1)) out.push(d);
    return out;
}

export function addDays(date: string, n: number): string {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** True when the night starting on `date` is spent in this stay. */
export function coversNight(stay: Pick<Stay, 'check_in' | 'check_out'>, date: string): boolean {
    return date >= stay.check_in && date < stay.check_out;
}

export function startMinute(a: Pick<Activity, 'start_time'>): number | null {
    if (!a.start_time) return null;
    const [h, m] = a.start_time.split(':').map(Number);
    return h * 60 + m;
}

function day(date: string, number: number, activities: Activity[], stays: Stay[]): DayInsight {
    const counted = activities.filter((a) => a.type !== 'note');

    const minutesByType: Partial<Record<ActivityType, number>> = {};
    for (const a of counted) minutesByType[a.type] = (minutesByType[a.type] ?? 0) + (a.duration_minutes ?? 0);
    const planned = Object.values(minutesByType).reduce((n, m) => n + m, 0);

    return {
        date,
        number,
        city: cityOn(date, stays),
        activity_count: counted.length,
        planned_minutes: planned,
        minutes_by_type: minutesByType,
        load: counted.length === 0 ? 'empty' : planned > FULL_DAY_MINUTES ? 'full' : 'ok',
        gaps: gaps(counted),
    };
}

/** Free windows between timed activities, merging overlaps first. */
function gaps(activities: Activity[]): Gap[] {
    const timed = activities
        .filter((a) => a.start_time)
        .sort((a, b) => startMinute(a)! - startMinute(b)!);

    const out: Gap[] = [];
    let busyUntil: number | null = null;
    for (const a of timed) {
        const start = startMinute(a)!;
        if (busyUntil !== null && start - busyUntil >= GAP_MINUTES) {
            out.push({ from: clock(busyUntil), to: clock(start), minutes: start - busyUntil });
        }
        busyUntil = Math.max(busyUntil ?? 0, start + (a.duration_minutes ?? 60));
    }
    return out;
}

/** Where you sleep that night, or where you slept the night before (check-out day). */
function cityOn(date: string, stays: Stay[]): string | null {
    return (stays.find((s) => coversNight(s, date)) ?? stays.find((s) => coversNight(s, addDays(date, -1))))?.city ?? null;
}

function cityNights(stays: Stay[]): { city: string; nights: number }[] {
    const nights = new Map<string, number>();
    for (const s of stays) nights.set(s.city, (nights.get(s.city) ?? 0) + nightsOf(s));
    return [...nights].map(([city, n]) => ({ city, nights: n }));
}

export function nightsOf(s: Pick<Stay, 'check_in' | 'check_out'>): number {
    return Math.round((Date.parse(s.check_out) - Date.parse(s.check_in)) / 86_400_000);
}

function pendingBookings(activities: Activity[]): PendingBooking[] {
    return activities
        .filter((a) => a.booking_required && !a.booked)
        .sort((a, b) => (a.booking_deadline ?? '9999-12-31').localeCompare(b.booking_deadline ?? '9999-12-31'))
        .map((a) => ({ id: a.id, title: a.title, date: a.date, deadline: a.booking_deadline, url: a.booking_url }));
}

function clock(minutes: number): string {
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
