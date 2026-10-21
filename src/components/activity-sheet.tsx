import { useConfirm } from '@/components/confirm-dialog';
import { BottomSheet } from '@/components/bottom-sheet';
import { PlaceInput } from '@/components/place-input';
import { TimeField } from '@/components/time-field';
import { Field, FormError, inputClass, PrimaryButton } from '@/components/ui';
import { api } from '@/lib/api';
import { type Coordinates } from '@/lib/places';
import { useFocus, usePeersOn } from '@/lib/presence';
import { ACTIVITY_TYPES, formatDayMonth, formatWeekdayShort, type Activity, type ActivityType, type TripHeader } from '@/lib/trip';
import { useAction } from '@/lib/use-action';
import { cn } from '@/lib/utils';
import { MapPin, X } from 'lucide-react';
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
    /** Bias place suggestions towards this point, e.g. tonight's stay. */
    near?: Coordinates | null;
    /** City of the day the sheet was opened from. */
    city?: string | null;
}

const DURATIONS = [30, 60, 90, 120, 180, 240, 360];

export function ActivitySheet({ trip, days, open, onOpenChange, activity, draft, near, city }: Props) {
    const [data, setData] = useState(initial);
    const { run, pending, error, clearError } = useAction();
    const confirm = useConfirm();
    useFocus(open, activity ? { kind: 'activity', id: activity.id } : { kind: 'new-activity', date: draft?.date ?? null });
    const alsoEditing = usePeersOn((f) => !!activity && f?.kind === 'activity' && f.id === activity.id);
    const set = <K extends keyof typeof data>(key: K, value: (typeof data)[K]) => setData((d) => ({ ...d, [key]: value }));

    function initial() {
        return {
            type: (activity?.type ?? 'visit') as ActivityType,
            title: activity?.title ?? '',
            location: activity?.location ?? '',
            city: activity?.city ?? (activity ? '' : (city ?? '')),
            date: activity ? (activity.date ?? '') : (draft?.date ?? ''),
            start_time: activity?.start_time ?? draft?.start_time ?? '',
            duration_minutes: activity?.duration_minutes?.toString() ?? '60',
            cost: activity?.cost?.toString() ?? '',
            notes: activity?.notes ?? '',
            booking_required: activity?.booking_required ?? false,
            booking_deadline: activity?.booking_deadline ?? '',
            booking_url: activity?.booking_url ?? '',
            booked: activity?.booked ?? false,
            latitude: activity?.latitude ?? null,
            longitude: activity?.longitude ?? null,
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
        if (!activity) return;
        const ok = await confirm({ title: `Eliminare «${activity.title}»?`, description: "L'attività sparisce dal programma per tutto il gruppo." });
        if (ok && (await run(() => api.deleteActivity(activity.id)))) onOpenChange(false);
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
                {alsoEditing.length > 0 && (
                    <p role="status" className="rounded-xl bg-leaf-soft px-3 py-2 text-[13px] font-semibold text-leaf">
                        Anche {alsoEditing.join(', ')} sta modificando questa attività: salva per ultimo chi ha le informazioni giuste.
                    </p>
                )}
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
                                        active ? 'border-ink bg-ink text-paper' : 'border-field bg-card hover:bg-hover',
                                    )}
                                >
                                    <Icon className="size-4" aria-hidden="true" />
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </fieldset>

                <Field label="Cosa (scrivi un luogo per i suggerimenti)" htmlFor="act-title">
                    <PlaceInput
                        id="act-title"
                        value={data.title}
                        onChange={(title) => set('title', title)}
                        onSelect={(place) =>
                            setData((d) => ({
                                ...d,
                                title: place.name,
                                location: place.address ?? place.detail,
                                city: place.city ?? d.city,
                                latitude: place.latitude,
                                longitude: place.longitude,
                            }))
                        }
                        near={near}
                        city={data.city || city}
                        placeholder="Kiyomizu-dera, cena di sushi…"
                        required
                        maxLength={200}
                    />
                    {data.location && (
                        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-mute">
                            <MapPin className="size-3.5 shrink-0 text-indigo" aria-hidden="true" />
                            <span className="min-w-0 truncate">{data.location}</span>
                            <button
                                type="button"
                                aria-label="Togli il luogo"
                                onClick={() => setData((d) => ({ ...d, location: '', latitude: null, longitude: null }))}
                                className="-my-2 flex size-8 shrink-0 items-center justify-center rounded-lg hover:bg-hover"
                            >
                                <X className="size-3.5" aria-hidden="true" />
                            </button>
                        </p>
                    )}
                </Field>

                <Field label="Città" htmlFor="act-city">
                    <PlaceInput
                        id="act-city"
                        kind="city"
                        value={data.city}
                        onChange={(city) => set('city', city)}
                        onSelect={(place) => set('city', place.name)}
                        near={near}
                        maxLength={120}
                    />
                </Field>

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

                <TimeField
                    value={data.start_time}
                    onChange={(time) => set('start_time', time)}
                    duration={data.duration_minutes}
                    onDurationChange={(minutes) => set('duration_minutes', minutes)}
                    durations={DURATIONS}
                    hasDate={!!data.date}
                />

                <Field label={`Costo a testa (${trip.currency})`} htmlFor="act-cost">
                    <input id="act-cost" inputMode="numeric" className={inputClass} value={data.cost} onChange={(e) => set('cost', e.target.value.replace(/\D/g, ''))} />
                </Field>

                <div className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-3.5">
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
                                <label className="mt-6 flex h-11 items-center justify-between gap-2 rounded-xl border border-field px-3 text-sm font-bold">
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
