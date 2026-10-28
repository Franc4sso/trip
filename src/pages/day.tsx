import { WithTrip } from '@/components/states';
import { api } from '@/lib/api';
import { factsLine } from '@/lib/describe';
import { addDays, afterMidnight, computeInsights, hotelOn, isHotelBreak } from '@/lib/insights';
import { choosePatch } from '@/lib/options';
import { paths } from '@/lib/paths';
import { namesSentence, usePeersOn } from '@/lib/presence';
import { useAction } from '@/lib/use-action';
import { Navigate, useNavigate, useParams } from 'react-router';
import { OptionList, PlaceSheet, Thumb, type ShownPlace } from '@/components/activity-options';
import { ActivitySheet, type ActivityDraft } from '@/components/activity-sheet';
import { useDocumentSheets } from '@/components/documents-panel';
import { useMoveSheet } from '@/components/move-sheet';
import { TripCalendar } from '@/components/trip-calendar';
import { Chip, IconLink } from '@/components/ui';
import { useDocuments, type TripDocument } from '@/lib/documents';
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
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Lightbulb, Plus, Ticket } from 'lucide-react';
import { Fragment, useState } from 'react';

interface Props {
    trip: TripHeader;
    day: DayInsight;
    days: { date: string; number: number; load: DayLoad; city: string | null; planned_minutes: number }[];
    activities: Activity[];
    stay: Stay | null;
    stays: Stay[];
    ideas: Activity[];
    /** Every activity of the trip, to link documents to any of them. */
    allActivities: Activity[];
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
                        days={insights.days.map(({ date, number, load, city, planned_minutes }) => ({ date, number, load, city, planned_minutes }))}
                        activities={ofDay}
                        stay={stays.find((s) => s.check_in <= day.date && s.check_out > day.date) ?? null}
                        stays={stays}
                        ideas={activities.filter((a) => !a.date)}
                        allActivities={activities}
                    />
                );
            }}
        </WithTrip>
    );
}

function DayPage({ trip, day, days, activities, stay, stays, ideas, allActivities }: Props) {
    const { run, error } = useAction();
    const adding = usePeersOn((f) => f?.kind === 'new-activity' && f.date === day.date);
    const [sheet, setSheet] = useState<{ open: boolean; activity?: Activity | null; draft?: ActivityDraft }>({ open: false });
    const navigate = useNavigate();
    const [calendar, setCalendar] = useState(false);
    const index = days.findIndex((d) => d.date === day.date);
    const prev = days[index - 1];
    const next = days[index + 1];

    const timed = activities.filter((a) => a.start_time);
    const untimed = activities.filter((a) => !a.start_time);
    // suggest places around where we sleep, else around today's other activities
    const anchor = stay?.latitude != null ? stay : activities.find((a) => a.latitude != null);
    const near = anchor?.latitude != null && anchor.longitude != null ? { latitude: anchor.latitude, longitude: anchor.longitude } : null;

    const { data: documents = [] } = useDocuments(trip.id);
    const docSheets = useDocumentSheets(trip, allActivities, stays);
    // ids picked to move together; null when not selecting
    const [picked, setPicked] = useState<Set<number> | null>(null);
    const mover = useMoveSheet(trip, days, allActivities, () => setPicked(null));
    const toggle = (a: Activity) => setPicked((p) => p && new Set(p.has(a.id) ? [...p].filter((id) => id !== a.id) : [...p, a.id]));
    const selectable = trip.can_edit && activities.length > 1;
    // your own tickets first, then the group's
    const docsOf = (a: Activity) => documents.filter((d) => d.activity_id === a.id).sort((x, y) => Number(x.scope === 'group') - Number(y.scope === 'group'));

    // tonight's hotel, or last night's on check-out day
    const hotel = hotelOn(stays, day.date);
    // the night goes on past midnight: bed comes after tomorrow's first hours
    const tomorrow = addDays(day.date, 1);
    const lastOut = days.some((d) => d.date === tomorrow) ? afterMidnight(allActivities, tomorrow, trip.night_out_ends).filter((a) => !isHotelBreak(a)).pop() : undefined;

    const openNew = (draft: ActivityDraft = {}) => setSheet({ open: true, activity: null, draft: { date: day.date, ...draft } });
    const backToHotel = (startTime: string | null) => openNew({ type: 'hotel', start_time: startTime });
    const openEdit = (activity: Activity) => trip.can_edit && (picked ? toggle(activity) : setSheet({ open: true, activity }));
    const placeIdea = (idea: Activity, startTime: string | null = null) => run(() => api.updateActivity(idea.id, { date: day.date, start_time: startTime }));
    const choose = (a: Activity, index: number | null) => run(() => api.updateActivity(a.id, choosePatch(a, index)));
    // the place card of an activity (index null) or of one of its options
    const [shown, setShown] = useState<{ activity: Activity; index: number | null } | null>(null);
    const shownLive = shown && allActivities.find((a) => a.id === shown.activity.id);
    const shownPlace: ShownPlace | null = shownLive
        ? shown!.index === null
            ? { name: shownLive.title, address: shownLive.location, city: shownLive.city, info: shownLive.info }
            : (shownLive.options[shown!.index] ?? null)
        : null;

    // a gap always ends where an activity starts: draw it right before that activity
    const gapBefore = (a: Activity, i: number): Gap | undefined =>
        timed[i - 1]?.start_time === a.start_time ? undefined : day.gaps.find((g) => g.to === a.start_time);

    return (
        <TripLayout title={`Giorno ${day.number} · ${trip.name}`} trip={trip} tab="days" dayHref={paths.day(trip.id, day.date)}>
            {/* the arrows flank the date they change; "Viaggio" in the tab bar goes back */}
            <div className="flex items-center justify-between gap-2">
                {prev ? (
                    <IconLink label={`Giorno precedente: ${formatWeekday(prev.date)}`} to={paths.day(trip.id, prev.date)}>
                        <ChevronLeft className="size-5" aria-hidden="true" />
                    </IconLink>
                ) : (
                    <span className="size-11 shrink-0" />
                )}
                {/* the date opens the whole trip as a calendar, to jump without stepping day by day */}
                <button onClick={() => setCalendar(true)} aria-haspopup="dialog" className="min-w-0 rounded-[14px] px-2 py-1 text-center hover:bg-hover">
                    <span className="flex items-center justify-center gap-1.5 text-xs font-bold tracking-[0.06em] text-mute">
                        <CalendarDays className="size-3.5" aria-hidden="true" />
                        GIORNO {day.number} DI {tripLength(trip)}
                        <ChevronDown className="size-3.5" aria-hidden="true" />
                    </span>
                    <h1 className="text-lg font-extrabold">{formatWeekday(day.date)}</h1>
                </button>
                {next ? (
                    <IconLink label={`Giorno successivo: ${formatWeekday(next.date)}`} to={paths.day(trip.id, next.date)}>
                        <ChevronRight className="size-5" aria-hidden="true" />
                    </IconLink>
                ) : (
                    <span className="size-11 shrink-0" />
                )}
            </div>

            <div className="mt-3 flex flex-wrap justify-center gap-2">
                {day.city && <Chip className="bg-leaf-soft text-leaf">{day.city}</Chip>}
                <Chip className={cn('border', day.load === 'full' ? 'border-verm bg-verm-soft text-verm-ink' : 'border-line bg-card text-ink')}>
                    {day.planned_minutes > 0 ? `${formatMinutes(day.planned_minutes)} pianificate` : 'Niente in programma'}
                </Chip>
            </div>

            {error && <p role="alert" className="mt-3 rounded-xl bg-verm-soft px-3 py-2 text-center text-[13px] font-semibold text-verm-ink">{error}</p>}

            {adding.length > 0 && (
                <p role="status" className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-leaf-soft px-3 py-2 text-[13px] font-semibold text-leaf">
                    <span className="size-2 animate-pulse rounded-full bg-[#1FA463]" aria-hidden="true" />
                    {namesSentence(adding)} {adding.length === 1 ? 'sta aggiungendo' : 'stanno aggiungendo'} qualcosa a questo giorno
                </p>
            )}

            {day.load === 'full' && (
                <p className="mt-3 rounded-2xl bg-verm-soft px-4 py-2.5 text-center text-[13px] font-semibold text-verm-ink">
                    Giornata molto piena: valuta di spostare qualcosa in un giorno più leggero.
                </p>
            )}

            {selectable && (
                <div className="mt-4 flex items-center justify-end gap-1">
                    {picked && (
                        <button onClick={() => setPicked(new Set(activities.map((a) => a.id)))} className="h-9 rounded-[10px] px-3 text-xs font-bold text-mute hover:bg-hover">
                            Tutte
                        </button>
                    )}
                    <button
                        onClick={() => setPicked((p) => (p ? null : new Set()))}
                        aria-pressed={!!picked}
                        className={cn('h-9 rounded-[10px] px-3 text-xs font-bold', picked ? 'bg-ink text-paper' : 'border border-field hover:bg-hover')}
                    >
                        {picked ? 'Fine' : 'Seleziona'}
                    </button>
                </div>
            )}

            <ol className={cn('flex flex-col gap-2', selectable ? 'mt-2' : 'mt-4')} aria-label="Programma del giorno">
                {timed.map((a, i) => {
                    const gap = gapBefore(a, i);
                    return (
                        <Fragment key={a.id}>
                            {gap && (
                                <GapCard
                                    gap={gap}
                                    ideas={fitting(ideas, gap, day.city)}
                                    canEdit={trip.can_edit}
                                    onFill={() => openNew({ start_time: gap.from })}
                                    onPlace={(idea) => placeIdea(idea, gap.from)}
                                    onHotel={hotel ? () => backToHotel(gap.from) : undefined}
                                />
                            )}
                            <li className="flex gap-2.5">
                                <time className="w-11 shrink-0 pt-3 text-right text-xs font-bold text-mute">{a.start_time}</time>
                                <ActivityCard activity={a} onOpen={() => openEdit(a)} editable={trip.can_edit} picked={picked ? picked.has(a.id) : undefined} onChoose={(i) => choose(a, i)} onShow={(index) => setShown({ activity: a, index })} />
                                <TicketButton docs={docsOf(a)} onOpen={(docs) => docSheets.view(docs[0], docs)} />
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
                        <ActivityCard activity={a} onOpen={() => openEdit(a)} editable={trip.can_edit} picked={picked ? picked.has(a.id) : undefined} onChoose={(i) => choose(a, i)} onShow={(index) => setShown({ activity: a, index })} />
                        <TicketButton docs={docsOf(a)} onOpen={(docs) => docSheets.view(docs[0], docs)} />
                    </li>
                ))}

                {activities.length === 0 && (
                    <li className="rounded-[20px] border-[1.5px] border-dashed border-sun-line bg-sun-soft p-5 text-center">
                        <p className="text-sm font-extrabold text-sun-ink">Giorno ancora vuoto</p>
                        <p className="mt-1 text-[13px] text-sun-ink">Aggiungi la prima attività o pesca dalla lista idee qui sotto.</p>
                    </li>
                )}
            </ol>

            {hotel && (
                <div className="mt-3 flex items-center gap-2.5 rounded-[14px] bg-hero px-3 py-2.5 text-on-hero sm:ml-[54px]">
                    <StayIcon className="size-5 shrink-0" aria-hidden="true" />
                    <p className="min-w-0 flex-1 text-[13px]">
                        <b>{stay ? 'Notte:' : 'Check-out:'}</b> {hotel.name} · {hotel.city}
                        {stay && lastOut && (
                            <span className="block text-xs opacity-80">
                                Si rientra dopo {lastOut.title} ({lastOut.start_time}, dopo mezzanotte)
                            </span>
                        )}
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

            {/* room to scroll the last card out from under the + button */}
            {trip.can_edit && <div className="h-16" aria-hidden="true" />}

            {/* while picking, the + button gives way to what to do with the selection */}
            {picked && (
                <div className="fixed inset-x-4 bottom-[calc(max(env(safe-area-inset-bottom),0.75rem)+80px+var(--badge-space))] z-20 mx-auto flex max-w-md items-center gap-2 rounded-2xl bg-ink px-4 py-2.5 text-paper shadow-xl">
                    <p className="min-w-0 flex-1 text-[13px] font-semibold">
                        {picked.size === 0 ? 'Tocca le attività da spostare' : picked.size === 1 ? '1 selezionata' : `${picked.size} selezionate`}
                    </p>
                    <button
                        onClick={() => mover.open(activities.filter((a) => picked.has(a.id)))}
                        disabled={picked.size === 0}
                        className="h-9 shrink-0 rounded-[10px] bg-paper px-3 text-xs font-bold text-ink disabled:opacity-40"
                    >
                        Sposta
                    </button>
                </div>
            )}

            {trip.can_edit && !picked && (
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
                stays={stays}
                documentCount={sheet.activity ? docsOf(sheet.activity).length : 0}
                onAddDocument={(activityId) => docSheets.add({ activity_id: activityId })}
                onMove={mover.open}
                activities={allActivities}
                onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
            />
            <PlaceSheet
                place={shownPlace}
                type={shownLive?.type ?? 'visit'}
                open={!!shownPlace}
                onOpenChange={(open) => !open && setShown(null)}
                subtitle={shownLive && shown!.index !== null ? `Opzione per «${shownLive.title}»` : undefined}
                chosen={!!(shownPlace as { chosen?: boolean } | null)?.chosen}
                onChoose={
                    shownLive && shown!.index !== null && trip.can_edit
                        ? () => choose(shownLive, shownLive.options[shown!.index!]?.chosen ? null : shown!.index)
                        : undefined
                }
            />
            {docSheets.element}
            {mover.element}
            <TripCalendar open={calendar} onOpenChange={setCalendar} days={days} selected={day.date} subtitle={trip.name} onPick={(date) => navigate(paths.day(trip.id, date))} />
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

function ActivityCard({
    activity: a,
    onOpen,
    editable,
    picked,
    onChoose,
    onShow,
}: {
    activity: Activity;
    onOpen: () => void;
    editable: boolean;
    /** Selection state while picking activities to move; undefined when not selecting. */
    picked?: boolean;
    /** Picks one of the activity's options, or drops the choice with null. */
    onChoose: (index: number | null) => void;
    /** Opens the place card of the activity (null) or of one of its options. */
    onShow: (index: number | null) => void;
}) {
    const editors = usePeersOn((f) => f?.kind === 'activity' && f.id === a.id);
    const meta = ACTIVITY_TYPES[a.type];
    const Icon = meta.icon;
    const deadline = deadlineLabel(a.booking_deadline);
    // the photo opens the place card, the rest of the card the form: two buttons side by side
    const withThumb = !!a.info && picked === undefined;

    const card = (
        <div className="relative flex min-w-0 flex-1">
            <button
                onClick={onOpen}
                disabled={!editable}
                aria-pressed={picked}
                className={cn(
                    'flex min-w-0 flex-1 gap-2.5 rounded-2xl border bg-card px-3 py-2.5 text-left enabled:hover:bg-hover disabled:cursor-default',
                    picked ? 'border-indigo ring-2 ring-indigo-soft' : editors.length > 0 ? 'border-leaf ring-2 ring-leaf-soft' : 'border-line',
                )}
            >
                {withThumb ? (
                    <span className="size-11 shrink-0" aria-hidden="true" />
                ) : picked === undefined ? (
                    <span className={cn('flex size-[34px] shrink-0 items-center justify-center rounded-[10px]', meta.tint)} aria-hidden="true">
                        <Icon className="size-[18px]" />
                    </span>
                ) : (
                    <span className={cn('flex size-[34px] shrink-0 items-center justify-center rounded-full border-2', picked ? 'border-indigo bg-indigo text-on-indigo' : 'border-field')} aria-hidden="true">
                        {picked && <Check className="size-[18px]" />}
                    </span>
                )}
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold">{a.title}</span>
                    <span className="mt-px block text-xs text-mute">
                        {[meta.label, a.duration_minutes ? formatMinutes(a.duration_minutes) : null, a.location]
                            .filter(Boolean)
                            .join(' · ')}
                    </span>
                    {factsLine(a.info) && <span className="mt-px block truncate text-xs font-bold text-clay-ink">{factsLine(a.info)}</span>}
                    {editors.length > 0 && (
                        <span className="mt-1.5 block">
                            <Chip className="bg-leaf text-paper">{namesSentence(editors)} sta modificando</Chip>
                        </span>
                    )}
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
            {withThumb && (
                <button onClick={() => onShow(null)} aria-label={`Foto e informazioni su ${a.title}`} className="absolute top-2.5 left-3 rounded-[10px]">
                    <Thumb info={a.info} type={a.type} className="size-11" />
                </button>
            )}
        </div>
    );
    if (a.options.length === 0) return card;
    return (
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {card}
            <OptionList options={a.options} type={a.type} canChoose={editable && picked === undefined} onChoose={onChoose} onOpen={(i) => onShow(i)} />
        </div>
    );
}

/** Opens the tickets of an activity right from the day, offline too. */
function TicketButton({ docs, onOpen }: { docs: TripDocument[]; onOpen: (docs: TripDocument[]) => void }) {
    if (docs.length === 0) return null;
    return (
        <button
            onClick={() => onOpen(docs)}
            aria-label={docs.length === 1 ? `Apri ${docs[0].title}` : `Apri i ${docs.length} biglietti`}
            className="relative flex w-11 shrink-0 items-center justify-center rounded-2xl border border-line bg-card text-indigo hover:bg-hover"
        >
            <Ticket className="size-5" aria-hidden="true" />
            {docs.length > 1 && <span className="absolute top-1.5 right-1.5 text-[10px] font-extrabold">{docs.length}</span>}
        </button>
    );
}

function GapCard({
    gap,
    ideas,
    canEdit,
    onFill,
    onPlace,
    onHotel,
}: {
    gap: Gap;
    ideas: Activity[];
    canEdit: boolean;
    onFill: () => void;
    onPlace: (idea: Activity) => void;
    onHotel?: () => void;
}) {
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
                        {onHotel && (
                            <button onClick={onHotel} className="h-8 rounded-[10px] border border-sun-line px-2.5 text-xs font-bold text-sun-ink hover:bg-sun-line/20">
                                Pausa in hotel
                            </button>
                        )}
                    </div>
                )}
            </div>
        </li>
    );
}
