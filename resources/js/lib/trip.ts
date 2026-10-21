import { BedDouble, Camera, Clock, LucideIcon, NotebookPen, ShoppingBag, Sparkles, TrainFront, UtensilsCrossed } from 'lucide-react';

export type Role = 'owner' | 'editor' | 'viewer';
export type ActivityType = 'visit' | 'food' | 'transport' | 'experience' | 'shopping' | 'note';
export type DayLoad = 'empty' | 'ok' | 'full';

export interface Member {
    id: number;
    name: string;
    role: Role;
}

export interface TripHeader {
    id: number;
    name: string;
    destination: string | null;
    start_date: string;
    end_date: string;
    color: string;
    currency: string;
    role: Role | null;
    can_edit: boolean;
    members: Member[];
}

export interface Activity {
    id: number;
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
}

export interface Stay {
    id: number;
    name: string;
    city: string;
    address: string | null;
    check_in: string;
    check_out: string;
    nights: number;
    confirmed: boolean;
    booking_ref: string | null;
    cost: number | null;
    notes: string | null;
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

export const ACTIVITY_TYPES: Record<ActivityType, { label: string; icon: LucideIcon; tint: string; bar: string }> = {
    visit: { label: 'Visita', icon: Camera, tint: 'bg-indigo-soft text-indigo', bar: 'bg-indigo' },
    food: { label: 'Cibo', icon: UtensilsCrossed, tint: 'bg-[#FCEBD9] text-[#A85A12]', bar: 'bg-clay' },
    transport: { label: 'Spostamento', icon: TrainFront, tint: 'bg-[#EEECE6] text-[#4A4B52]', bar: 'bg-stone' },
    experience: { label: 'Esperienza', icon: Sparkles, tint: 'bg-[#EFE7FA] text-grape', bar: 'bg-grape' },
    shopping: { label: 'Shopping', icon: ShoppingBag, tint: 'bg-leaf-soft text-leaf', bar: 'bg-leaf' },
    note: { label: 'Nota', icon: NotebookPen, tint: 'bg-sun-soft text-sun-ink', bar: 'bg-sun-line' },
};

export const StayIcon = BedDouble;
export const TimeIcon = Clock;

/** Member avatar colours, assigned by position so they stay stable within a trip. */
const AVATAR_COLORS = ['#2F43C9', '#C7402A', '#1F7A4D', '#7A4BC2', '#A85A12', '#0E7490', '#9D174D', '#4A4B52'];

export function avatarColor(index: number): string {
    return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

export function initials(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]!.toUpperCase())
        .join('');
}

// Dates arrive as YYYY-MM-DD: parse them as local dates, not UTC midnight.
export function parseDate(date: string): Date {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d);
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('it-IT', opts);
const dayMonth = fmt({ day: 'numeric', month: 'short' });
const weekdayLong = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const weekdayShort = fmt({ weekday: 'short' });

export const formatDayMonth = (date: string) => dayMonth.format(parseDate(date));
export const formatWeekday = (date: string) => capitalize(weekdayLong.format(parseDate(date)));
export const formatWeekdayShort = (date: string) => weekdayShort.format(parseDate(date)).replace('.', '').toUpperCase();
export const dayOfMonth = (date: string) => parseDate(date).getDate();

export function formatRange(start: string, end: string): string {
    const s = parseDate(start);
    const e = parseDate(end);
    if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
        return `${s.getDate()} – ${fmt({ day: 'numeric', month: 'long' }).format(e)}`;
    }
    return `${dayMonth.format(s)} – ${dayMonth.format(e)}`;
}

export function daysBetween(from: Date, to: Date): number {
    const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
    const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.round((b - a) / 86_400_000);
}

export function tripLength(trip: Pick<TripHeader, 'start_date' | 'end_date'>): number {
    return daysBetween(parseDate(trip.start_date), parseDate(trip.end_date)) + 1;
}

export function countdown(trip: Pick<TripHeader, 'start_date' | 'end_date'>, today = new Date()): string {
    const toStart = daysBetween(today, parseDate(trip.start_date));
    const toEnd = daysBetween(today, parseDate(trip.end_date));
    if (toStart > 1) return `tra ${toStart} giorni`;
    if (toStart === 1) return 'domani';
    if (toStart === 0) return 'si parte oggi';
    if (toEnd >= 0) return 'in viaggio';
    return 'concluso';
}

export function formatMinutes(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} min`;
    return m === 0 ? `${h} h` : `${h} h ${m}`;
}

export function deadlineLabel(deadline: string | null, today = new Date()): { text: string; urgent: boolean } {
    if (!deadline) return { text: 'nessuna scadenza', urgent: false };
    const left = daysBetween(today, parseDate(deadline));
    if (left < 0) return { text: `scaduta il ${formatDayMonth(deadline)}`, urgent: true };
    if (left === 0) return { text: 'scade oggi', urgent: true };
    return { text: `entro il ${formatDayMonth(deadline)}`, urgent: left <= 10 };
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
