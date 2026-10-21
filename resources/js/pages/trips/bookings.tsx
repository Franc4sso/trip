import { ActivitySheet } from '@/components/tabi/activity-sheet';
import { StaySheet } from '@/components/tabi/stay-sheet';
import { Card, Chip, SectionTitle } from '@/components/tabi/ui';
import TripLayout from '@/layouts/trip-layout';
import { daysBetween, deadlineLabel, formatDayMonth, parseDate, type Activity, type Stay, type TripHeader } from '@/lib/trip';
import { cn } from '@/lib/utils';
import { router } from '@inertiajs/react';
import { ExternalLink } from 'lucide-react';
import { useMemo, useState } from 'react';

interface Props {
    trip: TripHeader;
    bookings: Activity[];
    stays: Stay[];
    uncovered_nights: string[];
}

type Tab = 'todo' | 'done' | 'stays';

export default function Bookings({ trip, bookings, stays, uncovered_nights }: Props) {
    const [tab, setTab] = useState<Tab>('todo');
    const [activitySheet, setActivitySheet] = useState<{ open: boolean; activity?: Activity }>({ open: false });
    const [staySheet, setStaySheet] = useState<{ open: boolean; stay?: Stay | null; checkIn?: string }>({ open: false });

    const todo = bookings.filter((b) => !b.booked);
    const done = bookings.filter((b) => b.booked);
    const days = useMemo(() => tripDays(trip), [trip]);

    const markBooked = (b: Activity, booked: boolean) =>
        router.patch(route('trips.activities.update', [trip.id, b.id]), { booked }, { preserveScroll: true });

    return (
        <TripLayout title={`Prenotazioni · ${trip.name}`} trip={trip} tab="bookings">
            <h1 className="text-[28px] font-extrabold tracking-tight">Prenotazioni</h1>

            <div role="tablist" className="mt-3.5 flex gap-1 rounded-[14px] bg-[#E8E6E0] p-1">
                {(
                    [
                        ['todo', `Da fare · ${todo.length}`],
                        ['done', `Fatte · ${done.length}`],
                        ['stays', 'Alloggi'],
                    ] as [Tab, string][]
                ).map(([key, label]) => (
                    <button
                        key={key}
                        role="tab"
                        aria-selected={tab === key}
                        onClick={() => setTab(key)}
                        className={cn('h-10 flex-1 rounded-xl text-[13px] font-bold', tab === key ? 'bg-white text-ink shadow-sm' : 'text-mute')}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {tab !== 'stays' && (
                <ul className="mt-3.5 flex flex-col gap-2">
                    {(tab === 'todo' ? todo : done).map((b) => (
                        <BookingRow
                            key={b.id}
                            booking={b}
                            canEdit={trip.can_edit}
                            onToggle={() => markBooked(b, !b.booked)}
                            onOpen={() => trip.can_edit && setActivitySheet({ open: true, activity: b })}
                        />
                    ))}
                    {(tab === 'todo' ? todo : done).length === 0 && (
                        <li className="rounded-[20px] border border-dashed border-[#B9B7AF] p-5 text-center text-sm text-mute">
                            {tab === 'todo' ? 'Niente da prenotare. Segna «Serve prenotare» su un\'attività per vederla qui.' : 'Ancora nessuna prenotazione fatta.'}
                        </li>
                    )}
                </ul>
            )}

            {tab === 'stays' && (
                <div className="mt-3.5 flex flex-col gap-4">
                    <StayTimeline trip={trip} stays={stays} />
                    <section>
                        <SectionTitle
                            action={
                                trip.can_edit && (
                                    <button onClick={() => setStaySheet({ open: true, checkIn: uncovered_nights[0] })} className="text-[13px] font-bold text-indigo hover:underline">
                                        Aggiungi
                                    </button>
                                )
                            }
                        >
                            Alloggi
                        </SectionTitle>
                        <ul className="flex flex-col gap-2">
                            {stays.map((s) => (
                                <li key={s.id}>
                                    <button
                                        disabled={!trip.can_edit}
                                        onClick={() => setStaySheet({ open: true, stay: s })}
                                        className="flex w-full items-start gap-3 rounded-2xl border border-line bg-white px-3.5 py-3 text-left enabled:hover:bg-[#FAF9F6]"
                                    >
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm font-bold">{s.name}</span>
                                            <span className="block text-xs text-mute">
                                                {s.city} · {formatDayMonth(s.check_in)} → {formatDayMonth(s.check_out)}
                                                {s.booking_ref && ` · ${s.booking_ref}`}
                                            </span>
                                            {s.address && <span className="mt-0.5 block truncate text-xs text-mute">{s.address}</span>}
                                        </span>
                                        {s.confirmed ? <Chip className="bg-leaf-soft text-leaf">Confermato</Chip> : <Chip className="bg-sun-soft text-sun-ink">Da confermare</Chip>}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>
                </div>
            )}

            <ActivitySheet trip={trip} days={days} open={activitySheet.open} activity={activitySheet.activity} onOpenChange={(open) => setActivitySheet((s) => ({ ...s, open }))} />
            <StaySheet trip={trip} open={staySheet.open} stay={staySheet.stay} checkIn={staySheet.checkIn} onOpenChange={(open) => setStaySheet((s) => ({ ...s, open }))} />
        </TripLayout>
    );
}

function BookingRow({ booking: b, canEdit, onToggle, onOpen }: { booking: Activity; canEdit: boolean; onToggle: () => void; onOpen: () => void }) {
    const deadline = deadlineLabel(b.booking_deadline);
    const left = b.booking_deadline ? daysBetween(new Date(), parseDate(b.booking_deadline)) : null;
    const urgent = !b.booked && deadline.urgent;

    return (
        <li className={cn('flex items-start gap-3 rounded-2xl border bg-white px-3.5 py-3', urgent ? 'border-verm' : 'border-line')}>
            <span
                className={cn(
                    'w-[46px] shrink-0 rounded-xl py-1.5 text-center',
                    b.booked ? 'bg-leaf-soft text-leaf' : urgent ? 'bg-verm text-white' : left !== null ? 'bg-sun-soft text-sun-ink' : 'bg-[#EEECE6] text-[#3F4047]',
                )}
            >
                <b className="block text-[17px] leading-tight font-extrabold">{b.booked ? '✓' : left === null ? '—' : Math.max(left, 0)}</b>
                <span className="text-[10px] font-bold tracking-wide">{b.booked ? 'FATTA' : left === null ? 'DATA?' : left === 1 ? 'GIORNO' : 'GIORNI'}</span>
            </span>
            <div className="min-w-0 flex-1">
                <button onClick={onOpen} disabled={!canEdit} className="block text-left text-sm font-bold enabled:hover:underline">
                    {b.title}
                </button>
                <p className="mt-0.5 text-xs text-mute">
                    {b.date ? `Per il ${formatDayMonth(b.date)}` : 'Nella lista idee'}
                    {!b.booked && ` · ${deadline.text}`}
                    {b.cost ? ` · ${b.cost.toLocaleString('it-IT')} a testa` : ''}
                </p>
                <div className="mt-2 flex gap-1.5">
                    {b.booking_url && (
                        <a href={b.booking_url} target="_blank" rel="noreferrer noopener" className="inline-flex h-8 items-center gap-1 rounded-[10px] bg-ink px-2.5 text-xs font-bold text-white">
                            Apri sito
                            <ExternalLink className="size-3.5" aria-hidden="true" />
                        </a>
                    )}
                    {canEdit && (
                        <button onClick={onToggle} className="h-8 rounded-[10px] border border-[#DAD8D1] bg-white px-2.5 text-xs font-bold hover:bg-[#F3F2EE]">
                            {b.booked ? 'Segna da fare' : 'Segna fatta'}
                        </button>
                    )}
                </div>
            </div>
        </li>
    );
}

function StayTimeline({ trip, stays }: { trip: TripHeader; stays: Stay[] }) {
    const nights = Math.max(1, daysBetween(parseDate(trip.start_date), parseDate(trip.end_date)));
    const offset = (date: string) => (daysBetween(parseDate(trip.start_date), parseDate(date)) / nights) * 100;
    const colors = ['bg-indigo', 'bg-leaf', 'bg-[#A85A12]', 'bg-grape'];

    return (
        <Card className="p-3.5">
            <div className="relative h-[34px] overflow-hidden rounded-lg border border-dashed border-verm bg-verm-soft" aria-label="Alloggi nel tempo">
                {stays.map((s, i) => (
                    <span
                        key={s.id}
                        className={cn('absolute inset-y-0 flex items-center truncate px-1.5 text-[11px] font-extrabold text-white', colors[i % colors.length])}
                        style={{ left: `${offset(s.check_in)}%`, width: `${offset(s.check_out) - offset(s.check_in)}%` }}
                    >
                        {s.city}
                    </span>
                ))}
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] font-semibold text-mute">
                <span>{formatDayMonth(trip.start_date)}</span>
                <span>{formatDayMonth(trip.end_date)}</span>
            </div>
            <p className="mt-1 text-[11px] text-mute">Le zone rosse sono notti senza alloggio.</p>
        </Card>
    );
}

function tripDays(trip: TripHeader) {
    const out: { date: string; number: number }[] = [];
    const d = parseDate(trip.start_date);
    const end = parseDate(trip.end_date);
    for (let n = 1; d <= end; n++, d.setDate(d.getDate() + 1)) {
        out.push({ date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, number: n });
    }
    return out;
}
