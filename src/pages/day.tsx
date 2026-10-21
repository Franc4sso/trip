import { WithTrip } from '@/components/states';
import { api } from '@/lib/api';
import { computeInsights } from '@/lib/insights';
import { paths } from '@/lib/paths';
import { useAction } from '@/lib/use-action';
import { Navigate, useParams } from 'react-router';
import { ActivitySheet, type ActivityDraft } from '@/components/activity-sheet';
import { Chip, IconLink } from '@/components/ui';
import TripLayout from '@/components/trip-layout';
import {
    ACTIVITY_TYPES,
    deadlineLabel,
    formatMinutes,
    formatWeekday,
    StayIcon,
    tripLength,
    type Activity,
    type DayInsight,
    type DayLoad,
    type Gap,
    type Stay,
    type TripHeader,
} from '@/lib/trip';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Lightbulb, Plus } from 'lucide-react';
import { Fragment, useState } from 'react';

interface Props {
    trip: TripHeader;
    day: DayInsight;
    days: { date: string; number: number; load: DayLoad; city: string | null }[];
    activities: Activity[];
    stay: Stay | null;
    ideas: Activity[];
}

export default function DayRoute() {
    const { date } = useParams();
    return (
        <WithTrip>
            {({ trip, activities, stays }) => {
                const insights = computeInsights(trip, activities, stays);
                const day = insights.days.find((d) => d.date === date);
                if (!day) return <Navigate to={paths.day(trip.id, trip.start_date)} replace />;
                const ofDay = activities
                    .filter((a) => a.date === day.date)
                    .sort((a, b) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99') || a.id - b.id);
                return (
                    <DayPage
                        key={day.date}
                        trip={trip}
                        day={day}
                        days={insights.days.map(({ date, number, load, city }) => ({ date, number, load, city }))}
                        activities={ofDay}
                        stay={stays.find((s) => s.check_in <= day.date && s.check_out > day.date) ?? null}
                        ideas={activities.filter((a) => !a.date)}
                    />
                );
            }}
        </WithTrip>
    );
}

function DayPage({ trip, day, days, activities, stay, ideas }: Props) {
    const { run, error } = useAction();
    const [sheet, setSheet] = useState<{ open: boolean; activity?: Activity | null; draft?: ActivityDraft }>({ open: false });
    const index = days.findIndex((d) => d.date === day.date);
    const prev = days[index - 1];
    const next = days[index + 1];

    const timed = activities.filter((a) => a.start_time);
    const untimed = activities.filter((a) => !a.start_time);
    // suggest places around where we sleep, else around today's other activities
    const anchor = stay?.latitude != null ? stay : activities.find((a) => a.latitude != null);
    const near = anchor?.latitude != null && anchor.longitude != null ? { latitude: anchor.latitude, longitude: anchor.longitude } : null;
    const costPerHead = activities.reduce((sum, a) => sum + (a.cost ?? 0), 0);

    const openNew = (draft: ActivityDraft = {}) => setSheet({ open: true, activity: null, draft: { date: day.date, ...draft } });
    const openEdit = (activity: Activity) => trip.can_edit && setSheet({ open: true, activity });
    const placeIdea = (idea: Activity, startTime: string | null = null) => run(() => api.updateActivity(idea.id, { date: day.date, start_time: startTime }));

    // a gap always ends where an activity starts: draw it right before that activity
    const gapBefore = (a: Activity, i: number): Gap | undefined =>
        timed[i - 1]?.start_time === a.start_time ? undefined : day.gaps.find((g) => g.to === a.start_time);

    return (
        <TripLayout title={`Giorno ${day.number} · ${trip.name}`} trip={trip} tab="days" dayHref={paths.day(trip.id, day.date)}>
            <div className="flex items-center justify-between">
                <IconLink label="Panoramica" to={paths.trip(trip.id)}>
                    <ChevronLeft className="size-5" aria-hidden="true" />
                </IconLink>
                <div className="text-center">
                    <p className="text-xs font-bold tracking-[0.06em] text-mute">
                        GIORNO {day.number} DI {tripLength(trip)}
                    </p>
                    <h1 className="text-lg font-extrabold">{formatWeekday(day.date)}</h1>
                </div>
                <div className="flex gap-1.5">
                    {prev ? (
                        <IconLink label="Giorno precedente" to={paths.day(trip.id, prev.date)} className="w-9">
                            <ChevronLeft className="size-4" aria-hidden="true" />
                        </IconLink>
                    ) : (
                        <span className="w-9" />
                    )}
                    {next ? (
                        <IconLink label="Giorno successivo" to={paths.day(trip.id, next.date)} className="w-9">
                            <ChevronRight className="size-4" aria-hidden="true" />
                        </IconLink>
                    ) : (
                        <span className="w-9" />
                    )}
                </div>
            </div>

            <div className="mt-3 flex flex-wrap justify-center gap-2">
                {day.city && <Chip className="bg-leaf-soft text-leaf">{day.city}</Chip>}
                <Chip className={cn('border', day.load === 'full' ? 'border-verm bg-verm-soft text-verm-ink' : 'border-line bg-card text-ink')}>
                    {day.planned_minutes > 0 ? `${formatMinutes(day.planned_minutes)} pianificate` : 'Niente in programma'}
                </Chip>
                {costPerHead > 0 && (
                    <Chip className="border border-line bg-card text-ink">
                        {costPerHead.toLocaleString('it-IT')} {trip.currency} a testa
                    </Chip>
                )}
            </div>

            {error && <p role="alert" className="mt-3 rounded-xl bg-verm-soft px-3 py-2 text-center text-[13px] font-semibold text-verm-ink">{error}</p>}

            {day.load === 'full' && (
                <p className="mt-3 rounded-2xl bg-verm-soft px-4 py-2.5 text-center text-[13px] font-semibold text-verm-ink">
                    Giornata molto piena: valuta di spostare qualcosa in un giorno più leggero.
                </p>
            )}

            <ol className="mt-4 flex flex-col gap-2" aria-label="Programma del giorno">
                {timed.map((a, i) => {
                    const gap = gapBefore(a, i);
                    return (
                        <Fragment key={a.id}>
                            {gap && <GapCard gap={gap} ideas={fitting(ideas, gap, day.city)} canEdit={trip.can_edit} onFill={() => openNew({ start_time: gap.from })} onPlace={(idea) => placeIdea(idea, gap.from)} />}
                            <li className="flex gap-2.5">
                                <time className="w-11 shrink-0 pt-3 text-right text-xs font-bold text-mute">{a.start_time}</time>
                                <ActivityCard activity={a} onOpen={() => openEdit(a)} editable={trip.can_edit} />
                            </li>
                        </Fragment>
                    );
                })}

                {untimed.length > 0 && (
                    <li className={cn('pl-[54px] text-xs font-bold text-mute', timed.length > 0 && 'mt-3')}>Senza orario</li>
                )}
                {untimed.map((a) => (
                    <li key={a.id} className="flex gap-2.5">
                        <span className="w-11 shrink-0" />
                        <ActivityCard activity={a} onOpen={() => openEdit(a)} editable={trip.can_edit} />
                    </li>
                ))}

                {activities.length === 0 && (
                    <li className="rounded-[20px] border-[1.5px] border-dashed border-sun-line bg-sun-soft p-5 text-center">
                        <p className="text-sm font-extrabold text-sun-ink">Giorno ancora vuoto</p>
                        <p className="mt-1 text-[13px] text-sun-ink">Aggiungi la prima attività o pesca dalla lista idee qui sotto.</p>
                    </li>
                )}
            </ol>

            {stay && (
                <div className="mt-3 flex items-center gap-2.5 rounded-[14px] bg-hero px-3 py-2.5 text-on-hero sm:ml-[54px]">
                    <StayIcon className="size-5 shrink-0" aria-hidden="true" />
                    <p className="text-[13px]">
                        <b>Notte:</b> {stay.name} · {stay.city}
                    </p>
                </div>
            )}

            {trip.can_edit && ideas.length > 0 && (
                <section className="mt-6">
                    <h2 className="mb-2 flex items-center gap-1.5 text-sm font-extrabold">
                        <Lightbulb className="size-4 text-sun-ink" aria-hidden="true" />
                        Dalla lista idee
                    </h2>
                    <ul className="flex flex-col gap-2">
                        {ideas.slice(0, 6).map((idea) => (
                            <li key={idea.id} className="flex items-center gap-3 rounded-2xl border border-line bg-card px-3.5 py-2.5">
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-bold">{idea.title}</span>
                                    <span className="block truncate text-xs text-mute">
                                        {ACTIVITY_TYPES[idea.type].label}
                                        {idea.city && ` · ${idea.city}`}
                                    </span>
                                </span>
                                <button onClick={() => placeIdea(idea)} className="h-9 shrink-0 rounded-[10px] border border-field px-3 text-xs font-bold hover:bg-hover">
                                    + Oggi
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {trip.can_edit && (
                <button
                    onClick={() => openNew()}
                    aria-label="Aggiungi attività"
                    className="fixed right-5 bottom-[calc(max(env(safe-area-inset-bottom),0.75rem)+80px+var(--badge-space))] z-20 flex size-[58px] items-center justify-center rounded-[20px] bg-indigo text-paper shadow-[0_10px_24px_rgba(47,67,201,0.35)] transition-transform active:scale-95 sm:right-[calc(50%-14rem+1.25rem)]"
                >
                    <Plus className="size-6" aria-hidden="true" />
                </button>
            )}

            <ActivitySheet
                trip={trip}
                days={days}
                open={sheet.open}
                activity={sheet.activity}
                draft={sheet.draft}
                near={near}
                city={day.city}
                onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
            />
        </TripLayout>
    );
}

/** Ideas that fit in the gap and are not tied to another city. Same-city ones first. */
function fitting(ideas: Activity[], gap: Gap, city: string | null): Activity[] {
    const sameCity = (a: Activity) => !!city && a.city?.toLowerCase() === city.toLowerCase();
    return ideas
        .filter((a) => (a.duration_minutes ?? 60) <= gap.minutes && (!a.city || sameCity(a)))
        .sort((a, b) => Number(sameCity(b)) - Number(sameCity(a)));
}

function ActivityCard({ activity: a, onOpen, editable }: { activity: Activity; onOpen: () => void; editable: boolean }) {
    const meta = ACTIVITY_TYPES[a.type];
    const Icon = meta.icon;
    const deadline = deadlineLabel(a.booking_deadline);

    return (
        <button
            onClick={onOpen}
            disabled={!editable}
            className="flex flex-1 gap-2.5 rounded-2xl border border-line bg-card px-3 py-2.5 text-left enabled:hover:bg-hover disabled:cursor-default"
        >
            <span className={cn('flex size-[34px] shrink-0 items-center justify-center rounded-[10px]', meta.tint)} aria-hidden="true">
                <Icon className="size-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{a.title}</span>
                <span className="mt-px block text-xs text-mute">
                    {[meta.label, a.duration_minutes ? formatMinutes(a.duration_minutes) : null, a.location, a.cost ? `${a.cost.toLocaleString('it-IT')} a testa` : null]
                        .filter(Boolean)
                        .join(' · ')}
                </span>
                {a.booking_required && (
                    <span className="mt-1.5 block">
                        {a.booked ? (
                            <Chip className="bg-leaf-soft text-leaf">Prenotato</Chip>
                        ) : (
                            <Chip className="bg-verm-soft text-verm-ink">Prenotare {deadline.text}</Chip>
                        )}
                    </span>
                )}
            </span>
        </button>
    );
}

function GapCard({ gap, ideas, canEdit, onFill, onPlace }: { gap: Gap; ideas: Activity[]; canEdit: boolean; onFill: () => void; onPlace: (idea: Activity) => void }) {
    const suggestion = ideas[0];

    return (
        <li className="flex gap-2.5">
            <time className="w-11 shrink-0 pt-3 text-right text-xs font-bold text-sun-ink">{gap.from}</time>
            <div className="flex-1 rounded-2xl border-[1.5px] border-dashed border-sun-line bg-sun-soft px-3 py-2.5">
                <div className="flex items-center justify-between">
                    <p className="text-[13px] font-extrabold text-sun-ink">Buco di {formatMinutes(gap.minutes)} libere</p>
                    <span className="text-xs font-semibold text-sun-ink">fino alle {gap.to}</span>
                </div>
                {canEdit && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {suggestion && (
                            <button onClick={() => onPlace(suggestion)} className="h-8 max-w-full truncate rounded-[10px] bg-ink px-2.5 text-xs font-bold text-paper">
                                + {suggestion.title}
                            </button>
                        )}
                        <button onClick={onFill} className="h-8 rounded-[10px] border border-sun-line px-2.5 text-xs font-bold text-sun-ink hover:bg-sun-line/20">
                            Riempi
                        </button>
                    </div>
                )}
            </div>
        </li>
    );
}
