import { AddressField } from '@/components/address-field';
import { useAskAiPlace } from '@/components/ask-ai-place';
import { useConfirm } from '@/components/confirm-dialog';
import { BottomSheet } from '@/components/bottom-sheet';
import { PlaceInput } from '@/components/place-input';
import { TimeField } from '@/components/time-field';
import { Field, FormError, inputClass, PrimaryButton } from '@/components/ui';
import { api } from '@/lib/api';
import { hotelOn } from '@/lib/insights';
import { type Coordinates } from '@/lib/places';
import { useFocus, usePeersOn } from '@/lib/presence';
import { ACTIVITY_TYPES, formatDayMonth, formatWeekdayShort, type Activity, type ActivityType, type Stay, type TripHeader } from '@/lib/trip';
import { useAction } from '@/lib/use-action';
import { cn } from '@/lib/utils';
import { CalendarSync, Ticket } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';

export interface ActivityDraft {
    date?: string | null;
    start_time?: string | null;
    type?: ActivityType;
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
    /** To fill "back to the hotel" with the right hotel for the day. */
    stays?: Stay[];
    /** Tickets and documents tied to this activity, and how to add one. */
    documentCount?: number;
    onAddDocument?: (activityId: number) => void;
    /** One-tap move to another day, without going through the form. */
    onMove?: (activity: Activity) => void;
}

const DURATIONS = [30, 60, 90, 120, 180, 240, 360];
const HOTEL_TITLE = 'Rientro in hotel';

export function ActivitySheet({ trip, days, open, onOpenChange, activity, draft, near, city, stays = [], documentCount = 0, onAddDocument, onMove }: Props) {
    const [data, setData] = useState(initial);
    const { run, pending, error, clearError } = useAction();
    const confirm = useConfirm();
    useFocus(open, activity ? { kind: 'activity', id: activity.id } : { kind: 'new-activity', date: draft?.date ?? null });
    const alsoEditing = usePeersOn((f) => !!activity && f?.kind === 'activity' && f.id === activity.id);
    const ai = useAskAiPlace(trip.id, { query: data.title, hint: data.location, city: data.city || city, kind: 'activity' }, (c) =>
        setData((d) => ({ ...d, location: c.address, city: d.city || c.city || '', latitude: c.latitude, longitude: c.longitude })),
    );
    const set = <K extends keyof typeof data>(key: K, value: (typeof data)[K]) => setData((d) => ({ ...d, [key]: value }));

    /** Title, address and point of the hotel to go back to on `date`. */
    function hotelFill(date: string) {
        const hotel = date ? hotelOn(stays, date) : undefined;
        if (!hotel) return { title: HOTEL_TITLE };
        return { title: `${HOTEL_TITLE} · ${hotel.name}`, location: hotel.address ?? '', city: hotel.city, latitude: hotel.latitude, longitude: hotel.longitude };
    }

    function initial() {
        const base = {
            type: (activity?.type ?? draft?.type ?? 'visit') as ActivityType,
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
        return !activity && base.type === 'hotel' ? { ...base, ...hotelFill(base.date) } : base;
    }

    // the title is still ours (empty or auto-filled): safe to refill it with the hotel
    const autoTitle = (title: string) => !title.trim() || title.startsWith(HOTEL_TITLE);
    const pickType = (type: ActivityType) => setData((d) => ({ ...d, type, ...(type === 'hotel' && autoTitle(d.title) ? hotelFill(d.date) : {}) }));
    const pickDate = (date: string) => setData((d) => ({ ...d, date, ...(d.type === 'hotel' && autoTitle(d.title) ? hotelFill(date) : {}) }));

    useEffect(() => {
        if (open) {
            setData(initial());
            clearError();
            ai.reset();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, activity?.id, draft?.date, draft?.start_time, draft?.type]);

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
                {activity && onMove && (
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-card px-3.5 py-2.5">
                        <span className="flex min-w-0 items-center gap-2 text-sm font-bold">
                            <CalendarSync className="size-4 shrink-0 text-indigo" aria-hidden="true" />
                            <span className="truncate">{activity.date ? `${formatWeekdayShort(activity.date).toLowerCase()} ${formatDayMonth(activity.date)}` : 'Nella lista idee'}</span>
                        </span>
                        <button
                            type="button"
                            onClick={() => {
                                onOpenChange(false);
                                onMove(activity);
                            }}
                            className="h-9 shrink-0 rounded-[10px] bg-indigo px-3 text-xs font-bold text-on-indigo hover:bg-indigo-deep"
                        >
                            {activity.date ? 'Sposta di giorno' : 'Metti in un giorno'}
                        </button>
                    </div>
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
                                    onClick={() => pickType(type)}
                                    className={cn(
                                        'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-bold transition-colors',
                                        active ? 'border-ink bg-ink text-paper' : 'border-field bg-card hover:bg-hover',
                                    )}
                                >
                                    <Icon className="size-4" aria-hidden="true" />
                                    {/* as a choice it is an action: a break at the hotel, at any time of day */}
                                    {type === 'hotel' ? 'Torna in hotel' : label}
                                </button>
                            );
                        })}
                    </div>
                    {data.type === 'hotel' && (
                        <p className="mt-2 text-xs text-mute">
                            Una pausa in hotel, anche nel pomeriggio: nome e indirizzo li prendo dall'alloggio di quel giorno. Scegli tu orario e durata.
                        </p>
                    )}
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
                        onAskAi={ai.ask}
                    />
                    {ai.element}
                </Field>

                <Field label="Indirizzo" htmlFor="act-address">
                    <AddressField
                        id="act-address"
                        city={data.city || city}
                        near={near}
                        value={data.location}
                        hasPosition={data.latitude != null}
                        onChange={(location) => setData((d) => ({ ...d, location, latitude: null, longitude: null }))}
                        onPick={({ address, ...pick }) => setData((d) => ({ ...d, ...pick, location: address, city: d.city || pick.city || '' }))}
                    />
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
                    <select id="act-date" className={inputClass} value={data.date} onChange={(e) => pickDate(e.target.value)}>
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

                {activity && onAddDocument && (
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-card px-3.5 py-2.5">
                        <span className="flex items-center gap-2 text-sm font-bold">
                            <Ticket className="size-4 text-indigo" aria-hidden="true" />
                            {documentCount === 0 ? 'Nessun biglietto' : documentCount === 1 ? '1 biglietto o documento' : `${documentCount} biglietti o documenti`}
                        </span>
                        <button
                            type="button"
                            onClick={() => {
                                onOpenChange(false);
                                onAddDocument(activity.id);
                            }}
                            className="h-9 shrink-0 rounded-[10px] border border-field px-3 text-xs font-bold hover:bg-hover"
                        >
                            Aggiungi biglietto
                        </button>
                    </div>
                )}

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
