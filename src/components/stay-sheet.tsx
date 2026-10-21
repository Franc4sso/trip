import { useConfirm } from '@/components/confirm-dialog';
import { BottomSheet } from '@/components/bottom-sheet';
import { PlaceInput } from '@/components/place-input';
import { Field, FormError, inputClass, PrimaryButton } from '@/components/ui';
import { api } from '@/lib/api';
import { type Stay, type TripHeader } from '@/lib/trip';
import { useFocus } from '@/lib/presence';
import { useAction } from '@/lib/use-action';
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
            clearError();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, stay?.id, checkIn]);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        const input = {
            ...data,
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
                <FormError message={error} />
                <Field label="Nome (cerca l'hotel per compilare indirizzo e città)" htmlFor="stay-name">
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
                    />
                </Field>
                <Field label="Città" htmlFor="stay-city">
                    <PlaceInput id="stay-city" kind="city" value={data.city} onChange={(city) => set('city', city)} onSelect={(place) => set('city', place.name)} required maxLength={120} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Check-in" htmlFor="stay-in">
                        <input id="stay-in" type="date" min={trip.start_date} max={trip.end_date} className={inputClass} value={data.check_in} onChange={(e) => set('check_in', e.target.value)} required />
                    </Field>
                    <Field label="Check-out" htmlFor="stay-out">
                        <input id="stay-out" type="date" min={data.check_in} max={trip.end_date} className={inputClass} value={data.check_out} onChange={(e) => set('check_out', e.target.value)} required />
                    </Field>
                </div>
                <Field label="Indirizzo" htmlFor="stay-address">
                    <input id="stay-address" className={inputClass} value={data.address} onChange={(e) => set('address', e.target.value)} maxLength={255} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                    <Field label={`Costo totale (${trip.currency})`} htmlFor="stay-cost">
                        <input id="stay-cost" inputMode="numeric" className={inputClass} value={data.cost} onChange={(e) => set('cost', e.target.value.replace(/\D/g, ''))} />
                    </Field>
                    <Field label="Codice prenotazione" htmlFor="stay-ref">
                        <input id="stay-ref" className={inputClass} value={data.booking_ref} onChange={(e) => set('booking_ref', e.target.value)} maxLength={120} />
                    </Field>
                </div>
                <label className="flex min-h-11 items-center justify-between rounded-2xl border border-line bg-card px-4 text-sm font-bold">
                    Prenotazione confermata
                    <input type="checkbox" className="size-5 accent-indigo" checked={data.confirmed} onChange={(e) => set('confirmed', e.target.checked)} />
                </label>
                {stay && (
                    <button type="button" onClick={remove} className="h-11 text-sm font-bold text-verm-ink hover:underline">
                        Elimina alloggio
                    </button>
                )}
            </form>
        </BottomSheet>
    );
}
