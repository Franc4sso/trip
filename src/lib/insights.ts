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

/** Where the day starts (last night's stay) and ends (tonight's): different on a travel day. */
export function dayStays<S extends Pick<Stay, 'check_in' | 'check_out'>>(stays: S[], date: string): { morning: S | undefined; night: S | undefined } {
    return { morning: stays.find((s) => coversNight(s, addDays(date, -1))), night: stays.find((s) => coversNight(s, date)) };
}

export function startMinute(a: Pick<Activity, 'start_time'>): number | null {
    if (!a.start_time) return null;
    const [h, m] = a.start_time.split(':').map(Number);
    return h * 60 + m;
}

/** What `a` would overlap on `date` if it moved there keeping its time. */
export function clashesOn<A extends Pick<Activity, 'id' | 'date' | 'start_time' | 'duration_minutes' | 'type'>>(activities: A[], a: A, date: string): A[] {
    const start = startMinute(a);
    if (start === null || a.type === 'note') return [];
    const end = start + (a.duration_minutes ?? 60);
    return activities.filter((o) => {
        const from = startMinute(o);
        return o.id !== a.id && o.date === date && o.type !== 'note' && from !== null && from < end && start < from + (o.duration_minutes ?? 60);
    });
}

/** The hotel to go back to on `date`: tonight's, or last night's on check-out day. */
export function hotelOn<S extends Pick<Stay, 'check_in' | 'check_out'>>(stays: S[], date: string): S | undefined {
    const { morning, night } = dayStays(stays, date);
    return night ?? morning;
}

/** When the last timed activity of the day ends (HH:MM), or null with nothing timed. */
export function dayEndsAt(activities: Pick<Activity, 'start_time' | 'duration_minutes' | 'type'>[]): string | null {
    const ends = activities.filter((a) => a.start_time && a.type !== 'note').map((a) => startMinute(a)! + (a.duration_minutes ?? 60));
    return ends.length ? clock(Math.min(Math.max(...ends), 23 * 60 + 55)) : null;
}

/**
 * Resting at the hotel: the "Torna in hotel" type, or one saved under another type
 * but still named like it ("Rientro in hotel · Ryokan…").
 */
export function isHotelBreak(a: Pick<Activity, 'type' | 'title'>): boolean {
    return a.type === 'hotel' || /^rientro in hotel\b/i.test(a.title.trim());
}

function day(date: string, number: number, activities: Activity[], stays: Stay[]): DayInsight {
    // back at the hotel is time taken (no false gaps), not time planned
    const timeTaken = activities.filter((a) => a.type !== 'note');
    const counted = timeTaken.filter((a) => !isHotelBreak(a));

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
        gaps: gaps(timeTaken),
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
