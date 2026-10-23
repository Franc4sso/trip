import { useConfirm } from '@/components/confirm-dialog';
import { MapView, type MapPin } from '@/components/map-view';
import { Navigator, type NavTarget } from '@/components/navigator';
import { meters } from '@/lib/navigation';
import { WithTrip } from '@/components/states';
import { TripCalendar } from '@/components/trip-calendar';
import TripLayout from '@/components/trip-layout';
import { FormError } from '@/components/ui';
import { api } from '@/lib/api';
import { computeInsights, dayStays, startMinute } from '@/lib/insights';
import { paths } from '@/lib/paths';
import type { Coordinates } from '@/lib/places';
import { formatKm, routeKm, shortestOrder, transitHint, withinWalk, type Leg } from '@/lib/route';
import { ACTIVITY_TYPES, dayOfMonth, formatMinutes, formatWeekdayShort, type Activity, type Stay, type TripHeader } from '@/lib/trip';
import { useAction } from '@/lib/use-action';
import { cn } from '@/lib/utils';
import { useWalk } from '@/lib/walking';
import { CalendarDays, Footprints, Navigation, Navigation2, Sparkles, TrainFront } from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

// pin fills that read on both map themes
const PIN_COLOR: Record<Activity['type'], string> = {
    visit: '#2F43C9',
    food: '#C26A12',
    transport: '#4A4B52',
    experience: '#7A4BC2',
    shopping: '#1F7A4D',
    hotel: '#16171B',
    note: '#8C6A23',
};

export default function MapRoute() {
    return <WithTrip>{({ trip, activities, stays }) => <TripMap trip={trip} activities={activities} stays={stays} />}</WithTrip>;
}

const located = (a: { latitude: number | null; longitude: number | null }): a is { latitude: number; longitude: number } => a.latitude != null && a.longitude != null;
const walkTime = (minutes: number) => formatMinutes(Math.max(1, Math.round(minutes)));

function TripMap({ trip, activities, stays }: { trip: TripHeader; activities: Activity[]; stays: Stay[] }) {
    const [params, setParams] = useSearchParams();
    const insights = computeInsights(trip, activities, stays);
    const days = insights.days.map((d) => d.date);
    const [calendar, setCalendar] = useState(false);
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const date = params.get('day') ?? (days.includes(today) ? today : days[0]);
    const { run, pending, error } = useAction();
    const confirm = useConfirm();
    const stripRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        stripRef.current?.querySelector('[aria-current="date"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    }, [date]);

    const ofDay = activities
        .filter((a) => a.date === date && a.type !== 'note')
        .sort((a, b) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99') || a.id - b.id);
    const stops = ofDay.filter(located);
    const missing = ofDay.filter((a) => !located(a));
    const coords = stops.map((a) => ({ latitude: a.latitude!, longitude: a.longitude! }));

    // The walk starts where we slept and ends where we sleep tonight. On a travel day the
    // other stay is in another city (the train covers that), so it's left out of the walk.
    const { morning, night } = dayStays(stays, date);
    const placeOf = (s: Stay | undefined): Coordinates | null => (s && located(s) ? { latitude: s.latitude, longitude: s.longitude } : null);
    const reach = (s: Stay | undefined, stop: Coordinates | undefined) => {
        const at = placeOf(s);
        return at && stop && withinWalk(at, stop) ? at : null;
    };
    const start = reach(morning, coords[0]);
    const end = reach(night, coords[coords.length - 1]);
    const sameStay = !!morning && morning.id === night?.id;
    // a round trip from the same stay: the shortest-order suggestion can use it as home
    const home = sameStay ? start : null;
    const startStay = start && !sameStay ? morning : undefined;

    const pins: MapPin[] = [
        ...stops.map((a, i) => ({ id: `a${a.id}`, label: String(i + 1), color: PIN_COLOR[a.type], title: a.title, latitude: a.latitude!, longitude: a.longitude! })),
        ...[startStay, night].flatMap((s) => {
            const at = placeOf(s);
            return s && at ? [{ id: `s${s.id}`, label: null, color: '#1F7A4D', title: s.name, ...at }] : [];
        }),
    ];
    // the day on foot along real streets
    const walk = useWalk(coords.length ? [...(start ? [start] : []), ...coords, ...(end ? [end] : [])] : []);
    const legBefore = (i: number): Leg | undefined => (start ? walk.legs[i] : walk.legs[i - 1]);
    const legHome = end ? walk.legs[(start ? 1 : 0) + coords.length - 1] : undefined;
    const totalKm = walk.legs.reduce((sum, l) => sum + l.km, 0);
    const totalMinutes = walk.legs.reduce((sum, l) => sum + l.minutes, 0);
    const transitLegs = walk.legs.filter((l) => transitHint(l)).length;

    // only sightseeing with a time can move: we swap their time slots.
    // Transfers and meals stay where they are (a dinner is not a morning visit).
    const timed = stops.filter((a) => a.start_time && (a.type === 'visit' || a.type === 'experience' || a.type === 'shopping'));
    const timedCoords = timed.map((a) => ({ latitude: a.latitude!, longitude: a.longitude! }));
    const best = shortestOrder(timedCoords, home);
    const currentKm = routeKm(timedCoords, home);
    const bestKm = routeKm(best.map((i) => timedCoords[i]), home);
    const saving = currentKm - bestKm;
    const worthIt = timed.length >= 3 && saving > 0.5 && saving / currentKm > 0.1;

    const applyBestOrder = async () => {
        const slots = timed.map((a) => a.start_time!);
        const ok = await confirm({
            title: 'Riordinare le tappe?',
            description: `Il percorso si accorcia di circa ${formatKm(saving)}. Gli orari restano gli stessi, cambia quale tappa va in quale orario.`,
            confirmLabel: 'Riordina',
            tone: 'default',
        });
        if (!ok) return;
        run(() => Promise.all(best.map((stopIndex, slot) => api.updateActivity(timed[stopIndex].id, { start_time: slots[slot] }))));
    };

    // turn-by-turn on foot: the day's stops in order, then tonight's bed
    const [nav, setNav] = useState<number | null>(null);
    const targets: NavTarget[] = [
        ...stops.map((a, i) => ({ id: `a${a.id}`, title: a.title, label: String(i + 1), color: PIN_COLOR[a.type], start_time: a.start_time, latitude: a.latitude!, longitude: a.longitude! })),
        // unless the last stop already is the way back to it
        ...(night && located(night) && !(coords.length && meters(coords[coords.length - 1], night) < 50) ? [{ id: `s${night.id}`, title: night.name, label: null, color: '#1F7A4D', start_time: null, latitude: night.latitude, longitude: night.longitude }] : []),
    ];
    // today, the first stop not over yet (or the bed when they all are); any other day, the first one
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const notOver = stops.findIndex((a) => !a.start_time || startMinute(a)! + (a.duration_minutes ?? 60) > nowMinutes);
    const upcoming = date !== today ? 0 : notOver === -1 ? targets.length - 1 : notOver;

    const scrollToStop = (id: string) => document.getElementById(`stop-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    return (
        <TripLayout title={`Mappa · ${trip.name}`} trip={trip} tab="map" dayHref={paths.day(trip.id, date)}>
            <div className="-mx-5 flex items-start gap-1.5 pl-5">
                <button
                    onClick={() => setCalendar(true)}
                    aria-label="Apri il calendario del viaggio"
                    aria-haspopup="dialog"
                    className="flex h-14 w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[14px] border border-indigo bg-indigo-soft text-[10px] font-bold text-indigo"
                >
                    <CalendarDays className="size-5" aria-hidden="true" />
                    Tutti
                </button>
                <div ref={stripRef} className="flex min-w-0 flex-1 snap-x scroll-px-2 gap-1.5 overflow-x-auto pr-5 pb-1 [scrollbar-width:none]" role="tablist" aria-label="Giorno">
                    {days.map((d, i) => {
                        const count = activities.filter((a) => a.date === d && located(a)).length;
                        return (
                            <button
                                key={d}
                                role="tab"
                                aria-selected={d === date}
                                aria-current={d === date ? 'date' : undefined}
                                onClick={() => setParams({ day: d }, { replace: true })}
                                className={cn(
                                    'relative flex h-14 w-12 shrink-0 snap-start flex-col items-center justify-center rounded-[14px] border text-[11px] font-semibold',
                                    d === date ? 'border-ink bg-ink text-paper' : 'border-line bg-card text-mute',
                                )}
                            >
                                {formatWeekdayShort(d)}
                                <b className={cn('text-base', d === date ? 'text-paper' : 'text-ink')}>{dayOfMonth(d)}</b>
                                <span className="sr-only">
                                    Giorno {i + 1}, {count} luoghi
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
            <TripCalendar open={calendar} onOpenChange={setCalendar} days={insights.days} selected={date} subtitle={trip.name} onPick={(d) => setParams({ day: d }, { replace: true })} />

            <div className="relative mt-3 h-[52dvh] min-h-72 overflow-hidden rounded-[22px] border border-line bg-sunken">
                <MapView pins={pins} route={walk.line} approximate={walk.approximate} onPinClick={(id) => scrollToStop(id)} />
                {pins.length === 0 && (
                    <div className="pointer-events-none absolute inset-x-4 top-4 rounded-2xl bg-card/95 p-3 text-center text-[13px] text-mute shadow">
                        Nessun luogo con posizione in questo giorno. Scegli i luoghi dai suggerimenti quando aggiungi un'attività.
                    </div>
                )}
            </div>

            <FormError message={error} />

            {targets.length > 0 && (
                <button
                    onClick={() => setNav(upcoming)}
                    className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-indigo px-4 py-3 text-left text-on-indigo shadow-[0_10px_24px_rgba(47,67,201,0.3)] transition-transform active:scale-[0.99]"
                >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-on-indigo/15">
                        <Navigation2 className="size-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-extrabold">Portami {date === today ? 'alla prossima tappa' : 'alla prima tappa'}</span>
                        <span className="block truncate text-xs opacity-80">
                            {targets[upcoming].label}. {targets[upcoming].title} · a piedi, con il GPS
                        </span>
                    </span>
                </button>
            )}

            {worthIt && trip.can_edit && (
                <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-indigo-soft px-3 py-2.5">
                    <Sparkles className="size-5 shrink-0 text-indigo" aria-hidden="true" />
                    <p className="flex-1 text-[13px] text-indigo-deep">
                        <b>Ordine più corto:</b> {best.map((i) => stops.indexOf(timed[i]) + 1).join(' → ')}, risparmiate {saving.toFixed(1)} km a piedi
                    </p>
                    <button onClick={applyBestOrder} disabled={pending} className="h-9 shrink-0 rounded-[10px] bg-indigo px-3 text-xs font-extrabold text-paper disabled:opacity-60">
                        Applica
                    </button>
                </div>
            )}

            {walk.legs.length > 0 && (
                <div className="mt-3 flex items-center gap-3 rounded-2xl border border-line bg-card px-3.5 py-3">
                    <Footprints className="size-5 shrink-0 text-indigo" aria-hidden="true" />
                    <p className="min-w-0 flex-1 text-[13px] text-mute" aria-live="polite">
                        <b className="block text-[15px] text-ink">
                            {walk.approximate && 'Circa '}
                            {formatKm(totalKm)} · {walkTime(totalMinutes)} a piedi
                        </b>
                        {walk.loading
                            ? 'Calcolo il percorso lungo le strade…'
                            : walk.approximate
                              ? "Stima in linea d'aria: il percorso lungo le strade torna con la connessione."
                              : transitLegs > 0
                                ? `${transitLegs === 1 ? 'In un tratto' : `In ${transitLegs} tratti`} conviene prendere i mezzi.`
                                : home
                                  ? "Dall'alloggio, tutte le tappe e ritorno."
                                  : start || end
                                    ? 'Dagli alloggi, tutte le tappe in ordine.'
                                    : 'Tutte le tappe, in ordine.'}
                    </p>
                </div>
            )}

            <ol className="mt-3 flex flex-col">
                {startStay && <StayRow stay={startStay} label="Partenza" />}
                {stops.map((a, i) => (
                    <Fragment key={a.id}>
                        {legBefore(i) && <LegRow leg={legBefore(i)!} from={i === 0 ? "Dall'alloggio" : undefined} />}
                        <li id={`stop-a${a.id}`} className="flex items-center gap-3 py-2.5">
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white" style={{ background: PIN_COLOR[a.type] }}>
                                {i + 1}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-bold">{a.title}</span>
                                <span className="block truncate text-xs text-mute">{[ACTIVITY_TYPES[a.type].label, a.location].filter(Boolean).join(' · ')}</span>
                            </span>
                            <span className="text-xs font-semibold text-mute">{a.start_time ?? '—'}</span>
                            <button
                                onClick={() => setNav(i)}
                                aria-label={`Portami a ${a.title}`}
                                className="flex h-9 shrink-0 items-center gap-1 rounded-[10px] border border-field px-2.5 text-xs font-bold text-indigo hover:bg-hover"
                            >
                                <Navigation2 className="size-3.5" aria-hidden="true" />
                                Vai
                            </button>
                        </li>
                    </Fragment>
                ))}
                {legHome && <LegRow leg={legHome} from={sameStay ? 'Ritorno' : "All'alloggio"} />}
                {night && <StayRow stay={night} label="Notte" divided={!legHome && stops.length > 0} onGo={located(night) ? () => setNav(targets.length - 1) : undefined} />}
            </ol>

            {missing.length > 0 && (
                <p className="mt-2 text-xs text-mute">
                    Senza posizione: {missing.map((a) => a.title).join(', ')}.{' '}
                    <Link to={paths.day(trip.id, date)} className="font-bold text-indigo hover:underline">
                        Modificale dal giorno
                    </Link>{' '}
                    scegliendo il luogo dai suggerimenti.
                </p>
            )}

            {nav !== null && targets[nav] && <Navigator targets={targets} start={nav} date={date} onClose={() => setNav(null)} />}
        </TripLayout>
    );
}

function StayRow({ stay, label, divided = false, onGo }: { stay: Stay; label: string; divided?: boolean; onGo?: () => void }) {
    return (
        <li id={`stop-s${stay.id}`} className={cn('flex items-center gap-3 py-2.5', divided && 'border-t border-line')}>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-leaf text-paper" aria-hidden="true">
                <Navigation className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1 text-sm">
                <b>{label}:</b> {stay.name}
                {!located(stay) && <span className="block text-xs text-mute">Senza posizione: cercalo nei suggerimenti per vederlo sulla mappa</span>}
            </span>
            {onGo && (
                <button onClick={onGo} aria-label={`Portami a ${stay.name}`} className="flex h-9 shrink-0 items-center gap-1 rounded-[10px] border border-field px-2.5 text-xs font-bold text-indigo hover:bg-hover">
                    <Navigation2 className="size-3.5" aria-hidden="true" />
                    Vai
                </button>
            )}
        </li>
    );
}

/** The stretch between two stops: time on foot and, when it's long, whether transit pays off. */
function LegRow({ leg, from }: { leg: Leg; from?: string }) {
    const transit = transitHint(leg);
    const about = leg.approximate ? 'circa ' : '';
    const spoken = `${from ? `${from}: ` : ''}${about}${formatKm(leg.km)}, ${walkTime(leg.minutes)} a piedi${transit ? `; con i mezzi circa ${walkTime(transit.minutes)}` : ''}`;
    return (
        <li className="flex items-stretch gap-3">
            <span className="flex w-7 shrink-0 justify-center" aria-hidden="true">
                <span className="border-l-2 border-dotted border-dash" />
            </span>
            <span className="sr-only">{spoken}</span>
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-xs text-mute" aria-hidden="true">
                {from && <span className="font-semibold">{from}</span>}
                <span className="inline-flex items-center gap-1 font-semibold">
                    <Footprints className="size-3.5" />
                    {about}
                    {formatKm(leg.km)} · {walkTime(leg.minutes)}
                </span>
                {transit && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-soft px-2 py-0.5 font-bold text-indigo-deep">
                        <TrainFront className="size-3.5" />
                        Meglio i mezzi · ~{walkTime(transit.minutes)}
                    </span>
                )}
            </span>
        </li>
    );
}
