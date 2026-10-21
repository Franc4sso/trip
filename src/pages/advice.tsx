import { WithTrip } from '@/components/states';
import TripLayout from '@/components/trip-layout';
import { Card, Chip, FormError, IconLink, inputClass } from '@/components/ui';
import { itineraryHash, itineraryText, type Advice, type Suggestion } from '@/lib/advice';
import { api } from '@/lib/api';
import { paths } from '@/lib/paths';
import { supabase } from '@/lib/supabase';
import { formatDayMonth, type Activity, type Stay, type TripHeader } from '@/lib/trip';
import { useAction } from '@/lib/use-action';
import { cn } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ChevronLeft, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';

type AdviceResponse = Advice & { cached: boolean; created_at: string; itinerary_hash: string };

const KIND: Record<Suggestion['kind'], { label: string; tone: string }> = {
    gap: { label: 'Giorni e buchi', tone: 'text-sun-ink' },
    conflict: { label: 'Conflitto', tone: 'text-verm-ink' },
    timing: { label: 'Orari furbi', tone: 'text-indigo' },
    booking: { label: 'Prenotazioni', tone: 'text-verm-ink' },
    balance: { label: 'Equilibrio', tone: 'text-grape' },
    idea: { label: 'Idea', tone: 'text-leaf' },
    practical: { label: 'Pratico', tone: 'text-mute' },
};

export default function AdviceRoute() {
    return <WithTrip>{({ trip, activities, stays }) => <AdvicePage trip={trip} activities={activities} stays={stays} />}</WithTrip>;
}

async function askAdvice(body: { tripId: number; question?: string; refresh?: boolean }): Promise<AdviceResponse> {
    const { data, error } = await supabase.functions.invoke<AdviceResponse>('advice', { body });
    if (error) {
        // the function answers errors as { error: "..." } in Italian
        const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
        throw new Error(detail?.error ?? 'Consigli non disponibili ora: riprova tra poco.');
    }
    return data!;
}

function AdvicePage({ trip, activities, stays }: { trip: TripHeader; activities: Activity[]; stays: Stay[] }) {
    const queryClient = useQueryClient();
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState<AdviceResponse | null>(null);
    const [busy, setBusy] = useState<'refresh' | 'ask' | null>(null);
    const [error, setError] = useState<string | null>(null);

    // stored suggestions + whether the trip changed since: no model call just for opening the page
    const stored = useQuery({
        queryKey: ['advice', trip.id],
        queryFn: async () => {
            const { data } = await supabase.from('trip_advice').select('payload, itinerary_hash, created_at').eq('trip_id', trip.id).maybeSingle();
            return data as { payload: Advice; itinerary_hash: string; created_at: string } | null;
        },
    });
    const currentHash = useQuery({
        queryKey: ['advice-hash', trip.id, activities, stays],
        queryFn: () => itineraryHash(itineraryText(trip, activities, stays)),
    });
    const stale = !!stored.data && !!currentHash.data && stored.data.itinerary_hash !== currentHash.data;

    const refresh = async () => {
        setBusy('refresh');
        setError(null);
        try {
            await askAdvice({ tripId: trip.id, refresh: true });
            await queryClient.invalidateQueries({ queryKey: ['advice', trip.id] });
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(null);
        }
    };

    const ask = async (e: FormEvent) => {
        e.preventDefault();
        if (!question.trim()) return;
        setBusy('ask');
        setError(null);
        try {
            setAnswer(await askAdvice({ tripId: trip.id, question }));
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(null);
        }
    };

    const suggestions = stored.data?.payload.suggestions ?? [];

    return (
        <TripLayout title={`Consigli · ${trip.name}`} trip={trip} tab="trip">
            <div className="flex items-center gap-3">
                <IconLink label="Panoramica" to={paths.trip(trip.id)}>
                    <ChevronLeft className="size-5" aria-hidden="true" />
                </IconLink>
                <h1 className="text-[28px] font-extrabold tracking-tight">Consigli</h1>
            </div>

            <form onSubmit={ask} className="relative mt-4">
                <label htmlFor="ask" className="sr-only">
                    Chiedi qualcosa sul viaggio
                </label>
                <input
                    id="ask"
                    className={cn(inputClass, 'h-12 pr-12')}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Chiedi: dove mangiamo vicino al ryokan?"
                    maxLength={500}
                />
                <button
                    type="submit"
                    aria-label="Chiedi"
                    disabled={busy !== null || !question.trim()}
                    className="absolute top-1.5 right-1.5 flex size-9 items-center justify-center rounded-[10px] bg-indigo text-paper disabled:opacity-50"
                >
                    {busy === 'ask' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="size-4" aria-hidden="true" />}
                </button>
            </form>

            <div className="mt-3">
                <FormError message={error} />
            </div>

            {answer && (
                <Card className="mt-3 border-indigo/40">
                    <p className="text-xs font-extrabold tracking-[0.06em] text-indigo uppercase">Risposta</p>
                    <p className="mt-1 text-sm leading-relaxed whitespace-pre-line">{answer.answer}</p>
                    {answer.suggestions.length > 0 && (
                        <div className="mt-3 flex flex-col gap-2">
                            {answer.suggestions.map((s, i) => (
                                <SuggestionCard key={i} trip={trip} suggestion={s} />
                            ))}
                        </div>
                    )}
                </Card>
            )}

            <div className="mt-5 flex items-center justify-between">
                <h2 className="text-sm font-extrabold">Per il vostro itinerario</h2>
                <button onClick={refresh} disabled={busy !== null} className="flex h-9 items-center gap-1.5 rounded-[10px] px-2 text-[13px] font-bold text-indigo hover:bg-indigo-soft disabled:opacity-60">
                    {busy === 'refresh' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />}
                    {suggestions.length ? 'Aggiorna' : 'Genera consigli'}
                </button>
            </div>
            {stored.data && (
                <p className={cn('mt-0.5 text-xs', stale ? 'font-semibold text-sun-ink' : 'text-mute')}>
                    {stale ? 'Il viaggio è cambiato da allora: aggiorna per consigli nuovi.' : `Aggiornati il ${formatDayMonth(stored.data.created_at.slice(0, 10))}.`}
                </p>
            )}

            {busy === 'refresh' && <p className="mt-3 text-[13px] text-mute">Sto leggendo il vostro itinerario… può volerci fino a un minuto.</p>}

            {stored.isPending ? (
                <p className="mt-4 text-sm text-mute">Carico…</p>
            ) : suggestions.length === 0 ? (
                <div className="mt-3 rounded-[20px] border border-dashed border-dash p-5 text-center">
                    <Sparkles className="mx-auto size-6 text-indigo" aria-hidden="true" />
                    <p className="mt-2 text-sm font-bold">Ancora nessun consiglio</p>
                    <p className="mt-1 text-[13px] text-mute">Claude legge giorni, buchi, alloggi e prenotazioni e vi propone cosa sistemare.</p>
                </div>
            ) : (
                <div className="mt-3 flex flex-col gap-2.5">
                    {suggestions.map((s, i) => (
                        <SuggestionCard key={i} trip={trip} suggestion={s} />
                    ))}
                </div>
            )}

            <p className="mt-6 text-[11px] text-faint">Consigli generati da Claude (Anthropic): orari e chiusure vanno sempre verificati.</p>
        </TripLayout>
    );
}

function SuggestionCard({ trip, suggestion: s }: { trip: TripHeader; suggestion: Suggestion }) {
    const { run, pending, error } = useAction();
    const [added, setAdded] = useState(false);
    const inTrip = (d: string | null) => !!d && d >= trip.start_date && d <= trip.end_date;

    const add = async () => {
        if (!s.add) return;
        const date = inTrip(s.add.date) ? s.add.date : null;
        const ok = await run(() =>
            api.addActivity(trip.id, {
                title: s.add!.title.slice(0, 200),
                date,
                start_time: date && s.add!.start_time && /^\d{2}:\d{2}$/.test(s.add!.start_time) ? s.add!.start_time : null,
                duration_minutes: s.add!.duration_minutes && s.add!.duration_minutes > 0 ? Math.min(s.add!.duration_minutes, 1440) : null,
                type: s.add!.type,
                city: s.add!.city,
            }),
        );
        if (ok) setAdded(true);
    };

    return (
        <Card className="p-3.5">
            <div className="flex items-center justify-between gap-2">
                <span className={cn('text-[11px] font-extrabold tracking-[0.06em] uppercase', KIND[s.kind].tone)}>{KIND[s.kind].label}</span>
                {inTrip(s.date) && (
                    <Link to={paths.day(trip.id, s.date!)} className="text-xs font-bold text-indigo hover:underline">
                        {formatDayMonth(s.date!)}
                    </Link>
                )}
            </div>
            <p className="mt-1 text-[15px] font-extrabold">{s.title}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{s.body}</p>
            {s.add && trip.can_edit && (
                <div className="mt-2.5">
                    {added ? (
                        <Chip className="bg-leaf-soft text-leaf">Aggiunto{inTrip(s.add.date) ? ` al ${formatDayMonth(s.add.date!)}` : ' alla lista idee'}</Chip>
                    ) : (
                        <button onClick={add} disabled={pending} className="h-9 rounded-[10px] bg-ink px-3 text-xs font-extrabold text-paper disabled:opacity-60">
                            + {s.add.title}
                            {inTrip(s.add.date) ? ` al ${formatDayMonth(s.add.date!)}` : ' alla lista idee'}
                        </button>
                    )}
                    <FormError message={error} />
                </div>
            )}
        </Card>
    );
}
