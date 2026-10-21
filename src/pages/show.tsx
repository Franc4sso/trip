import { WithTrip } from '@/components/states';
import { computeInsights, nightsOf } from '@/lib/insights';
import { paths } from '@/lib/paths';
import { StaySheet } from '@/components/stay-sheet';
import { AvatarStack, Card, Chip, IconLink, SectionTitle } from '@/components/ui';
import TripLayout from '@/components/trip-layout';
import {
    ACTIVITY_TYPES,
    countdown,
    dayOfMonth,
    deadlineLabel,
    formatDayMonth,
    formatRange,
    formatWeekdayShort,
    tripLength,
    type ActivityType,
    type DayInsight,
    type Insights,
    type Stay,
    type TripHeader,
} from '@/lib/trip';
import { cn } from '@/lib/utils';
import { Link } from 'react-router';
import { BedDouble, CalendarX2, ChevronLeft, Clock3, Pencil, Ticket, UserPlus } from 'lucide-react';
import { useState } from 'react';

export default function TripShowRoute() {
    return <WithTrip>{({ trip, activities, stays }) => <TripShow trip={trip} insights={computeInsights(trip, activities, stays)} stays={stays} />}</WithTrip>;
}

interface Props {
    trip: TripHeader;
    insights: Insights;
    stays: Stay[];
}

function TripShow({ trip, insights, stays }: Props) {
    const [staySheet, setStaySheet] = useState<{ open: boolean; stay?: Stay | null; checkIn?: string }>({ open: false });
    const gapCount = insights.days.reduce((n, d) => n + d.gaps.length, 0);
    const firstPending = insights.pending_bookings[0];

    return (
        <TripLayout title={trip.name} trip={trip} tab="trip">
            <div className="flex flex-col gap-[18px]">
                <div className="flex items-center justify-between">
                    <IconLink label="Tutti i viaggi" to={paths.trips()}>
                        <ChevronLeft className="size-5" aria-hidden="true" />
                    </IconLink>
                    <div className="flex items-center gap-2.5">
                        <AvatarStack members={trip.members} />
                        <IconLink label="Invita amici" to={paths.group(trip.id)}>
                            <UserPlus className="size-5" aria-hidden="true" />
                        </IconLink>
                        {trip.can_edit && (
                            <IconLink label="Modifica viaggio" to={paths.editTrip(trip.id)}>
                                <Pencil className="size-[18px]" aria-hidden="true" />
                            </IconLink>
                        )}
                    </div>
                </div>

                <header>
                    <h1 className="text-[30px] leading-tight font-extrabold tracking-tight">{trip.name}</h1>
                    <p className="mt-0.5 text-sm text-mute">
                        {formatRange(trip.start_date, trip.end_date)} · {tripLength(trip)} giorni · {countdown(trip)}
                    </p>
                </header>

                <Card>
                    <SectionTitle>Cosa manca</SectionTitle>
                    <ul className="flex flex-col gap-2.5">
                        {insights.pending_bookings.length > 0 && (
                            <Todo icon={Ticket} tone="verm" href={paths.bookings(trip.id)}>
                                <b>
                                    {insights.pending_bookings.length} {insights.pending_bookings.length === 1 ? 'prenotazione' : 'prenotazioni'}
                                </b>{' '}
                                da fare
                                {firstPending?.deadline && ` — la prima ${deadlineLabel(firstPending.deadline).text}`}
                            </Todo>
                        )}
                        {insights.empty_days.length > 0 && (
                            <Todo icon={CalendarX2} tone="sun" href={paths.day(trip.id, insights.empty_days[0])}>
                                <b>
                                    {insights.empty_days.length} {insights.empty_days.length === 1 ? 'giorno vuoto' : 'giorni vuoti'}
                                </b>{' '}
                                ({insights.empty_days.slice(0, 3).map(formatDayMonth).join(', ')}
                                {insights.empty_days.length > 3 && '…'})
                            </Todo>
                        )}
                        {gapCount > 0 && (
                            <Todo icon={Clock3} tone="sun" href={paths.balance(trip.id)}>
                                <b>
                                    {gapCount} {gapCount === 1 ? 'buco' : 'buchi'}
                                </b>{' '}
                                di 2 ore o più nelle giornate
                            </Todo>
                        )}
                        {insights.uncovered_nights.length > 0 && (
                            <Todo icon={BedDouble} tone="indigo" onClick={() => setStaySheet({ open: true, checkIn: insights.uncovered_nights[0] })}>
                                <b>
                                    {insights.uncovered_nights.length} {insights.uncovered_nights.length === 1 ? 'notte' : 'notti'}
                                </b>{' '}
                                senza alloggio
                            </Todo>
                        )}
                        {insights.pending_bookings.length + insights.empty_days.length + gapCount + insights.uncovered_nights.length === 0 && (
                            <li className="text-sm text-mute">Tutto a posto: ogni giorno ha un piano e ogni notte un letto.</li>
                        )}
                    </ul>
                </Card>

                <section>
                    <SectionTitle
                        action={
                            <Link to={paths.balance(trip.id)} className="text-[13px] font-bold text-indigo hover:underline">
                                Bilanciamento
                            </Link>
                        }
                    >
                        Giorni
                    </SectionTitle>
                    <div className="-mx-5 flex snap-x scroll-px-5 gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
                        {insights.days.map((day) => (
                            <DayTile key={day.date} trip={trip} day={day} />
                        ))}
                    </div>
                </section>

                <section>
                    <SectionTitle
                        action={
                            trip.can_edit && (
                                <button onClick={() => setStaySheet({ open: true })} className="text-[13px] font-bold text-indigo hover:underline">
                                    Aggiungi
                                </button>
                            )
                        }
                    >
                        Dove dormiamo
                    </SectionTitle>
                    <ul className="flex flex-col gap-2">
                        {stays.map((stay, i) => (
                            <li key={stay.id}>
                                <button
                                    disabled={!trip.can_edit}
                                    onClick={() => setStaySheet({ open: true, stay })}
                                    className="flex w-full items-center gap-3 rounded-2xl border border-line bg-card px-3.5 py-3 text-left enabled:hover:bg-hover"
                                >
                                    <span className={cn('w-1.5 self-stretch rounded', ['bg-indigo', 'bg-leaf', 'bg-clay', 'bg-grape'][i % 4])} aria-hidden="true" />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-bold">{stay.name}</span>
                                        <span className="block text-xs text-mute">
                                            {stay.city} · {formatDayMonth(stay.check_in)} → {formatDayMonth(stay.check_out)} · {nightsOf(stay)} {nightsOf(stay) === 1 ? 'notte' : 'notti'}
                                        </span>
                                    </span>
                                    {stay.confirmed ? <Chip className="bg-leaf-soft text-leaf">Confermato</Chip> : <Chip className="bg-sun-soft text-sun-ink">Da confermare</Chip>}
                                </button>
                            </li>
                        ))}
                        {insights.uncovered_nights.length > 0 && (
                            <li className="flex items-center gap-3 rounded-2xl border border-dashed border-verm bg-verm-soft px-3.5 py-3">
                                <span className="flex-1 text-sm">
                                    <b className="block text-verm-ink">Notti scoperte</b>
                                    <span className="text-xs text-verm-ink">{insights.uncovered_nights.slice(0, 4).map(formatDayMonth).join(', ')}</span>
                                </span>
                                {trip.can_edit && (
                                    <button
                                        onClick={() => setStaySheet({ open: true, checkIn: insights.uncovered_nights[0] })}
                                        className="h-9 rounded-[10px] bg-verm px-3 text-xs font-bold text-paper hover:bg-verm-ink"
                                    >
                                        Aggiungi
                                    </button>
                                )}
                            </li>
                        )}
                    </ul>
                </section>
            </div>

            <StaySheet trip={trip} open={staySheet.open} stay={staySheet.stay} checkIn={staySheet.checkIn} onOpenChange={(open) => setStaySheet((s) => ({ ...s, open }))} />
        </TripLayout>
    );
}

const TONES = {
    verm: 'bg-verm-soft text-verm',
    sun: 'bg-sun-soft text-sun-ink',
    indigo: 'bg-indigo-soft text-indigo',
};

function Todo({
    icon: Icon,
    tone,
    href,
    onClick,
    children,
}: {
    icon: typeof Ticket;
    tone: keyof typeof TONES;
    href?: string;
    onClick?: () => void;
    children: React.ReactNode;
}) {
    const inner = (
        <>
            <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-[10px]', TONES[tone])} aria-hidden="true">
                <Icon className="size-[18px]" />
            </span>
            <span className="flex-1 text-left text-sm">{children}</span>
        </>
    );
    const cls = 'flex w-full items-center gap-2.5 rounded-xl -mx-1 px-1 py-0.5 hover:bg-hover';

    return <li>{href ? <Link to={href} className={cls}>{inner}</Link> : <button onClick={onClick} className={cls}>{inner}</button>}</li>;
}

const BAR_ORDER: ActivityType[] = ['transport', 'food', 'experience', 'shopping', 'visit'];

function DayTile({ trip, day }: { trip: TripHeader; day: DayInsight }) {
    const scale = Math.max(600, day.planned_minutes);

    return (
        <Link to={paths.day(trip.id, day.date)}
            className={cn(
                'relative flex w-[58px] shrink-0 snap-start flex-col items-center gap-1 rounded-[14px] border bg-card py-2',
                day.load === 'full' ? 'border-[1.5px] border-verm' : day.load === 'empty' ? 'border-dashed border-sun-line' : 'border-line',
            )}
        >
            <span className="text-[11px] font-semibold text-mute">{formatWeekdayShort(day.date)}</span>
            <span className="text-[17px] font-extrabold">{dayOfMonth(day.date)}</span>
            <span className="flex h-11 w-7 flex-col justify-end overflow-hidden rounded-md bg-sunken" aria-hidden="true">
                {BAR_ORDER.map((type) =>
                    day.minutes_by_type[type] ? <span key={type} className={ACTIVITY_TYPES[type].bar} style={{ height: `${(day.minutes_by_type[type]! / scale) * 100}%` }} /> : null,
                )}
            </span>
            <span className={cn('max-w-full truncate px-1 text-[10px] font-bold uppercase', day.load === 'full' ? 'text-verm' : 'text-indigo')}>
                {day.load === 'full' ? 'Pieno' : day.load === 'empty' ? 'Vuoto' : (day.city?.slice(0, 3) ?? '—')}
            </span>
            <span className="sr-only">
                Giorno {day.number}, {day.load === 'empty' ? 'vuoto' : `${day.activity_count} attività`}
            </span>
        </Link>
    );
}
