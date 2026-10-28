/**
 * Data shapes shared by the app and the Supabase Edge Functions (Deno):
 * no runtime imports here, and relative imports keep their .ts extension.
 */
export type Role = 'owner' | 'editor' | 'viewer';
export const ACTIVITY_TYPE_VALUES = ['visit', 'food', 'transport', 'experience', 'shopping', 'hotel', 'note'] as const;
export type ActivityType = (typeof ACTIVITY_TYPE_VALUES)[number];
export type DayLoad = 'empty' | 'ok' | 'full';

export interface Member {
    id: string;
    name: string;
    role: Role;
}

export interface TripHeader extends Trip {
    role: Role | null;
    can_edit: boolean;
    members: Member[];
}

export interface Trip {
    id: number;
    name: string;
    destination: string | null;
    start_date: string;
    end_date: string;
    color: string;
    currency: string;
    /** Minutes after midnight until which a night out goes on (0 = off). */
    night_out_ends: number;
}

export interface Activity {
    id: number;
    trip_id: number;
    created_by: string | null;
    date: string | null;
    start_time: string | null;
    duration_minutes: number | null;
    type: ActivityType;
    title: string;
    location: string | null;
    city: string | null;
    notes: string | null;
    cost: number | null;
    booking_required: boolean;
    booking_deadline: string | null;
    booked: boolean;
    booking_url: string | null;
    latitude: number | null;
    longitude: number | null;
    /** Alternatives to pick from on the spot; the chosen one is also the activity's location. */
    options: ActivityOption[];
    /** Photos and a description of the place, found by the AI. */
    info: PlaceInfo | null;
}

export interface PlaceInfo {
    /** Two or three sentences: what the place is and why go. */
    summary: string | null;
    /** What you eat there, or what it is (a temple, a market…). */
    what: string | null;
    /** Average price per head, or the entrance fee. */
    price: string | null;
    hours: string | null;
    /** Checked image urls, best first. */
    photos: string[];
    source_url: string | null;
}

export interface ActivityOption {
    name: string;
    address: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    info?: PlaceInfo | null;
    chosen?: boolean;
}

export interface Stay {
    id: number;
    trip_id: number;
    name: string;
    city: string;
    address: string | null;
    check_in: string;
    check_out: string;
    confirmed: boolean;
    booking_ref: string | null;
    cost: number | null;
    notes: string | null;
    latitude: number | null;
    longitude: number | null;
}

export interface Gap {
    from: string;
    to: string;
    minutes: number;
}

export interface DayInsight {
    date: string;
    number: number;
    city: string | null;
    activity_count: number;
    planned_minutes: number;
    minutes_by_type: Partial<Record<ActivityType, number>>;
    load: DayLoad;
    gaps: Gap[];
}

export interface PendingBooking {
    id: number;
    title: string;
    date: string | null;
    deadline: string | null;
    url: string | null;
}

export interface Insights {
    days: DayInsight[];
    empty_days: string[];
    full_days: string[];
    uncovered_nights: string[];
    city_nights: { city: string; nights: number }[];
    pending_bookings: PendingBooking[];
}
