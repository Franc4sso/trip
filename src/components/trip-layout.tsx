import { paths } from '@/lib/paths';
import { useOnline } from '@/lib/offline';
import { type TripHeader } from '@/lib/trip';
import { cn } from '@/lib/utils';
import { CalendarDays, CloudOff, House, Map, Ticket, Users } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router';

export type TripTab = 'trip' | 'days' | 'map' | 'bookings' | 'balance' | 'group';

interface Props {
    title: string;
    trip?: TripHeader;
    tab?: TripTab;
    /** Day to open from the "Giorni" tab: today when travelling, else the first day. */
    dayHref?: string;
    /** Use the full window width (desktop board). */
    wide?: boolean;
    children: ReactNode;
}

export default function TripLayout({ title, trip, tab, dayHref, wide, children }: Props) {
    const online = useOnline();
    useEffect(() => {
        document.title = `${title} · Tabi`;
    }, [title]);

    const tabs = trip
        ? [
              { key: 'trip', label: 'Viaggio', icon: House, href: paths.trip(trip.id) },
              { key: 'days', label: 'Giorni', icon: CalendarDays, href: dayHref ?? paths.day(trip.id, firstDay(trip)) },
              { key: 'map', label: 'Mappa', icon: Map, href: paths.map(trip.id) },
              { key: 'bookings', label: 'Prenota', icon: Ticket, href: paths.bookings(trip.id) },
              { key: 'group', label: 'Gruppo', icon: Users, href: paths.group(trip.id) },
          ]
        : [];

    return (
        <div className="min-h-dvh bg-paper text-ink">
            {!online && (
                <div role="status" className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-ink px-4 py-2 pt-[max(env(safe-area-inset-top),0.5rem)] text-xs font-bold text-paper">
                    <CloudOff className="size-4" aria-hidden="true" />
                    Offline: vedi l'ultima versione salvata, le modifiche sono in pausa
                </div>
            )}
            <main className={cn('mx-auto w-full px-5 pt-[max(env(safe-area-inset-top),2.5rem)]', wide ? 'max-w-none lg:px-8' : 'max-w-md', trip ? 'pb-[calc(8rem+var(--badge-space))]' : 'pb-[calc(3rem+var(--badge-space))]')}>{children}</main>

            {trip && (
                <nav aria-label="Sezioni del viaggio" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card pb-[calc(max(env(safe-area-inset-bottom),0.75rem)+var(--badge-space))]">
                    <div className="mx-auto flex max-w-md justify-around pt-2">
                        {tabs.map(({ key, label, icon: Icon, href }) => (
                            <Link
                                key={key}
                                to={href}
                                aria-current={tab === key ? 'page' : undefined}
                                className={cn(
                                    'flex min-h-11 min-w-14 flex-col items-center justify-center gap-1 text-[11px] font-semibold',
                                    tab === key ? 'text-indigo' : 'text-mute hover:text-ink',
                                )}
                            >
                                <Icon className="size-5" strokeWidth={1.8} aria-hidden="true" />
                                {label}
                            </Link>
                        ))}
                    </div>
                </nav>
            )}
        </div>
    );
}

function firstDay(trip: TripHeader): string {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return iso >= trip.start_date && iso <= trip.end_date ? iso : trip.start_date;
}
