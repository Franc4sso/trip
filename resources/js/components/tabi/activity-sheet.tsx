import { BottomSheet } from '@/components/tabi/bottom-sheet';
import { Field, inputClass, PrimaryButton } from '@/components/tabi/ui';
import { ACTIVITY_TYPES, formatDayMonth, formatWeekdayShort, type Activity, type ActivityType, type TripHeader } from '@/lib/trip';
import { cn } from '@/lib/utils';
import { router, useForm } from '@inertiajs/react';
import { type FormEvent, useEffect } from 'react';

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
    const form = useForm(initial());

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
            form.setData(initial());
            form.clearErrors();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, activity?.id, draft?.date, draft?.start_time]);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.transform((d) => ({
            ...d,
            date: d.date || null,
            start_time: d.date && d.start_time ? d.start_time : null,
            duration_minutes: d.duration_minutes === '' ? null : Number(d.duration_minutes),
            cost: d.cost === '' ? null : Number(d.cost),
            booking_deadline: d.booking_required ? d.booking_deadline || null : null,
            booking_url: d.booking_url || null,
        }));
        const opts = { preserveScroll: true, onSuccess: () => onOpenChange(false) };
        if (activity) form.put(route('trips.activities.update', [trip.id, activity.id]), opts);
        else form.post(route('trips.activities.store', trip.id), opts);
    };

    const remove = () => {
        if (activity && confirm(`Eliminare «${activity.title}»?`)) {
            router.delete(route('trips.activities.destroy', [trip.id, activity.id]), { preserveScroll: true, onSuccess: () => onOpenChange(false) });
        }
    };

    const target = form.data.date ? `${formatWeekdayShort(form.data.date).toLowerCase()} ${formatDayMonth(form.data.date)}` : 'lista idee';

    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title={activity ? 'Modifica attività' : 'Nuova attività'}
            subtitle={trip.name}
            footer={
                <PrimaryButton form="activity-form" type="submit" disabled={form.processing} className="w-full">
                    {activity ? 'Salva' : `Aggiungi a ${target}`}
                </PrimaryButton>
            }
        >
            <form id="activity-form" onSubmit={submit} className="flex flex-col gap-4">
                <fieldset>
                    <legend className="sr-only">Tipo</legend>
                    <div className="flex flex-wrap gap-2">
                        {(Object.keys(ACTIVITY_TYPES) as ActivityType[]).map((type) => {
                            const { label, icon: Icon } = ACTIVITY_TYPES[type];
                            const active = form.data.type === type;
                            return (
                                <button
                                    key={type}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() => form.setData('type', type)}
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

                <Field label="Cosa" htmlFor="act-title" error={form.errors.title}>
                    <input id="act-title" className={inputClass} value={form.data.title} onChange={(e) => form.setData('title', e.target.value)} placeholder="Kiyomizu-dera, cena di sushi…" required />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                    <Field label="Luogo" htmlFor="act-location" error={form.errors.location}>
                        <input id="act-location" className={inputClass} value={form.data.location} onChange={(e) => form.setData('location', e.target.value)} placeholder="Indirizzo o zona" />
                    </Field>
                    <Field label="Città" htmlFor="act-city" error={form.errors.city}>
                        <input id="act-city" className={inputClass} value={form.data.city} onChange={(e) => form.setData('city', e.target.value)} />
                    </Field>
                </div>

                <Field label="Giorno" htmlFor="act-date" error={form.errors.date}>
                    <select id="act-date" className={inputClass} value={form.data.date} onChange={(e) => form.setData('date', e.target.value)}>
                        <option value="">Lista idee (da decidere)</option>
                        {days.map((d) => (
                            <option key={d.date} value={d.date}>
                                Giorno {d.number} · {formatWeekdayShort(d.date).toLowerCase()} {formatDayMonth(d.date)}
                            </option>
                        ))}
                    </select>
                </Field>

                <div className="grid grid-cols-2 gap-3">
                    <Field label="Orario" htmlFor="act-time" error={form.errors.start_time}>
                        <input id="act-time" type="time" disabled={!form.data.date} className={cn(inputClass, 'disabled:opacity-50')} value={form.data.start_time} onChange={(e) => form.setData('start_time', e.target.value)} />
                    </Field>
                    <Field label="Durata" htmlFor="act-duration" error={form.errors.duration_minutes}>
                        <select id="act-duration" className={inputClass} value={form.data.duration_minutes} onChange={(e) => form.setData('duration_minutes', e.target.value)}>
                            <option value="">—</option>
                            {DURATIONS.map((m) => (
                                <option key={m} value={m}>
                                    {m < 60 ? `${m} min` : `${m / 60} h`.replace('.5 h', ' h 30')}
                                </option>
                            ))}
                        </select>
                    </Field>
                </div>

                <Field label={`Costo a testa (${trip.currency})`} htmlFor="act-cost" error={form.errors.cost}>
                    <input id="act-cost" inputMode="numeric" className={inputClass} value={form.data.cost} onChange={(e) => form.setData('cost', e.target.value.replace(/\D/g, ''))} />
                </Field>

                <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-3.5">
                    <label className="flex min-h-8 items-center justify-between text-sm font-bold">
                        Serve prenotare
                        <input type="checkbox" className="size-5 accent-indigo" checked={form.data.booking_required} onChange={(e) => form.setData('booking_required', e.target.checked)} />
                    </label>
                    {form.data.booking_required && (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Entro il" htmlFor="act-deadline" error={form.errors.booking_deadline}>
                                    <input id="act-deadline" type="date" className={inputClass} value={form.data.booking_deadline} onChange={(e) => form.setData('booking_deadline', e.target.value)} />
                                </Field>
                                <label className="mt-6 flex h-11 items-center justify-between gap-2 rounded-xl border border-[#DAD8D1] px-3 text-sm font-bold">
                                    Fatta
                                    <input type="checkbox" className="size-5 accent-leaf" checked={form.data.booked} onChange={(e) => form.setData('booked', e.target.checked)} />
                                </label>
                            </div>
                            <Field label="Link prenotazione" htmlFor="act-url" error={form.errors.booking_url}>
                                <input id="act-url" type="url" className={inputClass} value={form.data.booking_url} onChange={(e) => form.setData('booking_url', e.target.value)} placeholder="https://" />
                            </Field>
                        </>
                    )}
                </div>

                <Field label="Note" htmlFor="act-notes" error={form.errors.notes}>
                    <textarea id="act-notes" rows={3} className={cn(inputClass, 'h-auto py-2.5')} value={form.data.notes} onChange={(e) => form.setData('notes', e.target.value)} />
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
