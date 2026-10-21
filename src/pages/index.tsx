import { ErrorScreen, Splash } from '@/components/states';
import TripLayout from '@/components/trip-layout';
import { AvatarStack, Chip } from '@/components/ui';
import { useTrips } from '@/lib/api';
import { useUser } from '@/lib/auth';
import { computeInsights } from '@/lib/insights';
import { paths } from '@/lib/paths';
import { errorMessage, supabase } from '@/lib/supabase';
import { countdown, formatRange, type DayLoad, type TripHeader } from '@/lib/trip';
import { setTheme, useTheme, type ThemeChoice } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { ChevronRight, LogOut, Monitor, Moon, Plus, Sun } from 'lucide-react';
import { Link } from 'react-router';

type TripCard = TripHeader & { day_loads: DayLoad[]; empty_days: number; pending_bookings: number };

const LOAD_BAR: Record<DayLoad, string> = {
    ok: 'bg-[#6C7BFF]',
    full: 'bg-[#F08A74]',
    empty: 'bg-[#3A3B42]',
};

export default function TripsIndex() {
    const user = useUser();
    const query = useTrips();

    if (query.isPending) return <Splash />;
    if (query.isError) return <ErrorScreen message={errorMessage(query.error)} />;

    const trips: TripCard[] = query.data.map(({ trip, activities, stays }) => {
        const insights = computeInsights(trip, activities, stays);
        return {
            ...trip,
            day_loads: insights.days.map((d) => d.load),
            empty_days: insights.empty_days.length,
            pending_bookings: insights.pending_bookings.length,
        };
    });
    const upcoming = trips.filter((t) => countdown(t) !== 'concluso');
    const past = trips.filter((t) => countdown(t) === 'concluso').reverse();
    const [next, ...others] = upcoming;

    return (
        <TripLayout title="I tuoi viaggi">
            <div className="flex flex-col gap-5">
                <header className="flex items-center justify-between">
                    <div>
                        <p className="flex items-center gap-1 text-[13px] font-semibold text-mute">
                            Ciao {user.name.split(' ')[0]}
                            <ThemeButton />
                            <button onClick={() => supabase.auth.signOut()} className="-my-2 flex h-9 items-center gap-1 rounded-lg px-2 hover:bg-card">
                                <LogOut className="size-3.5" aria-hidden="true" />
                                Esci
                            </button>
                        </p>
                        <h1 className="mt-0.5 text-[30px] font-extrabold tracking-tight">I tuoi viaggi</h1>
                    </div>
                    <Link
                        to={paths.newTrip()}
                        aria-label="Nuovo viaggio"
                        className="flex size-12 items-center justify-center rounded-2xl bg-ink text-paper transition-transform active:scale-95"
                    >
                        <Plus className="size-5" aria-hidden="true" />
                    </Link>
                </header>

                {next ? <HeroTrip trip={next} /> : <EmptyState />}

                {others.length > 0 && <TripList title="Prossimi" trips={others} />}
                {past.length > 0 && <TripList title="Passati" trips={past} />}
            </div>
        </TripLayout>
    );
}

function HeroTrip({ trip }: { trip: TripCard }) {
    const planned = trip.day_loads.filter((l) => l !== 'empty').length;

    return (
        <Link to={paths.trip(trip.id)} className="block rounded-3xl bg-hero p-5 text-on-hero transition-transform active:scale-[0.99]">
            <div className="flex items-start justify-between">
                <p className="text-xs font-bold tracking-[0.08em] text-[#B9C1FF] uppercase">{countdown(trip)}</p>
                <AvatarStack members={trip.members} ring="ring-hero" />
            </div>
            <h2 className="mt-3.5 text-[34px] leading-tight font-extrabold tracking-tight">{trip.name}</h2>
            <p className="mt-0.5 text-sm text-on-hero-mute">
                {formatRange(trip.start_date, trip.end_date)}
                {trip.destination && ` · ${trip.destination}`}
            </p>

            <div className="mt-[18px] flex gap-[3px]" aria-hidden="true">
                {trip.day_loads.map((load, i) => (
                    <span key={i} className={cn('h-2 flex-1 rounded', LOAD_BAR[load])} />
                ))}
            </div>
            <div className="mt-2 flex justify-between text-xs text-on-hero-mute">
                <span>
                    {planned} di {trip.day_loads.length} giorni pianificati
                </span>
                {trip.empty_days > 0 && <span>{trip.empty_days} vuoti</span>}
            </div>

            {trip.pending_bookings > 0 && (
                <div className="mt-4">
                    <Chip className="bg-[#3B1E18] px-2.5 py-1.5 text-xs text-[#FFB4A3]">
                        {trip.pending_bookings} {trip.pending_bookings === 1 ? 'prenotazione' : 'prenotazioni'} da fare
                    </Chip>
                </div>
            )}
        </Link>
    );
}

const THEMES: { value: ThemeChoice; label: string; short: string; icon: typeof Sun }[] = [
    { value: 'system', label: 'Tema automatico', short: 'Auto', icon: Monitor },
    { value: 'light', label: 'Tema chiaro', short: 'Chiaro', icon: Sun },
    { value: 'dark', label: 'Tema scuro', short: 'Scuro', icon: Moon },
];

/** Cycles automatico → chiaro → scuro. */
function ThemeButton() {
    const theme = useTheme();
    const index = THEMES.findIndex((t) => t.value === theme);
    const { label, short, icon: Icon } = THEMES[index];
    const next = THEMES[(index + 1) % THEMES.length];

    return (
        <button
            onClick={() => setTheme(next.value)}
            aria-label={`${label}. Passa a: ${next.label.toLowerCase()}`}
            title={label}
            className="-my-2 ml-1 flex h-9 items-center gap-1 rounded-lg px-2 hover:bg-card"
        >
            <Icon className="size-3.5" aria-hidden="true" />
            {short}
        </button>
    );
}

function TripList({ title, trips }: { title: string; trips: TripCard[] }) {
    return (
        <section>
            <h2 className="mb-2.5 text-[13px] font-bold text-mute">{title}</h2>
            <ul className="flex flex-col gap-2.5">
                {trips.map((trip) => (
                    <li key={trip.id}>
                        <Link to={paths.trip(trip.id)} className="flex items-center gap-3 rounded-[18px] border border-line bg-card px-4 py-3.5 hover:bg-hover">
                            <span
                                aria-hidden="true"
                                className="flex size-10 items-center justify-center rounded-xl text-[13px] font-extrabold text-white"
                                style={{ background: trip.color }}
                            >
                                {trip.name.slice(0, 2).toUpperCase()}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[15px] font-bold">{trip.name}</span>
                                <span className="block truncate text-[13px] text-mute">
                                    {formatRange(trip.start_date, trip.end_date)} · {trip.members.length} {trip.members.length === 1 ? 'persona' : 'persone'}
                                </span>
                            </span>
                            <ChevronRight className="size-5 text-mute" aria-hidden="true" />
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}

function EmptyState() {
    return (
        <div className="rounded-3xl border border-dashed border-dash p-6 text-center">
            <h2 className="text-lg font-extrabold">Nessun viaggio in programma</h2>
            <p className="mt-1 text-sm text-mute">Crea il primo e invita i tuoi amici a pianificarlo con te.</p>
            <Link
                to={paths.newTrip()}
                className="mt-4 inline-flex h-12 items-center gap-2 rounded-2xl bg-indigo px-5 text-sm font-extrabold text-paper hover:bg-indigo-deep"
            >
                <Plus className="size-4" aria-hidden="true" />
                Nuovo viaggio
            </Link>
        </div>
    );
}
