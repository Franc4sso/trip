import { inputClass } from '@/components/ui';
import { formatMinutes } from '@/lib/trip';
import { cn } from '@/lib/utils';
import { Clock } from 'lucide-react';

interface Props {
    /** "HH:MM", or "" for no time. */
    value: string;
    onChange: (value: string) => void;
    /** Minutes as a string, "" when unknown (same shape as the form). */
    duration: string;
    onDurationChange: (value: string) => void;
    durations: number[];
    /** Without a day the activity is an idea: it can't have a time yet. */
    hasDate: boolean;
}

// the moments people actually think in when planning a day
const MOMENTS = [
    { label: 'Mattina', time: '09:00' },
    { label: 'Pranzo', time: '12:30' },
    { label: 'Pomeriggio', time: '15:00' },
    { label: 'Sera', time: '19:30' },
];
const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const toTime = (minutes: number) => `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** When it starts and how long it lasts, with the end time spelled out. */
export function TimeField({ value, onChange, duration, onDurationChange, durations, hasDate }: Props) {
    const time = value.slice(0, 5);
    const [hour, minute] = time ? time.split(':') : ['', ''];
    // keep odd minutes (e.g. 08:10 typed elsewhere) selectable
    const minutes = minute && !MINUTES.includes(minute) ? [...MINUTES, minute].sort() : MINUTES;
    const end = time && duration ? toMinutes(time) + Number(duration) : null;

    return (
        <fieldset>
            <legend className="mb-1.5 block text-xs font-bold text-mute">Quando</legend>
            {!hasDate ? (
                <p className="flex items-center gap-2 rounded-xl bg-sunken px-3 py-2.5 text-[13px] text-mute">
                    <Clock className="size-4 shrink-0" aria-hidden="true" />
                    Scegli prima un giorno: nella lista idee le attività non hanno orario.
                </p>
            ) : (
                <>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Momento della giornata">
                        <Moment active={!time} onClick={() => onChange('')}>
                            Senza orario
                        </Moment>
                        {MOMENTS.map((m) => (
                            <Moment key={m.time} active={time === m.time} onClick={() => onChange(m.time)}>
                                {m.label} <span className="font-semibold opacity-70">{m.time}</span>
                            </Moment>
                        ))}
                    </div>

                    <div className="mt-3 grid grid-cols-[1fr_auto_1fr_1.4fr] items-end gap-1.5">
                        <label className="min-w-0">
                            <span className="mb-1 block text-[11px] font-semibold text-faint">Ora</span>
                            <select className={inputClass} value={hour} onChange={(e) => onChange(e.target.value ? `${e.target.value}:${minute || '00'}` : '')}>
                                <option value="">--</option>
                                {HOURS.map((h) => (
                                    <option key={h} value={h}>
                                        {h}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <span className="pb-2.5 text-lg font-extrabold text-mute" aria-hidden="true">
                            :
                        </span>
                        <label className="min-w-0">
                            <span className="mb-1 block text-[11px] font-semibold text-faint">Minuti</span>
                            <select className={inputClass} value={minute} disabled={!hour} onChange={(e) => onChange(`${hour}:${e.target.value}`)}>
                                {!hour && <option value="">--</option>}
                                {minutes.map((m) => (
                                    <option key={m} value={m}>
                                        {m}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="ml-1.5 min-w-0">
                            <span className="mb-1 block text-[11px] font-semibold text-faint">Durata</span>
                            <select className={inputClass} value={duration} onChange={(e) => onDurationChange(e.target.value)}>
                                <option value="">Non so</option>
                                {durations.map((m) => (
                                    <option key={m} value={m}>
                                        {formatMinutes(m)}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <p className="mt-2 text-[13px] text-mute" aria-live="polite">
                        {!time
                            ? 'Senza orario: compare in fondo al giorno.'
                            : end !== null
                              ? `Dalle ${time} alle ${toTime(end)}${end >= 24 * 60 ? ' (giorno dopo)' : ''}`
                              : `Dalle ${time}`}
                    </p>
                </>
            )}
        </fieldset>
    );
}

function Moment({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            aria-pressed={active}
            onClick={onClick}
            className={cn(
                'inline-flex h-9 items-center gap-1 rounded-full border px-3 text-[13px] font-bold transition-colors',
                active ? 'border-ink bg-ink text-paper' : 'border-field bg-card hover:bg-hover',
            )}
        >
            {children}
        </button>
    );
}
