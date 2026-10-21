import { paths } from '@/lib/paths';
import { type TripHeader } from '@/lib/trip';
import { cn } from '@/lib/utils';
import { CalendarDays, ChartColumnStacked, House, Ticket, Users } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router';

export type TripTab = 'trip' | 'days' | 'bookings' | 'balance' | 'group';

interface Props {
    title: string;
    trip?: TripHeader;
    tab?: TripTab;
    /** Day to open from the "Giorni" tab: today when travelling, else the first day. */
    dayHref?: string;
    children: ReactNode;
}

export default function TripLayout({ title, trip, tab, dayHref, children }: Props) {
    useEffect(() => {
        document.title = `${title} · Tabi`;
    }, [title]);

    const tabs = trip
        ? [
              { key: 'trip', label: 'Viaggio', icon: House, href: paths.trip(trip.id) },
              { key: 'days', label: 'Giorni', icon: CalendarDays, href: dayHref ?? paths.day(trip.id, firstDay(trip)) },
              { key: 'bookings', label: 'Prenota', icon: Ticket, href: paths.bookings(trip.id) },
              { key: 'balance', label: 'Bilancio', icon: ChartColumnStacked, href: paths.balance(trip.id) },
              { key: 'group', label: 'Gruppo', icon: Users, href: paths.group(trip.id) },
          ]
        : [];

    return (
        <div className="min-h-dvh bg-paper text-ink">
            <main className={cn('mx-auto w-full max-w-md px-5 pt-[max(env(safe-area-inset-top),2.5rem)]', trip ? 'pb-[calc(8rem+var(--badge-space))]' : 'pb-[calc(3rem+var(--badge-space))]')}>{children}</main>

            {trip && (
                <nav aria-label="Sezioni del viaggio" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-[calc(max(env(safe-area-inset-bottom),0.75rem)+var(--badge-space))]">
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
