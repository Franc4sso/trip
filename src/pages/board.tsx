import { ActivitySheet } from '@/components/activity-sheet';
import { useMoveSheet } from '@/components/move-sheet';
import { WithTrip } from '@/components/states';
import TripLayout from '@/components/trip-layout';
import { FormError, IconLink } from '@/components/ui';
import { api, tripKey, type TripData } from '@/lib/api';
import { computeInsights } from '@/lib/insights';
import { paths } from '@/lib/paths';
import { usePeersOn } from '@/lib/presence';
import { ACTIVITY_TYPES, dayOfMonth, formatMinutes, formatWeekdayShort, type Activity, type DayInsight, type TripHeader } from '@/lib/trip';
import { useAction } from '@/lib/use-action';
import { cn } from '@/lib/utils';
import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    TouchSensor,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
    type Announcements,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, GripVertical, Lightbulb, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

const IDEAS = 'ideas';

export default function BoardRoute() {
    return <WithTrip>{(data) => <Board data={data} />}</WithTrip>;
}

function Board({ data }: { data: TripData }) {
    const { trip, activities, stays } = data;
    const queryClient = useQueryClient();
    const { run, error } = useAction();
    const [dragging, setDragging] = useState<Activity | null>(null);
    const [sheet, setSheet] = useState<{ open: boolean; activity?: Activity | null; date?: string | null }>({ open: false });
    const insights = computeInsights(trip, activities, stays);
    const mover = useMoveSheet(trip, insights.days, activities);
    const label = (date: string | null) => (date ? `${formatWeekdayShort(date).toLowerCase()} ${dayOfMonth(date)}` : 'lista idee');

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
        useSensor(KeyboardSensor),
    );

    const byId = (id: unknown) => activities.find((a) => `a${a.id}` === id);
    const announcements: Announcements = {
        onDragStart: ({ active }) => `Hai preso «${byId(active.id)?.title}».`,
        onDragOver: ({ active, over }) => (over ? `«${byId(active.id)?.title}» è sopra ${label(over.id === IDEAS ? null : String(over.id))}.` : `«${byId(active.id)?.title}» non è sopra nessuna colonna.`),
        onDragEnd: ({ active, over }) => (over ? `«${byId(active.id)?.title}» spostato in ${label(over.id === IDEAS ? null : String(over.id))}.` : 'Spostamento annullato.'),
        onDragCancel: () => 'Spostamento annullato.',
    };

    const onDragStart = ({ active }: DragStartEvent) => setDragging(byId(active.id) ?? null);

    const onDragEnd = ({ active, over }: DragEndEvent) => {
        setDragging(null);
        const activity = byId(active.id);
        if (!activity || !over) return;
        const date = over.id === IDEAS ? null : String(over.id);
        if (date === activity.date) return;
        // a moved idea keeps no time; a moved activity keeps its time on the new day
        const patch = { date, start_time: date && activity.date ? activity.start_time : null };

        // move it on screen right away; the write and Realtime will confirm
        queryClient.setQueryData<TripData>(tripKey(trip.id), (old) => old && { ...old, activities: old.activities.map((a) => (a.id === activity.id ? { ...a, ...patch } : a)) });
        run(() => api.updateActivity(activity.id, patch)).then((ok) => {
            if (!ok) queryClient.invalidateQueries({ queryKey: tripKey(trip.id) });
        });
    };

    const ideas = activities.filter((a) => !a.date);

    return (
        <TripLayout title={`Board · ${trip.name}`} trip={trip} tab="days" wide>
            <div className="flex flex-wrap items-center gap-3">
                <IconLink label="Panoramica" to={paths.trip(trip.id)}>
                    <ChevronLeft className="size-5" aria-hidden="true" />
                </IconLink>
                <div className="mr-auto">
                    <h1 className="text-2xl font-extrabold tracking-tight">{trip.name}</h1>
                    <p className="text-[13px] text-mute">Trascina le attività tra i giorni e dalla lista idee. Da tastiera: spazio per prendere, frecce per spostare, spazio per lasciare.</p>
                </div>
            </div>
            <FormError message={error} />

            <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)} accessibility={{ announcements }}>
                <div className="mt-4 flex items-start gap-3 overflow-x-auto pb-4" role="list" aria-label="Giorni del viaggio">
                    <Column id={IDEAS} className="w-64 bg-hero text-on-hero" header={<IdeasHeader count={ideas.length} />}>
                        {ideas.map((a) => (
                            <Card key={a.id} activity={a} canEdit={trip.can_edit} onOpen={() => setSheet({ open: true, activity: a })} dark />
                        ))}
                        {trip.can_edit && <AddButton dark onClick={() => setSheet({ open: true, activity: null, date: null })} />}
                    </Column>

                    {insights.days.map((day) => {
                        const ofDay = activities.filter((a) => a.date === day.date).sort((a, b) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99') || a.id - b.id);
                        return (
                            <Column key={day.date} id={day.date} header={<DayHeader trip={trip} day={day} />} className={cn(day.load === 'full' && 'ring-2 ring-verm', day.load === 'empty' && 'border-[1.5px] border-dashed border-sun-line bg-transparent')}>
                                {ofDay.map((a) => (
                                    <Card key={a.id} activity={a} canEdit={trip.can_edit} onOpen={() => setSheet({ open: true, activity: a })} />
                                ))}
                                {day.gaps.map((g) => (
                                    <p key={g.from} className="rounded-lg border border-dashed border-sun-line bg-sun-soft px-2 py-1.5 text-center text-[11px] font-bold text-sun-ink">
                                        Libero {g.from}–{g.to}
                                    </p>
                                ))}
                                {trip.can_edit && <AddButton onClick={() => setSheet({ open: true, activity: null, date: day.date })} />}
                            </Column>
                        );
                    })}
                </div>
                <DragOverlay>{dragging ? <Card activity={dragging} canEdit overlay /> : null}</DragOverlay>
            </DndContext>

            <ActivitySheet
                trip={trip}
                days={insights.days.map(({ date, number }) => ({ date, number }))}
                open={sheet.open}
                activity={sheet.activity}
                draft={{ date: sheet.date ?? null }}
                stays={stays}
                onMove={mover.open}
                onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
            />
            {mover.element}
        </TripLayout>
    );
}

function Column({ id, header, className, children }: { id: string; header: React.ReactNode; className?: string; children: React.ReactNode }) {
    const { setNodeRef, isOver } = useDroppable({ id });
    return (
        <section ref={setNodeRef} role="listitem" className={cn('flex w-56 shrink-0 flex-col gap-2 rounded-2xl bg-sunken p-2.5 transition-shadow', isOver && 'ring-2 ring-indigo', className)}>
            {header}
            {children}
        </section>
    );
}

function IdeasHeader({ count }: { count: number }) {
    return (
        <div className="flex items-baseline justify-between px-1 pb-1">
            <b className="flex items-center gap-1.5 text-sm">
                <Lightbulb className="size-4" aria-hidden="true" />
                Lista idee
            </b>
            <span className="text-[11px] font-bold text-on-hero-mute">{count} da piazzare</span>
        </div>
    );
}

function DayHeader({ trip, day }: { trip: TripHeader; day: DayInsight }) {
    return (
        <Link to={paths.day(trip.id, day.date)} className="flex items-baseline justify-between rounded-lg px-1 pb-1 hover:bg-hover">
            <b className="text-sm">
                {formatWeekdayShort(day.date).slice(0, 3)} {dayOfMonth(day.date)}
                {day.city && <span className="font-semibold text-mute"> · {day.city}</span>}
            </b>
            <span className={cn('text-[11px] font-bold', day.load === 'full' ? 'text-verm-ink' : day.load === 'empty' ? 'text-sun-ink' : 'text-mute')}>
                {day.load === 'empty' ? 'vuoto' : formatMinutes(day.planned_minutes)}
            </span>
        </Link>
    );
}

function Card({ activity: a, canEdit, onOpen, dark, overlay }: { activity: Activity; canEdit: boolean; onOpen?: () => void; dark?: boolean; overlay?: boolean }) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `a${a.id}`, disabled: !canEdit || overlay });
    const editors = usePeersOn((f) => f?.kind === 'activity' && f.id === a.id);
    const meta = ACTIVITY_TYPES[a.type];

    return (
        <div
            ref={overlay ? undefined : setNodeRef}
            className={cn(
                'group flex items-stretch rounded-xl border bg-card text-ink',
                editors.length ? 'border-leaf' : dark ? 'border-transparent' : 'border-line',
                isDragging && 'opacity-30',
                overlay && 'rotate-2 shadow-xl',
            )}
        >
            {canEdit && (
                <button
                    {...listeners}
                    {...attributes}
                    aria-label={`Sposta «${a.title}»`}
                    className="flex w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-l-xl text-faint hover:bg-hover active:cursor-grabbing"
                >
                    <GripVertical className="size-4" aria-hidden="true" />
                </button>
            )}
            <button onClick={onOpen} disabled={!canEdit} className={cn('min-w-0 flex-1 py-2 pr-2.5 text-left', !canEdit && 'pl-2.5')}>
                <span className={cn('mb-1.5 block h-1 w-7 rounded', meta.bar)} aria-hidden="true" />
                <span className="block truncate text-[13px] font-bold">{a.title}</span>
                <span className="block truncate text-[11px] text-mute">
                    {[a.start_time, meta.label, a.city].filter(Boolean).join(' · ')}
                    {editors.length > 0 && <b className="text-leaf"> · {editors.join(', ')}</b>}
                </span>
            </button>
        </div>
    );
}

function AddButton({ onClick, dark }: { onClick: () => void; dark?: boolean }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'flex h-9 items-center justify-center gap-1 rounded-xl border-[1.5px] border-dashed text-xs font-bold',
                dark ? 'border-hero-2 text-on-hero-mute hover:text-on-hero' : 'border-dash text-mute hover:text-ink',
            )}
        >
            <Plus className="size-3.5" aria-hidden="true" />
            Aggiungi
        </button>
    );
}
