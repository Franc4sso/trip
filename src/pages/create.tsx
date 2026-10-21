import { useConfirm } from '@/components/confirm-dialog';
import { PlaceInput } from '@/components/place-input';
import { addStop, lastStop } from '@/lib/places';
import { ErrorScreen, WithTrip } from '@/components/states';
import TripLayout from '@/components/trip-layout';
import { Field, FormError, IconLink, inputClass, PrimaryButton } from '@/components/ui';
import { api } from '@/lib/api';
import { paths } from '@/lib/paths';
import { type TripHeader } from '@/lib/trip';
import { useAction } from '@/lib/use-action';
import { cn } from '@/lib/utils';
import { ChevronLeft } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

const COLORS = ['#2F43C9', '#C7402A', '#1F7A4D', '#7A4BC2', '#A85A12', '#0E7490'];
const MAX_DAYS = 90;


export default function TripFormRoute() {
    const { tripId } = useParams();
    if (!tripId) return <TripForm />;
    return <WithTrip>{({ trip }) => (trip.can_edit ? <TripForm trip={trip} /> : <ErrorScreen message="Puoi solo guardare questo viaggio." />)}</WithTrip>;
}

function TripForm({ trip }: { trip?: TripHeader }) {
    const navigate = useNavigate();
    const { run, pending, error } = useAction();
    const confirm = useConfirm();
    const [dateError, setDateError] = useState<string | null>(null);
    const [data, setData] = useState({
        name: trip?.name ?? '',
        destination: trip?.destination ?? '',
        start_date: trip?.start_date ?? '',
        end_date: trip?.end_date ?? '',
        color: trip?.color ?? COLORS[0],
        currency: trip?.currency ?? 'EUR',
    });
    const set = <K extends keyof typeof data>(key: K, value: string) => setData((d) => ({ ...d, [key]: value }));

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        const days = (Date.parse(data.end_date) - Date.parse(data.start_date)) / 86_400_000;
        if (days < 0) return setDateError('Il ritorno deve essere dopo la partenza.');
        if (days > MAX_DAYS) return setDateError(`Un viaggio può durare al massimo ${MAX_DAYS} giorni.`);
        setDateError(null);

        const input = { ...data, name: data.name.trim(), destination: data.destination.trim() || null };
        let id = trip?.id;
        const ok = await run(async () => {
            if (trip) await api.updateTrip(trip.id, input);
            else id = await api.createTrip(input);
        });
        if (ok && id) navigate(paths.trip(id), { replace: true });
    };

    const destroy = async () => {
        if (!trip) return;
        const ok = await confirm({
            title: `Eliminare «${trip.name}»?`,
            description: 'Il viaggio sparisce per tutti i partecipanti, con giorni, alloggi e spese. Non si può annullare.',
            confirmLabel: 'Elimina viaggio',
        });
        if (ok && (await run(() => api.deleteTrip(trip.id)))) {
            navigate(paths.trips(), { replace: true });
        }
    };

    return (
        <TripLayout title={trip ? 'Modifica viaggio' : 'Nuovo viaggio'}>
            <div className="flex items-center gap-3">
                <IconLink label="Indietro" to={trip ? paths.trip(trip.id) : paths.trips()}>
                    <ChevronLeft className="size-5" aria-hidden="true" />
                </IconLink>
                <h1 className="text-2xl font-extrabold tracking-tight">{trip ? 'Modifica viaggio' : 'Nuovo viaggio'}</h1>
            </div>

            <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
                <FormError message={error} />
                <Field label="Nome" htmlFor="name">
                    <input id="name" className={inputClass} value={data.name} onChange={(e) => set('name', e.target.value)} placeholder="Giappone" required maxLength={120} autoFocus={!trip} />
                </Field>
                <Field label="Dove (città o tappe)" htmlFor="destination">
                    <PlaceInput
                        id="destination"
                        kind="city"
                        value={data.destination}
                        onChange={(text) => set('destination', text)}
                        onSelect={(place) => set('destination', addStop(data.destination, place.name))}
                        queryOf={lastStop}
                        placeholder="Tokyo, Kyoto, Osaka"
                        maxLength={200}
                    />
                    <p className="mt-1 text-xs text-mute">Cerca una città e sceglila: si aggiunge alle tappe. Separa più tappe con una virgola.</p>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Partenza" htmlFor="start_date">
                        <input id="start_date" type="date" className={inputClass} value={data.start_date} onChange={(e) => set('start_date', e.target.value)} required />
                    </Field>
                    <Field label="Ritorno" htmlFor="end_date" error={dateError}>
                        <input id="end_date" type="date" className={inputClass} value={data.end_date} min={data.start_date || undefined} onChange={(e) => set('end_date', e.target.value)} required />
                    </Field>
                </div>
                {trip && <p className="-mt-2 text-xs text-mute">Se accorci il viaggio, le attività dei giorni tolti restano salvate ma non compaiono nei giorni.</p>}
                <div className="flex flex-col gap-4">
                    <fieldset>
                        <legend className="mb-1.5 text-xs font-bold text-mute">Colore</legend>
                        <div className="flex flex-wrap gap-2">
                            {COLORS.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    aria-label={`Colore ${c}`}
                                    aria-pressed={data.color === c}
                                    onClick={() => set('color', c)}
                                    className={cn('size-9 rounded-full ring-offset-2 ring-offset-paper transition-shadow', data.color === c && 'ring-2 ring-ink')}
                                    style={{ background: c }}
                                />
                            ))}
                        </div>
                    </fieldset>
                    <Field label="Valuta" htmlFor="currency">
                        <select id="currency" className={inputClass} value={data.currency} onChange={(e) => set('currency', e.target.value)}>
                            {['EUR', 'JPY', 'USD', 'GBP', 'CHF'].map((c) => (
                                <option key={c}>{c}</option>
                            ))}
                        </select>
                    </Field>
                </div>

                <PrimaryButton type="submit" disabled={pending} className="mt-2">
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
