import { AddressField } from '@/components/address-field';
import { useAskAiPlace } from '@/components/ask-ai-place';
import { useConfirm } from '@/components/confirm-dialog';
import { BottomSheet } from '@/components/bottom-sheet';
import { DetailRow, DetailRows, GroupLabel, Tile, tileControl } from '@/components/form-rows';
import { PlaceInput } from '@/components/place-input';
import { Field, FormError, inputClass, PrimaryButton } from '@/components/ui';
import { api } from '@/lib/api';
import { geocodeAddress } from '@/lib/places';
import { daysBetween, parseDate, type Stay, type TripHeader } from '@/lib/trip';
import { useFocus } from '@/lib/presence';
import { useAction } from '@/lib/use-action';
import { cn, openPicker } from '@/lib/utils';
import { Check, Hash, MapPin } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';

interface Props {
    trip: TripHeader;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    stay?: Stay | null;
    /** Pre-filled check-in, e.g. the first night without a place to sleep. */
    checkIn?: string;
}

export function StaySheet({ trip, open, onOpenChange, stay, checkIn }: Props) {
    const [data, setData] = useState(initial);
    const { run, pending, error, clearError } = useAction();
    const confirm = useConfirm();
    useFocus(open, { kind: 'stay', id: stay?.id ?? null });
    const ai = useAskAiPlace(trip.id, { query: data.name, hint: data.address, city: data.city, kind: 'stay' }, (c) =>
        setData((d) => ({ ...d, address: c.address, city: d.city || c.city || '', latitude: c.latitude, longitude: c.longitude })),
    );
    // the city lives in a folded row: checked here, not by the browser
    const [formError, setFormError] = useState<string | null>(null);
    const [openRow, setOpenRow] = useState<'where' | 'ref' | null>(null);
    const toggleRow = (row: 'where' | 'ref') => setOpenRow((r) => (r === row ? null : row));
    const set = <K extends keyof typeof data>(key: K, value: (typeof data)[K]) => setData((d) => ({ ...d, [key]: value }));

    function initial() {
        return {
            name: stay?.name ?? '',
            city: stay?.city ?? '',
            address: stay?.address ?? '',
            check_in: stay?.check_in ?? checkIn ?? trip.start_date,
            check_out: stay?.check_out ?? '',
            confirmed: stay?.confirmed ?? false,
            booking_ref: stay?.booking_ref ?? '',
            cost: stay?.cost?.toString() ?? '',
            latitude: stay?.latitude ?? null,
            longitude: stay?.longitude ?? null,
        };
    }

    useEffect(() => {
        if (open) {
            setData(initial());
            ai.reset();
            clearError();
            setFormError(null);
            setOpenRow(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, stay?.id, checkIn]);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (!data.city.trim()) {
            setOpenRow('where');
            return setFormError("Manca la città dell'alloggio: serve per il programma dei giorni.");
        }
        setFormError(null);
        // a written address saved straight away still gets its point on the map
        const point =
            data.latitude == null && data.address.trim().length >= 6 ? await geocodeAddress(data.address.trim(), { city: data.city }).catch(() => null) : null;
        const input = {
            ...data,
            ...(point && { latitude: point.latitude, longitude: point.longitude }),
            name: data.name.trim(),
            city: data.city.trim(),
            address: data.address.trim() || null,
            booking_ref: data.booking_ref.trim() || null,
            cost: data.cost === '' ? null : Number(data.cost),
            notes: stay?.notes ?? null,
        };
        const ok = await run(() => (stay ? api.updateStay(stay.id, input) : api.addStay(trip.id, input)));
        if (ok) onOpenChange(false);
    };

    const remove = async () => {
        if (!stay) return;
        const ok = await confirm({ title: `Eliminare l'alloggio «${stay.name}»?`, description: 'Le notti tornano senza alloggio per tutto il gruppo.' });
        if (ok && (await run(() => api.deleteStay(stay.id)))) onOpenChange(false);
    };

    const nights = data.check_in && data.check_out > data.check_in ? daysBetween(parseDate(data.check_in), parseDate(data.check_out)) : 0;

    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title={stay ? 'Modifica alloggio' : 'Nuovo alloggio'}
            footer={
                <PrimaryButton form="stay-form" type="submit" disabled={pending} className="w-full">
                    {stay ? 'Salva' : 'Aggiungi alloggio'}
                </PrimaryButton>
            }
        >
            <form id="stay-form" onSubmit={submit} className="flex flex-col gap-4">
                <FormError message={formError ?? error} />
                <div className="rounded-[18px] border border-line bg-card p-3">
                    <GroupLabel htmlFor="stay-name">Hotel</GroupLabel>
                    <PlaceInput
                        id="stay-name"
                        value={data.name}
                        onChange={(name) => set('name', name)}
                        onSelect={(place) =>
                            setData((d) => ({
                                ...d,
                                name: place.name,
                                city: place.city ?? d.city,
                                address: place.address ?? place.detail,
                                latitude: place.latitude,
                                longitude: place.longitude,
                            }))
                        }
                        placeholder="Hotel, ryokan, Airbnb…"
                        required
                        maxLength={200}
                        onAskAi={ai.ask}
                    />
                    {ai.element}
                    {(data.city || data.address) && <p className="mt-2 truncate px-0.5 text-xs text-mute">{[data.address, data.city].filter(Boolean).join(' · ')}</p>}
                </div>

                <fieldset className="min-w-0">
                    <legend className="mb-1.5 block text-[11px] font-bold tracking-[0.04em] text-mute uppercase">Notti</legend>
                    <div className="grid grid-cols-2 gap-2">
                        <Tile label="Check-in" htmlFor="stay-in">
                            <input id="stay-in" type="date" min={trip.start_date} max={trip.end_date} className={tileControl} onClick={openPicker} value={data.check_in} onChange={(e) => set('check_in', e.target.value)} required />
                        </Tile>
                        <Tile label="Check-out" htmlFor="stay-out">
                            <input id="stay-out" type="date" min={data.check_in} max={trip.end_date} className={tileControl} onClick={openPicker} value={data.check_out} onChange={(e) => set('check_out', e.target.value)} required />
                        </Tile>
                    </div>
                    <p className={cn('mt-1.5 text-xs font-bold', nights ? 'text-leaf' : 'text-mute')} aria-live="polite">
                        {nights ? (nights === 1 ? '1 notte' : `${nights} notti`) : 'Scegli il giorno in cui riparti.'}
                    </p>
                </fieldset>

                <div>
                    <GroupLabel>Dettagli</GroupLabel>
                    <DetailRows>
                        <DetailRow
                            icon={MapPin}
                            tint="bg-leaf-soft text-leaf"
                            label="Indirizzo"
                            value={[data.address, data.city].filter(Boolean).join(' · ') || null}
                            open={openRow === 'where'}
                            onToggle={() => toggleRow('where')}
                        >
                            <AddressField
                                id="stay-address"
                                city={data.city}
                                value={data.address}
                                hasPosition={data.latitude != null}
                                onChange={(address) => setData((d) => ({ ...d, address, latitude: null, longitude: null }))}
                                onPick={(pick) => setData((d) => ({ ...d, ...pick, city: d.city || pick.city || '' }))}
                            />
                            <Field label="Città" htmlFor="stay-city">
                                <PlaceInput id="stay-city" kind="city" value={data.city} onChange={(city) => set('city', city)} onSelect={(place) => set('city', place.name)} maxLength={120} />
                            </Field>
                        </DetailRow>
                        <DetailRow icon={Hash} tint="bg-indigo-soft text-indigo" label="Codice prenotazione" value={data.booking_ref || null} open={openRow === 'ref'} onToggle={() => toggleRow('ref')}>
                            <input id="stay-ref" aria-label="Codice prenotazione" className={inputClass} value={data.booking_ref} onChange={(e) => set('booking_ref', e.target.value)} maxLength={120} />
                        </DetailRow>
                        <label className="flex min-h-[52px] cursor-pointer items-center gap-3 px-3.5 hover:bg-hover">
                            <span className="flex size-[30px] shrink-0 items-center justify-center rounded-[9px] bg-leaf-soft text-leaf" aria-hidden="true">
                                <Check className="size-4" />
                            </span>
                            <span className="flex-1 text-sm font-bold">Prenotazione confermata</span>
                            <input type="checkbox" className="size-5 accent-leaf" checked={data.confirmed} onChange={(e) => set('confirmed', e.target.checked)} />
                        </label>
                    </DetailRows>
                </div>

                {stay && (
                    <button type="button" onClick={remove} className="h-10 self-center px-2 text-[13px] font-bold text-verm-ink hover:underline">
                        Elimina alloggio
                    </button>
                )}
            </form>
        </BottomSheet>
    );
}
