import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useUser } from './auth';
import { supabase } from './supabase';
import type { Activity, Member, Role, Stay, Trip, TripHeader } from './trip';

// invite_token is not selectable: always list trip columns explicitly
const TRIP_COLUMNS = 'id, name, destination, start_date, end_date, color, currency';
const ACTIVITY_COLUMNS =
    'id, trip_id, created_by, date, start_time, duration_minutes, type, title, location, city, notes, cost, booking_required, booking_deadline, booked, booking_url, latitude, longitude';
const STAY_COLUMNS = 'id, trip_id, name, city, address, check_in, check_out, confirmed, booking_ref, cost, notes, latitude, longitude';
const MEMBER_COLUMNS = 'user_id, role, created_at, profiles(name)';

export interface TripData {
    trip: TripHeader;
    activities: Activity[];
    stays: Stay[];
}

type MemberRow = { user_id: string; role: Role; created_at: string; profiles: { name: string } | null };
type TripRow = Trip & { trip_members: MemberRow[]; activities: Activity[]; stays: Stay[] };

function header(row: Trip, memberRows: MemberRow[], userId: string): TripHeader {
    const members: Member[] = [...memberRows]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((m) => ({ id: m.user_id, name: m.profiles?.name ?? '—', role: m.role }));
    const role = members.find((m) => m.id === userId)?.role ?? null;

    return {
        id: row.id,
        name: row.name,
        destination: row.destination,
        start_date: row.start_date,
        end_date: row.end_date,
        color: row.color,
        currency: row.currency,
        role,
        can_edit: role === 'owner' || role === 'editor',
        members,
    };
}

/** Postgres returns time as HH:MM:SS; the UI works with HH:MM. */
function normalizeActivity(a: Activity): Activity {
    return { ...a, start_time: a.start_time ? a.start_time.slice(0, 5) : null };
}

async function must<T = unknown>(promise: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
    const { data, error } = await promise;
    if (error) throw error;
    return data as T;
}

/** RLS turns forbidden updates/deletes into "0 rows": surface that as an error. */
async function mustTouch(promise: PromiseLike<{ data: unknown; error: unknown }>): Promise<void> {
    const rows = await must<unknown[] | null>(promise);
    if (!rows || rows.length === 0) throw { code: '42501', message: 'Non hai i permessi per farlo, o è già stato eliminato.' };
}

export const tripKey = (id: number) => ['trip', id] as const;

export function useTrips() {
    const user = useUser();
    return useQuery({
        queryKey: ['trips'],
        queryFn: async () => {
            const rows = await must<TripRow[]>(
                supabase
                    .from('trips')
                    .select(`${TRIP_COLUMNS}, trip_members(${MEMBER_COLUMNS}), activities(${ACTIVITY_COLUMNS}), stays(${STAY_COLUMNS})`)
                    .order('start_date'),
            );
            return rows.map((r) => ({
                trip: header(r, r.trip_members, user.id),
                activities: r.activities.map(normalizeActivity),
                stays: r.stays,
            }));
        },
    });
}

export function useTrip(id: number) {
    const user = useUser();
    return useQuery({
        queryKey: tripKey(id),
        queryFn: async (): Promise<TripData> => {
            const [row, members, activities, stays] = await Promise.all([
                must<Trip>(supabase.from('trips').select(TRIP_COLUMNS).eq('id', id).single()),
                must<MemberRow[]>(supabase.from('trip_members').select(MEMBER_COLUMNS).eq('trip_id', id)),
                must<Activity[]>(supabase.from('activities').select(ACTIVITY_COLUMNS).eq('trip_id', id).order('date').order('start_time', { nullsFirst: false }).order('id')),
                must<Stay[]>(supabase.from('stays').select(STAY_COLUMNS).eq('trip_id', id).order('check_in')),
            ]);
            return { trip: header(row, members, user.id), activities: activities.map(normalizeActivity), stays };
        },
    });
}

/** Refetches the trip whenever a travel mate changes its activities, stays or members. */
export function useTripRealtime(id: number) {
    const queryClient = useQueryClient();

    useEffect(() => {
        const refresh = () => {
            queryClient.invalidateQueries({ queryKey: tripKey(id) });
            queryClient.invalidateQueries({ queryKey: ['trips'] });
        };
        const filter = `trip_id=eq.${id}`;
        const channel = supabase
            .channel(`trip:${id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'activities', filter }, refresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'stays', filter }, refresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_members', filter }, refresh)
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [id, queryClient]);
}

// ---------------------------------------------------------------- writes

export type ActivityInput = Omit<Activity, 'id' | 'trip_id' | 'created_by'>;
export type StayInput = Omit<Stay, 'id' | 'trip_id'>;
export type TripInput = Pick<Trip, 'name' | 'destination' | 'start_date' | 'end_date' | 'color' | 'currency'>;

export const api = {
    createTrip: (t: TripInput) =>
        must<number>(
            supabase.rpc('create_trip', {
                p_name: t.name,
                p_destination: t.destination ?? '',
                p_start: t.start_date,
                p_end: t.end_date,
                p_color: t.color,
                p_currency: t.currency,
            }),
        ),
    updateTrip: (id: number, t: TripInput) => mustTouch(supabase.from('trips').update(t).eq('id', id).select('id')),
    deleteTrip: (id: number) => mustTouch(supabase.from('trips').delete().eq('id', id).select('id')),

    addActivity: (tripId: number, a: Partial<ActivityInput>) => must(supabase.from('activities').insert({ ...a, trip_id: tripId })),
    updateActivity: (id: number, a: Partial<ActivityInput>) => mustTouch(supabase.from('activities').update(a).eq('id', id).select('id')),
    deleteActivity: (id: number) => mustTouch(supabase.from('activities').delete().eq('id', id).select('id')),

    addStay: (tripId: number, s: StayInput) => must(supabase.from('stays').insert({ ...s, trip_id: tripId })),
    updateStay: (id: number, s: StayInput) => mustTouch(supabase.from('stays').update(s).eq('id', id).select('id')),
    deleteStay: (id: number) => mustTouch(supabase.from('stays').delete().eq('id', id).select('id')),

    setRole: (tripId: number, userId: string, role: Role) => mustTouch(supabase.from('trip_members').update({ role }).eq('trip_id', tripId).eq('user_id', userId).select('user_id')),
    removeMember: (tripId: number, userId: string) => mustTouch(supabase.from('trip_members').delete().eq('trip_id', tripId).eq('user_id', userId).select('user_id')),

    inviteToken: (tripId: number) => must<string>(supabase.rpc('get_invite_token', { p_trip: tripId })),
    regenerateInvite: (tripId: number) => must<string>(supabase.rpc('regenerate_invite', { p_trip: tripId })),
    joinTrip: (token: string) => must<number>(supabase.rpc('join_trip', { p_token: token })),
};
