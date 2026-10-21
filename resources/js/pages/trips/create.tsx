import { Field, IconLink, inputClass, PrimaryButton } from '@/components/tabi/ui';
import TripLayout from '@/layouts/trip-layout';
import { type TripHeader } from '@/lib/trip';
import { cn } from '@/lib/utils';
import { router, useForm } from '@inertiajs/react';
import { ChevronLeft } from 'lucide-react';
import { type FormEvent } from 'react';

const COLORS = ['#2F43C9', '#C7402A', '#1F7A4D', '#7A4BC2', '#A85A12', '#0E7490'];

export default function TripForm({ trip }: { trip?: TripHeader }) {
    const form = useForm({
        name: trip?.name ?? '',
        destination: trip?.destination ?? '',
        start_date: trip?.start_date ?? '',
        end_date: trip?.end_date ?? '',
        color: trip?.color ?? COLORS[0],
        currency: trip?.currency ?? 'EUR',
    });

    const submit = (e: FormEvent) => {
        e.preventDefault();
        if (trip) form.put(route('trips.update', trip.id));
        else form.post(route('trips.store'));
    };

    const destroy = () => {
        if (trip && confirm(`Eliminare «${trip.name}» per tutti i partecipanti? Non si può annullare.`)) {
            router.delete(route('trips.destroy', trip.id));
        }
    };

    return (
        <TripLayout title={trip ? 'Modifica viaggio' : 'Nuovo viaggio'}>
            <div className="flex items-center gap-3">
                <IconLink label="Indietro" href={trip ? route('trips.show', trip.id) : route('trips.index')}>
                    <ChevronLeft className="size-5" aria-hidden="true" />
                </IconLink>
                <h1 className="text-2xl font-extrabold tracking-tight">{trip ? 'Modifica viaggio' : 'Nuovo viaggio'}</h1>
            </div>

            <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
                <Field label="Nome" htmlFor="name" error={form.errors.name}>
                    <input id="name" className={inputClass} value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} placeholder="Giappone" required autoFocus />
                </Field>
                <Field label="Dove (città o tappe)" htmlFor="destination" error={form.errors.destination}>
                    <input
                        id="destination"
                        className={inputClass}
                        value={form.data.destination}
                        onChange={(e) => form.setData('destination', e.target.value)}
                        placeholder="Tokyo, Kyoto, Osaka"
                    />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Partenza" htmlFor="start_date" error={form.errors.start_date}>
                        <input id="start_date" type="date" className={inputClass} value={form.data.start_date} onChange={(e) => form.setData('start_date', e.target.value)} required />
                    </Field>
                    <Field label="Ritorno" htmlFor="end_date" error={form.errors.end_date}>
                        <input
                            id="end_date"
                            type="date"
                            className={inputClass}
                            value={form.data.end_date}
                            min={form.data.start_date || undefined}
                            onChange={(e) => form.setData('end_date', e.target.value)}
                            required
                        />
                    </Field>
                </div>
                <div className="grid grid-cols-[1fr_auto] items-end gap-3">
                    <fieldset>
                        <legend className="mb-1.5 text-xs font-bold text-mute">Colore</legend>
                        <div className="flex gap-2">
                            {COLORS.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    aria-label={`Colore ${c}`}
                                    aria-pressed={form.data.color === c}
                                    onClick={() => form.setData('color', c)}
                                    className={cn('size-9 rounded-full ring-offset-2 ring-offset-paper transition-shadow', form.data.color === c && 'ring-2 ring-ink')}
                                    style={{ background: c }}
                                />
                            ))}
                        </div>
                    </fieldset>
                    <Field label="Valuta" htmlFor="currency" error={form.errors.currency}>
                        <select id="currency" className={cn(inputClass, 'w-24')} value={form.data.currency} onChange={(e) => form.setData('currency', e.target.value)}>
                            {['EUR', 'JPY', 'USD', 'GBP', 'CHF'].map((c) => (
                                <option key={c}>{c}</option>
                            ))}
                        </select>
                    </Field>
                </div>

                <PrimaryButton type="submit" disabled={form.processing} className="mt-2">
                    {trip ? 'Salva' : 'Crea viaggio'}
                </PrimaryButton>

                {trip?.role === 'owner' && (
                    <button type="button" onClick={destroy} className="h-11 text-sm font-bold text-verm-ink hover:underline">
                        Elimina viaggio
                    </button>
                )}
            </form>
        </TripLayout>
    );
}
