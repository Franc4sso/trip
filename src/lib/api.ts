import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useUser } from './auth';
import { openChannel } from './channels';
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

export interface TripEvent {
    id: number;
    actor: string | null;
    action: 'added' | 'updated' | 'deleted' | 'booked' | 'joined' | 'left' | 'role';
    entity: 'activity' | 'stay' | 'member';
    label: string;
    created_at: string;
}

export function useTripEvents(tripId: number) {
    return useQuery({
        queryKey: ['events', tripId],
        queryFn: () =>
            must<TripEvent[]>(
                supabase.from('trip_events').select('id, actor, action, entity, label, created_at').eq('trip_id', tripId).order('id', { ascending: false }).limit(30),
            ),
    });
}

export interface Poll {
    id: number;
    question: string;
    closed: boolean;
    created_by: string | null;
    created_at: string;
    poll_options: { id: number; label: string; activity_id: number | null; position: number }[];
    poll_votes: { option_id: number; user_id: string }[];
}

export function usePolls(tripId: number) {
    return useQuery({
        queryKey: ['polls', tripId],
        queryFn: async () => {
            const polls = await must<Poll[]>(
                supabase
                    .from('polls')
                    .select('id, question, closed, created_by, created_at, poll_options(id, label, activity_id, position), poll_votes(option_id, user_id)')
                    .eq('trip_id', tripId)
                    .order('created_at', { ascending: false }),
            );
            return polls.map((p) => ({ ...p, poll_options: [...p.poll_options].sort((a, b) => a.position - b.position || a.id - b.id) }));
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
        return openChannel(`trip:${id}`, (channel) =>
            channel
                .on('postgres_changes', { event: '*', schema: 'public', table: 'activities', filter }, refresh)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'stays', filter }, refresh)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_members', filter }, refresh)
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trip_events', filter }, () =>
                    queryClient.invalidateQueries({ queryKey: ['events', id] }),
                )
                .on('postgres_changes', { event: '*', schema: 'public', table: 'polls', filter }, () => queryClient.invalidateQueries({ queryKey: ['polls', id] }))
                // votes have no trip_id: RLS limits them to trips we are in, refetch ours
                .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, () => queryClient.invalidateQueries({ queryKey: ['polls', id] })),
        );
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

    createPoll: async (tripId: number, question: string, options: { label: string; activity_id: number | null }[]) => {
        const poll = await must<{ id: number }>(supabase.from('polls').insert({ trip_id: tripId, question }).select('id').single());
        const { error } = await supabase.from('poll_options').insert(options.map((o, position) => ({ ...o, poll_id: poll.id, position })));
        if (error) {
            await supabase.from('polls').delete().eq('id', poll.id); // no half-made polls
            throw error;
        }
    },
    // no upsert: it would also rewrite poll_id, and only option_id may change
    vote: (pollId: number, optionId: number, userId: string, changing: boolean) =>
        changing
            ? mustTouch(supabase.from('poll_votes').update({ option_id: optionId }).eq('poll_id', pollId).eq('user_id', userId).select('poll_id'))
            : must(supabase.from('poll_votes').insert({ poll_id: pollId, option_id: optionId })),
    unvote: (pollId: number, userId: string) => must(supabase.from('poll_votes').delete().eq('poll_id', pollId).eq('user_id', userId)),
    closePoll: (pollId: number) => mustTouch(supabase.from('polls').update({ closed: true }).eq('id', pollId).select('id')),
    deletePoll: (pollId: number) => mustTouch(supabase.from('polls').delete().eq('id', pollId).select('id')),
};
