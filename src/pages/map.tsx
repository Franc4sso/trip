import { MapView, type MapPin } from '@/components/map-view';
import { WithTrip } from '@/components/states';
import TripLayout from '@/components/trip-layout';
import { FormError } from '@/components/ui';
import { api } from '@/lib/api';
import { tripDays } from '@/lib/insights';
import { paths } from '@/lib/paths';
import type { Coordinates } from '@/lib/places';
import { googleMapsUrl, routeKm, shortestOrder } from '@/lib/route';
import { ACTIVITY_TYPES, dayOfMonth, formatWeekdayShort, type Activity, type Stay, type TripHeader } from '@/lib/trip';
import { useAction } from '@/lib/use-action';
import { cn } from '@/lib/utils';
import { ExternalLink, Navigation, Sparkles } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';

// pin fills that read on both map themes
const PIN_COLOR: Record<Activity['type'], string> = {
    visit: '#2F43C9',
    food: '#C26A12',
    transport: '#4A4B52',
    experience: '#7A4BC2',
    shopping: '#1F7A4D',
    note: '#8C6A23',
};

export default function MapRoute() {
    return <WithTrip>{({ trip, activities, stays }) => <TripMap trip={trip} activities={activities} stays={stays} />}</WithTrip>;
}

const located = (a: { latitude: number | null; longitude: number | null }): a is { latitude: number; longitude: number } => a.latitude != null && a.longitude != null;

function TripMap({ trip, activities, stays }: { trip: TripHeader; activities: Activity[]; stays: Stay[] }) {
    const [params, setParams] = useSearchParams();
    const days = tripDays(trip);
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const date = params.get('day') ?? (days.includes(today) ? today : days[0]);
    const { run, pending, error } = useAction();
    const stripRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        stripRef.current?.querySelector('[aria-current="date"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    }, [date]);

    const ofDay = activities
        .filter((a) => a.date === date && a.type !== 'note')
        .sort((a, b) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99') || a.id - b.id);
    const stops = ofDay.filter(located);
    const missing = ofDay.filter((a) => !located(a));
    const stay = stays.find((s) => s.check_in <= date && s.check_out > date) ?? stays.find((s) => s.check_out === date);
    const home: Coordinates | null = stay && located(stay) ? { latitude: stay.latitude, longitude: stay.longitude } : null;

    const pins: MapPin[] = [
        ...stops.map((a, i) => ({ id: `a${a.id}`, label: String(i + 1), color: PIN_COLOR[a.type], title: a.title, latitude: a.latitude!, longitude: a.longitude! })),
        ...(stay && home ? [{ id: `s${stay.id}`, label: null, color: '#1F7A4D', title: stay.name, ...home }] : []),
    ];
    const coords = stops.map((a) => ({ latitude: a.latitude!, longitude: a.longitude! }));

    // only sightseeing with a time can move: we swap their time slots.
    // Transfers and meals stay where they are (a dinner is not a morning visit).
    const timed = stops.filter((a) => a.start_time && (a.type === 'visit' || a.type === 'experience' || a.type === 'shopping'));
    const timedCoords = timed.map((a) => ({ latitude: a.latitude!, longitude: a.longitude! }));
    const best = shortestOrder(timedCoords, home);
    const currentKm = routeKm(timedCoords, home);
    const bestKm = routeKm(best.map((i) => timedCoords[i]), home);
    const saving = currentKm - bestKm;
    const worthIt = timed.length >= 3 && saving > 0.5 && saving / currentKm > 0.1;

    const applyBestOrder = () => {
        const slots = timed.map((a) => a.start_time!);
        if (!confirm(`Riordino le tappe per accorciare il percorso di ${saving.toFixed(1)} km. Gli orari restano gli stessi, cambia chi va in quale orario. Continuare?`)) return;
        run(() => Promise.all(best.map((stopIndex, slot) => api.updateActivity(timed[stopIndex].id, { start_time: slots[slot] }))));
    };

    const scrollToStop = (id: string) => document.getElementById(`stop-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    return (
        <TripLayout title={`Mappa · ${trip.name}`} trip={trip} tab="map" dayHref={paths.day(trip.id, date)}>
            <div ref={stripRef} className="-mx-5 flex snap-x scroll-px-5 gap-1.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none]" role="tablist" aria-label="Giorno">
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

            <div className="relative mt-3 h-[52dvh] min-h-72 overflow-hidden rounded-[22px] border border-line bg-sunken">
                <MapView pins={pins} route={home && coords.length ? [home, ...coords, home] : coords} onPinClick={(id) => scrollToStop(id)} />
                {pins.length === 0 && (
                    <div className="pointer-events-none absolute inset-x-4 top-4 rounded-2xl bg-card/95 p-3 text-center text-[13px] text-mute shadow">
                        Nessun luogo con posizione in questo giorno. Scegli i luoghi dai suggerimenti quando aggiungi un'attività.
                    </div>
                )}
            </div>

            <FormError message={error} />

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

            <ol className="mt-3 flex flex-col">
                {stops.map((a, i) => (
                    <li key={a.id} id={`stop-a${a.id}`} className="flex items-center gap-3 border-line py-2.5 not-first:border-t">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white" style={{ background: PIN_COLOR[a.type] }}>
                            {i + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold">{a.title}</span>
                            <span className="block truncate text-xs text-mute">{[ACTIVITY_TYPES[a.type].label, a.location].filter(Boolean).join(' · ')}</span>
                        </span>
                        <span className="text-xs font-semibold text-mute">{a.start_time ?? '—'}</span>
                    </li>
                ))}
                {stay && (
                    <li id={`stop-s${stay.id}`} className="flex items-center gap-3 border-t border-line py-2.5">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-leaf text-paper" aria-hidden="true">
                            <Navigation className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1 text-sm">
                            <b>Notte:</b> {stay.name}
                            {!home && <span className="block text-xs text-mute">Senza posizione: cercalo nei suggerimenti per vederlo sulla mappa</span>}
                        </span>
                    </li>
                )}
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

            {coords.length > 0 && (
                <a
                    href={googleMapsUrl(coords, home)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-4 flex h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-card text-sm font-bold hover:bg-hover"
                >
                    Percorso in Google Maps
                    <ExternalLink className="size-4" aria-hidden="true" />
                </a>
            )}

        </TripLayout>
    );
}
