import { BottomSheet } from '@/components/bottom-sheet';
import { dayOfMonth, parseDate, type DayInsight } from '@/lib/trip';
import { cn } from '@/lib/utils';

type Day = Pick<DayInsight, 'date' | 'number' | 'load' | 'city'>;

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    days: Day[];
    selected: string;
    onPick: (date: string) => void;
    /** Shown under the title, e.g. the trip name. */
    subtitle?: string;
}

const WEEKDAYS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
const monthName = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });
const LOAD_DOT: Record<Day['load'], string> = {
    empty: 'border border-sun-line bg-transparent',
    ok: 'bg-indigo',
    full: 'bg-verm',
};

function todayIso(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** The trip as a real calendar, one grid per month: tap a day to jump there. */
export function TripCalendar({ open, onOpenChange, days, selected, onPick, subtitle }: Props) {
    const today = todayIso();
    const months = days.reduce<{ key: string; days: Day[] }[]>((list, d) => {
        const key = d.date.slice(0, 7);
        const last = list[list.length - 1];
        if (last?.key === key) last.days.push(d);
        else list.push({ key, days: [d] });
        return list;
    }, []);

    return (
        <BottomSheet open={open} onOpenChange={onOpenChange} title="Vai al giorno" subtitle={subtitle}>
            <div className="flex flex-col gap-5">
                {months.map((month) => {
                    // Monday-first: blank cells before the first trip day of the month
                    const lead = (parseDate(month.days[0].date).getDay() + 6) % 7;
                    return (
                        <section key={month.key} aria-label={monthName.format(parseDate(month.days[0].date))}>
                            <h3 className="mb-2 text-sm font-extrabold capitalize">{monthName.format(parseDate(month.days[0].date))}</h3>
                            <div className="grid grid-cols-7 gap-1 text-center" role="grid">
                                {WEEKDAYS.map((w, i) => (
                                    <span key={i} className="pb-1 text-[11px] font-bold text-faint" aria-hidden="true">
                                        {w}
                                    </span>
                                ))}
                                {Array.from({ length: lead }, (_, i) => (
                                    <span key={`lead-${i}`} aria-hidden="true" />
                                ))}
                                {month.days.map((d) => {
                                    const current = d.date === selected;
                                    return (
                                        <button
                                            key={d.date}
                                            type="button"
                                            onClick={() => {
                                                onPick(d.date);
                                                onOpenChange(false);
                                            }}
                                            aria-current={current ? 'date' : undefined}
                                            aria-label={`Giorno ${d.number}, ${parseDate(d.date).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}${d.city ? `, ${d.city}` : ''}${d.load === 'empty' ? ', libero' : d.load === 'full' ? ', molto pieno' : ''}`}
                                            className={cn(
                                                'flex h-[58px] min-w-0 flex-col items-center justify-center rounded-xl border px-0.5',
                                                current ? 'border-ink bg-ink text-paper' : 'border-line bg-card hover:bg-hover',
                                                d.date === today && !current && 'border-indigo ring-1 ring-indigo',
                                            )}
                                        >
                                            <span className={cn('text-[9px] font-bold leading-none', current ? 'text-paper/70' : 'text-faint')}>G{d.number}</span>
                                            <span className="text-base leading-tight font-extrabold">{dayOfMonth(d.date)}</span>
                                            <span className={cn('size-1.5 rounded-full', LOAD_DOT[d.load])} aria-hidden="true" />
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    );
                })}

                <CityLegend days={days} />

                <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-mute">
                    <span className="flex items-center gap-1.5">
                        <span className={cn('size-1.5 rounded-full', LOAD_DOT.ok)} aria-hidden="true" /> Pianificato
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className={cn('size-1.5 rounded-full', LOAD_DOT.full)} aria-hidden="true" /> Molto pieno
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className={cn('size-1.5 rounded-full', LOAD_DOT.empty)} aria-hidden="true" /> Libero
                    </span>
                </p>
            </div>
        </BottomSheet>
    );
}

/** Where you sleep, as stretches of days: "Tokyo G1–G3 · Kyoto G4–G8". */
function CityLegend({ days }: { days: Day[] }) {
    const stretches = days.reduce<{ city: string; from: number; to: number }[]>((list, d) => {
        if (!d.city) return list;
        const last = list[list.length - 1];
        if (last && last.city === d.city && last.to === d.number - 1) last.to = d.number;
        else list.push({ city: d.city, from: d.number, to: d.number });
        return list;
    }, []);
    if (stretches.length === 0) return null;
    return (
        <ul className="flex flex-wrap gap-1.5" aria-label="Città">
            {stretches.map((s) => (
                <li key={`${s.city}-${s.from}`} className="rounded-full bg-leaf-soft px-2.5 py-1 text-[11px] font-bold text-leaf">
                    {s.city} · {s.from === s.to ? `G${s.from}` : `G${s.from}–${s.to}`}
                </li>
            ))}
        </ul>
    );
}
