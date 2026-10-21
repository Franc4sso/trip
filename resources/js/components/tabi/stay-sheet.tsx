import { BottomSheet } from '@/components/tabi/bottom-sheet';
import { Field, inputClass, PrimaryButton } from '@/components/tabi/ui';
import { type Stay, type TripHeader } from '@/lib/trip';
import { router, useForm } from '@inertiajs/react';
import { type FormEvent, useEffect } from 'react';

interface Props {
    trip: TripHeader;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    stay?: Stay | null;
    /** Pre-filled check-in, e.g. the first night without a place to sleep. */
    checkIn?: string;
}

export function StaySheet({ trip, open, onOpenChange, stay, checkIn }: Props) {
    const form = useForm(blank());

    function blank() {
        return {
            name: stay?.name ?? '',
            city: stay?.city ?? '',
            address: stay?.address ?? '',
            check_in: stay?.check_in ?? checkIn ?? trip.start_date,
            check_out: stay?.check_out ?? '',
            confirmed: stay?.confirmed ?? false,
            booking_ref: stay?.booking_ref ?? '',
            cost: stay?.cost?.toString() ?? '',
        };
    }

    useEffect(() => {
        if (open) {
            form.setData(blank());
            form.clearErrors();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, stay?.id, checkIn]);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.transform((d) => ({ ...d, cost: d.cost === '' ? null : Number(d.cost) }));
        const opts = { preserveScroll: true, onSuccess: () => onOpenChange(false) };
        if (stay) form.put(route('trips.stays.update', [trip.id, stay.id]), opts);
        else form.post(route('trips.stays.store', trip.id), opts);
    };

    const remove = () => {
        if (stay && confirm(`Eliminare l'alloggio «${stay.name}»?`)) {
            router.delete(route('trips.stays.destroy', [trip.id, stay.id]), { preserveScroll: true, onSuccess: () => onOpenChange(false) });
        }
    };

    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title={stay ? 'Modifica alloggio' : 'Nuovo alloggio'}
            footer={
                <PrimaryButton form="stay-form" type="submit" disabled={form.processing} className="w-full">
                    {stay ? 'Salva' : 'Aggiungi alloggio'}
                </PrimaryButton>
            }
        >
            <form id="stay-form" onSubmit={submit} className="flex flex-col gap-4">
                <Field label="Nome" htmlFor="stay-name" error={form.errors.name}>
                    <input id="stay-name" className={inputClass} value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} placeholder="Hotel, ryokan, Airbnb…" required />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Città" htmlFor="stay-city" error={form.errors.city}>
                        <input id="stay-city" className={inputClass} value={form.data.city} onChange={(e) => form.setData('city', e.target.value)} required />
                    </Field>
                    <Field label="Costo totale" htmlFor="stay-cost" error={form.errors.cost}>
                        <input id="stay-cost" inputMode="numeric" className={inputClass} value={form.data.cost} onChange={(e) => form.setData('cost', e.target.value.replace(/\D/g, ''))} placeholder={trip.currency} />
                    </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Check-in" htmlFor="stay-in" error={form.errors.check_in}>
                        <input id="stay-in" type="date" min={trip.start_date} max={trip.end_date} className={inputClass} value={form.data.check_in} onChange={(e) => form.setData('check_in', e.target.value)} required />
                    </Field>
                    <Field label="Check-out" htmlFor="stay-out" error={form.errors.check_out}>
                        <input id="stay-out" type="date" min={form.data.check_in} max={trip.end_date} className={inputClass} value={form.data.check_out} onChange={(e) => form.setData('check_out', e.target.value)} required />
                    </Field>
                </div>
                <Field label="Indirizzo" htmlFor="stay-address" error={form.errors.address}>
                    <input id="stay-address" className={inputClass} value={form.data.address} onChange={(e) => form.setData('address', e.target.value)} />
                </Field>
                <Field label="Codice prenotazione" htmlFor="stay-ref" error={form.errors.booking_ref}>
                    <input id="stay-ref" className={inputClass} value={form.data.booking_ref} onChange={(e) => form.setData('booking_ref', e.target.value)} />
                </Field>
                <label className="flex min-h-11 items-center justify-between rounded-2xl border border-line bg-white px-4 text-sm font-bold">
                    Prenotazione confermata
                    <input type="checkbox" className="size-5 accent-indigo" checked={form.data.confirmed} onChange={(e) => form.setData('confirmed', e.target.checked)} />
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
