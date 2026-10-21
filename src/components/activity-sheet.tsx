import { BottomSheet } from '@/components/bottom-sheet';
import { Field, FormError, inputClass, PrimaryButton } from '@/components/ui';
import { api } from '@/lib/api';
import { ACTIVITY_TYPES, formatDayMonth, formatWeekdayShort, type Activity, type ActivityType, type TripHeader } from '@/lib/trip';
import { useAction } from '@/lib/use-action';
import { cn } from '@/lib/utils';
import { type FormEvent, useEffect, useState } from 'react';

export interface ActivityDraft {
    date?: string | null;
    start_time?: string | null;
}

interface Props {
    trip: TripHeader;
    days: { date: string; number: number }[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
    activity?: Activity | null;
    draft?: ActivityDraft;
}

const DURATIONS = [30, 60, 90, 120, 180, 240, 360];

export function ActivitySheet({ trip, days, open, onOpenChange, activity, draft }: Props) {
    const [data, setData] = useState(initial);
    const { run, pending, error, clearError } = useAction();
    const set = <K extends keyof typeof data>(key: K, value: (typeof data)[K]) => setData((d) => ({ ...d, [key]: value }));

    function initial() {
        return {
            type: (activity?.type ?? 'visit') as ActivityType,
            title: activity?.title ?? '',
            location: activity?.location ?? '',
            city: activity?.city ?? '',
            date: activity ? (activity.date ?? '') : (draft?.date ?? ''),
            start_time: activity?.start_time ?? draft?.start_time ?? '',
            duration_minutes: activity?.duration_minutes?.toString() ?? '60',
            cost: activity?.cost?.toString() ?? '',
            notes: activity?.notes ?? '',
            booking_required: activity?.booking_required ?? false,
            booking_deadline: activity?.booking_deadline ?? '',
            booking_url: activity?.booking_url ?? '',
            booked: activity?.booked ?? false,
        };
    }

    useEffect(() => {
        if (open) {
            setData(initial());
            clearError();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, activity?.id, draft?.date, draft?.start_time]);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        const input = {
            ...data,
            title: data.title.trim(),
            location: data.location.trim() || null,
            city: data.city.trim() || null,
            notes: data.notes.trim() || null,
            date: data.date || null,
            start_time: data.date && data.start_time ? data.start_time : null,
            duration_minutes: data.duration_minutes === '' ? null : Number(data.duration_minutes),
            cost: data.cost === '' ? null : Number(data.cost),
            booking_deadline: data.booking_required ? data.booking_deadline || null : null,
            booking_url: data.booking_url.trim() || null,
        };
        const ok = await run(() => (activity ? api.updateActivity(activity.id, input) : api.addActivity(trip.id, input)));
        if (ok) onOpenChange(false);
    };

    const remove = async () => {
        if (activity && confirm(`Eliminare «${activity.title}»?`) && (await run(() => api.deleteActivity(activity.id)))) onOpenChange(false);
    };

    const target = data.date ? `${formatWeekdayShort(data.date).toLowerCase()} ${formatDayMonth(data.date)}` : 'lista idee';

    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title={activity ? 'Modifica attività' : 'Nuova attività'}
            subtitle={trip.name}
            footer={
                <PrimaryButton form="activity-form" type="submit" disabled={pending} className="w-full">
                    {activity ? 'Salva' : `Aggiungi a ${target}`}
                </PrimaryButton>
            }
        >
            <form id="activity-form" onSubmit={submit} className="flex flex-col gap-4">
                <FormError message={error} />
                <fieldset>
                    <legend className="sr-only">Tipo</legend>
                    <div className="flex flex-wrap gap-2">
                        {(Object.keys(ACTIVITY_TYPES) as ActivityType[]).map((type) => {
                            const { label, icon: Icon } = ACTIVITY_TYPES[type];
                            const active = data.type === type;
                            return (
                                <button
                                    key={type}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() => set('type', type)}
                                    className={cn(
                                        'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-bold transition-colors',
                                        active ? 'border-ink bg-ink text-white' : 'border-[#DAD8D1] bg-white hover:bg-[#F3F2EE]',
                                    )}
                                >
                                    <Icon className="size-4" aria-hidden="true" />
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </fieldset>

                <Field label="Cosa" htmlFor="act-title">
                    <input id="act-title" className={inputClass} value={data.title} onChange={(e) => set('title', e.target.value)} placeholder="Kiyomizu-dera, cena di sushi…" required maxLength={200} />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                    <Field label="Luogo" htmlFor="act-location">
                        <input id="act-location" className={inputClass} value={data.location} onChange={(e) => set('location', e.target.value)} placeholder="Indirizzo o zona" />
                    </Field>
                    <Field label="Città" htmlFor="act-city">
                        <input id="act-city" className={inputClass} value={data.city} onChange={(e) => set('city', e.target.value)} />
                    </Field>
                </div>

                <Field label="Giorno" htmlFor="act-date">
                    <select id="act-date" className={inputClass} value={data.date} onChange={(e) => set('date', e.target.value)}>
                        <option value="">Lista idee (da decidere)</option>
                        {days.map((d) => (
                            <option key={d.date} value={d.date}>
                                Giorno {d.number} · {formatWeekdayShort(d.date).toLowerCase()} {formatDayMonth(d.date)}
                            </option>
                        ))}
                    </select>
                </Field>

                <div className="grid grid-cols-2 gap-3">
                    <Field label="Orario" htmlFor="act-time">
                        <input id="act-time" type="time" disabled={!data.date} className={cn(inputClass, 'disabled:opacity-50')} value={data.start_time} onChange={(e) => set('start_time', e.target.value)} />
                    </Field>
                    <Field label="Durata" htmlFor="act-duration">
                        <select id="act-duration" className={inputClass} value={data.duration_minutes} onChange={(e) => set('duration_minutes', e.target.value)}>
                            <option value="">—</option>
                            {DURATIONS.map((m) => (
                                <option key={m} value={m}>
                                    {m < 60 ? `${m} min` : `${m / 60} h`.replace('.5 h', ' h 30')}
                                </option>
                            ))}
                        </select>
                    </Field>
                </div>

                <Field label={`Costo a testa (${trip.currency})`} htmlFor="act-cost">
                    <input id="act-cost" inputMode="numeric" className={inputClass} value={data.cost} onChange={(e) => set('cost', e.target.value.replace(/\D/g, ''))} />
                </Field>

                <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-3.5">
                    <label className="flex min-h-8 items-center justify-between text-sm font-bold">
                        Serve prenotare
                        <input type="checkbox" className="size-5 accent-indigo" checked={data.booking_required} onChange={(e) => set('booking_required', e.target.checked)} />
                    </label>
                    {data.booking_required && (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Entro il" htmlFor="act-deadline">
                                    <input id="act-deadline" type="date" className={inputClass} value={data.booking_deadline} onChange={(e) => set('booking_deadline', e.target.value)} />
                                </Field>
                                <label className="mt-6 flex h-11 items-center justify-between gap-2 rounded-xl border border-[#DAD8D1] px-3 text-sm font-bold">
                                    Fatta
                                    <input type="checkbox" className="size-5 accent-leaf" checked={data.booked} onChange={(e) => set('booked', e.target.checked)} />
                                </label>
                            </div>
                            <Field label="Link prenotazione" htmlFor="act-url">
                                <input id="act-url" type="url" className={inputClass} value={data.booking_url} onChange={(e) => set('booking_url', e.target.value)} placeholder="https://" />
                            </Field>
                        </>
                    )}
                </div>

                <Field label="Note" htmlFor="act-notes">
                    <textarea id="act-notes" rows={3} className={cn(inputClass, 'h-auto py-2.5')} value={data.notes} onChange={(e) => set('notes', e.target.value)} />
                </Field>

                {activity && (
                    <button type="button" onClick={remove} className="h-11 text-sm font-bold text-verm-ink hover:underline">
                        Elimina attività
                    </button>
                )}
            </form>
        </BottomSheet>
    );
}
