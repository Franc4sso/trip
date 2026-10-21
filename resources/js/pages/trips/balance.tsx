import { Card, IconLink } from '@/components/tabi/ui';
import TripLayout from '@/layouts/trip-layout';
import { ACTIVITY_TYPES, dayOfMonth, formatDayMonth, formatMinutes, formatWeekdayShort, type ActivityType, type Insights, type TripHeader } from '@/lib/trip';
import { cn } from '@/lib/utils';
import { Link } from '@inertiajs/react';
import { ChevronLeft } from 'lucide-react';

const ORDER: ActivityType[] = ['visit', 'food', 'experience', 'shopping', 'transport'];
const CITY_COLORS = ['bg-indigo', 'bg-leaf', 'bg-[#A85A12]', 'bg-grape', 'bg-[#0E7490]'];

export default function Balance({ trip, insights }: { trip: TripHeader; insights: Insights }) {
    const scale = Math.max(660, ...insights.days.map((d) => d.planned_minutes));
    const totalNights = insights.city_nights.reduce((n, c) => n + c.nights, 0);
    const busiest = [...insights.days].sort((a, b) => b.planned_minutes - a.planned_minutes)[0];
    const totals = ORDER.map((type) => ({ type, minutes: insights.days.reduce((n, d) => n + (d.minutes_by_type[type] ?? 0), 0) })).filter((t) => t.minutes > 0);
    const totalMinutes = totals.reduce((n, t) => n + t.minutes, 0);

    return (
        <TripLayout title={`Bilanciamento · ${trip.name}`} trip={trip} tab="balance">
            <div className="flex items-center gap-3">
                <IconLink label="Panoramica" href={route('trips.show', trip.id)}>
                    <ChevronLeft className="size-5" aria-hidden="true" />
                </IconLink>
                <div>
                    <h1 className="text-xl font-extrabold">Come avete diviso il viaggio</h1>
                    <p className="text-xs text-mute">Ore pianificate per giorno, per tipo</p>
                </div>
            </div>

            <Card className="mt-4 px-3.5 pt-3.5 pb-3">
                <div className="mb-2.5 flex flex-wrap gap-3">
                    {ORDER.map((type) => (
                        <span key={type} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-mute">
                            <i className={cn('inline-block size-2.5 rounded-[3px]', ACTIVITY_TYPES[type].bar)} />
                            {ACTIVITY_TYPES[type].label}
                        </span>
                    ))}
                </div>
                <ul className="flex flex-col gap-0.5">
                    {insights.days.map((day) => (
                        <li key={day.date}>
                            <Link
                                href={route('trips.days.show', [trip.id, day.date])}
                                className={cn(
                                    '-mx-1.5 flex h-6 items-center gap-2 rounded-md px-1.5 hover:bg-[#F3F2EE]',
                                    day.load === 'full' && 'bg-verm-soft',
                                    day.load === 'empty' && 'bg-sun-soft',
                                )}
                            >
                                <span className={cn('w-12 shrink-0 text-[11px] font-bold', day.load === 'full' ? 'text-verm-ink' : day.load === 'empty' ? 'text-sun-ink' : 'text-mute')}>
                                    {formatWeekdayShort(day.date).slice(0, 3)} {dayOfMonth(day.date)}
                                </span>
                                <span className="w-9 shrink-0 truncate text-[10px] font-extrabold text-indigo uppercase">{day.city?.slice(0, 3) ?? '—'}</span>
                                <span className="flex h-3 flex-1 gap-0.5" aria-hidden="true">
                                    {day.load === 'empty' ? (
                                        <span className="flex-1 rounded-[3px] border border-dashed border-sun-line" />
                                    ) : (
                                        ORDER.map((type) =>
                                            day.minutes_by_type[type] ? (
                                                <span key={type} className={cn('rounded-[3px]', ACTIVITY_TYPES[type].bar)} style={{ width: `${(day.minutes_by_type[type]! / scale) * 100}%` }} />
                                            ) : null,
                                        )
                                    )}
                                </span>
                                <span className={cn('w-10 shrink-0 text-right text-[11px] font-bold', day.load === 'full' && 'text-verm-ink')}>
                                    {Math.round(day.planned_minutes / 60)}h
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            </Card>

            <div className="mt-3 flex flex-col gap-2">
                {insights.full_days.length > 0 && busiest && (
                    <Card className="px-3.5 py-3">
                        <p className="text-[13px] font-extrabold text-verm-ink">{formatDayMonth(busiest.date)} è troppo pieno</p>
                        <p className="mt-0.5 text-[13px] text-[#3F4047]">
                            {formatMinutes(busiest.planned_minutes)} di attività.
                            {insights.empty_days.length > 0 && ` Sposta qualcosa al ${insights.empty_days.slice(0, 2).map(formatDayMonth).join(' o al ')}: sono liberi.`}
                        </p>
                    </Card>
                )}

                {totals.length > 0 && (
                    <Card className="px-3.5 py-3">
                        <p className="text-[13px] font-extrabold">Tipo di viaggio</p>
                        <div className="mt-2 flex h-3 overflow-hidden rounded-full" aria-hidden="true">
                            {totals.map((t) => (
                                <span key={t.type} className={ACTIVITY_TYPES[t.type].bar} style={{ width: `${(t.minutes / totalMinutes) * 100}%` }} />
                            ))}
                        </div>
                        <p className="mt-1.5 text-xs text-mute">
                            {totals.map((t) => `${ACTIVITY_TYPES[t.type].label} ${Math.round((t.minutes / totalMinutes) * 100)}%`).join(' · ')}
                        </p>
                    </Card>
                )}

                {insights.city_nights.length > 0 && (
                    <Card className="px-3.5 py-3">
                        <p className="text-[13px] font-extrabold">Notti per città</p>
                        <div className="mt-2 flex h-[26px] overflow-hidden rounded-lg text-[11px] font-extrabold text-white">
                            {insights.city_nights.map((c, i) => (
                                <span key={c.city} className={cn('flex min-w-0 items-center truncate px-2', CITY_COLORS[i % CITY_COLORS.length])} style={{ width: `${(c.nights / totalNights) * 100}%` }}>
                                    {c.city} {c.nights}
                                </span>
                            ))}
                        </div>
                        {insights.uncovered_nights.length > 0 && (
                            <p className="mt-1.5 text-xs text-mute">
                                {insights.uncovered_nights.length} {insights.uncovered_nights.length === 1 ? 'notte ancora senza alloggio' : 'notti ancora senza alloggio'}
                            </p>
                        )}
                    </Card>
                )}
            </div>
        </TripLayout>
    );
}
