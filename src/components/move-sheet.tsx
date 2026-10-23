import { BottomSheet } from '@/components/bottom-sheet';
import { api, tripKey, type TripData } from '@/lib/api';
import { addDays, clashesOn } from '@/lib/insights';
import { paths } from '@/lib/paths';
import { formatDayMonth, formatMinutes, formatWeekdayShort, type Activity, type DayInsight, type TripHeader } from '@/lib/trip';
import { useAction } from '@/lib/use-action';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Lightbulb } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

type Day = Pick<DayInsight, 'date' | 'number' | 'load' | 'city' | 'planned_minutes'>;
type Slot = Pick<Activity, 'date' | 'start_time'>;
type Move = { moved: { activity: Activity; from: Slot }[]; to: string | null };

const label = (date: string | null) => (date ? `${formatWeekdayShort(date).toLowerCase()} ${formatDayMonth(date)}` : 'lista idee');
const what = (list: Activity[]) => (list.length === 1 ? `«${list[0].title}»` : `${list.length} attività`);

/**
 * Moves one or more activities to another day in one tap, keeping their times, and offers to undo it.
 * Render `element` once on the page and call `open(activities)`.
 */
export function useMoveSheet(trip: TripHeader, days: Day[], activities: Activity[], onMoved?: () => void) {
    const queryClient = useQueryClient();
    const { run, error } = useAction();
    const [moving, setMoving] = useState<Activity[]>([]);
    const [open, setOpen] = useState(false);
    const [done, setDone] = useState<Move | null>(null);
    const timer = useRef<number>(undefined);

    useEffect(() => () => window.clearTimeout(timer.current), []);

    async function write(patches: { id: number; patch: Slot }[]) {
        const byId = new Map(patches.map((p) => [p.id, p.patch]));
        // move them on screen right away; the writes and Realtime will confirm
        queryClient.setQueryData<TripData>(tripKey(trip.id), (old) => old && { ...old, activities: old.activities.map((a) => ({ ...a, ...byId.get(a.id) })) });
        const ok = await run(() => Promise.all(patches.map((p) => api.updateActivity(p.id, p.patch))));
        if (!ok) queryClient.invalidateQueries({ queryKey: tripKey(trip.id) });
        return ok;
    }

    async function moveTo(date: string | null) {
        const moved = moving.map((activity) => ({ activity, from: { date: activity.date, start_time: activity.start_time } }));
        setOpen(false);
        // a timed activity keeps its time on the new day; an idea has none
        if (!(await write(moving.map((a) => ({ id: a.id, patch: { date, start_time: date ? a.start_time : null } }))))) return;
        setDone({ moved, to: date });
        onMoved?.();
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setDone(null), 8000);
    }

    async function undo() {
        if (!done) return;
        window.clearTimeout(timer.current);
        setDone(null);
        await write(done.moved.map((m) => ({ id: m.activity.id, patch: m.from })));
    }

    const keepTimes = moving.length > 0 && moving.every((a) => a.start_time) ? (moving.length === 1 ? ` · resta alle ${moving[0].start_time}` : ' · mantengono gli orari') : '';

    const element = (
        <>
            <BottomSheet open={open} onOpenChange={setOpen} title="Sposta in un altro giorno" subtitle={moving.length ? `${what(moving)}${keepTimes}` : undefined}>
                {moving.length > 0 && <DayList days={days} activities={activities} moving={moving} onPick={moveTo} />}
            </BottomSheet>
            {(done || error) && (
                <div
                    role="status"
                    className="fixed inset-x-4 bottom-[calc(max(env(safe-area-inset-bottom),0.75rem)+80px+var(--badge-space))] z-40 mx-auto flex max-w-md items-center gap-2 rounded-2xl bg-ink px-4 py-3 text-paper shadow-xl"
                >
                    <p className="min-w-0 flex-1 text-[13px] font-semibold">
                        {error ?? (done && `${what(done.moved.map((m) => m.activity))} ${done.moved.length === 1 ? 'ora è' : 'ora sono'} in ${label(done.to)}`)}
                    </p>
                    {done && !error && (
                        <>
                            <button onClick={undo} className="h-9 shrink-0 rounded-[10px] px-2.5 text-xs font-bold text-sun-soft underline-offset-2 hover:underline">
                                Annulla
                            </button>
                            {done.to && (
                                <Link to={paths.day(trip.id, done.to)} onClick={() => setDone(null)} className="flex h-9 shrink-0 items-center rounded-[10px] bg-paper px-3 text-xs font-bold text-ink">
                                    Vai
                                </Link>
                            )}
                        </>
                    )}
                </div>
            )}
        </>
    );

    return {
        element,
        open: (list: Activity | Activity[]) => {
            setMoving(Array.isArray(list) ? list : [list]);
            setOpen(true);
        },
    };
}

function DayList({ days, activities, moving, onPick }: { days: Day[]; activities: Activity[]; moving: Activity[]; onPick: (date: string | null) => void }) {
    // the day they all come from, if they share one
    const source = moving.every((a) => a.date === moving[0].date) ? moving[0].date : null;
    const near = (date: string) => (!source ? null : date === addDays(source, 1) ? 'Domani' : date === addDays(source, -1) ? 'Ieri' : null);
    const ids = new Set(moving.map((a) => a.id));
    // what stays put on that day and would overlap one of the moved ones
    const clashes = (date: string) => [...new Set(moving.flatMap((m) => clashesOn(activities, m, date).filter((c) => !ids.has(c.id))))];

    return (
        <ul className="flex flex-col gap-1.5" aria-label="Giorni del viaggio">
            {days.map((d) => {
                const here = d.date === source;
                const clash = here ? [] : clashes(d.date);
                const relative = near(d.date);
                return (
                    <li key={d.date}>
                        <button
                            onClick={() => onPick(d.date)}
                            disabled={here}
                            className={cn(
                                'flex min-h-14 w-full items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left',
                                here ? 'border-ink bg-sunken' : 'border-line bg-card hover:bg-hover active:scale-[0.99]',
                            )}
                        >
                            <span className="flex w-10 shrink-0 flex-col items-center leading-tight">
                                <span className="text-[10px] font-bold tracking-[0.06em] text-mute">{formatWeekdayShort(d.date).slice(0, 3)}</span>
                                <span className="text-lg font-extrabold">{formatDayMonth(d.date).split(' ')[0]}</span>
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-bold">
                                    Giorno {d.number}
                                    {d.city && <span className="font-semibold text-mute"> · {d.city}</span>}
                                </span>
                                <span className="mt-px block truncate text-xs">
                                    {clash.length > 0 ? (
                                        <span className="font-semibold text-verm-ink">Si sovrappone a {clash.map((c) => `${c.title} (${c.start_time})`).join(', ')}</span>
                                    ) : (
                                        <span className={cn(d.load === 'full' ? 'font-semibold text-verm-ink' : d.load === 'empty' ? 'text-sun-ink' : 'text-mute')}>
                                            {d.load === 'empty' ? 'Libero' : `${formatMinutes(d.planned_minutes)} pianificate${d.load === 'full' ? ' · molto pieno' : ''}`}
                                        </span>
                                    )}
                                </span>
                            </span>
                            {here ? (
                                <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-mute">
                                    <Check className="size-4" aria-hidden="true" />
                                    Ora qui
                                </span>
                            ) : (
                                relative && <span className="shrink-0 rounded-full bg-indigo-soft px-2 py-0.5 text-[11px] font-bold text-indigo">{relative}</span>
                            )}
                        </button>
                    </li>
                );
            })}
            {moving.some((a) => a.date) && (
                <li className="mt-2">
                    <button onClick={() => onPick(null)} className="flex min-h-12 w-full items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-sun-line bg-sun-soft px-3.5 text-left text-sm font-bold text-sun-ink">
                        <Lightbulb className="size-4 shrink-0" aria-hidden="true" />
                        Rimetti nella lista idee
                    </button>
                </li>
            )}
        </ul>
    );
}
