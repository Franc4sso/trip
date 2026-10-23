import { api } from '@/lib/api';
import { type LocateCandidate, type LocateRequest } from '@/lib/locate';
import { cn } from '@/lib/utils';
import { Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';

const CONFIDENCE: Record<LocateCandidate['confidence'], { label: string; tone: string }> = {
    high: { label: 'Molto probabile', tone: 'bg-leaf-soft text-leaf' },
    medium: { label: 'Probabile', tone: 'bg-sun-soft text-sun-ink' },
    low: { label: 'Da verificare', tone: 'bg-verm-soft text-verm-ink' },
};

/**
 * "Ask the AI where it is", for when the map search finds nothing for a name.
 * Hand `ask` to the name's PlaceInput and render `element` right under it;
 * a picked candidate is handed back to fill address, city and point.
 */
export function useAskAiPlace(tripId: number, request: LocateRequest, onPick: (candidate: LocateCandidate) => void) {
    const [candidates, setCandidates] = useState<LocateCandidate[] | null>(null);
    const [asking, setAsking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const query = request.query.trim();

    const ask = async () => {
        if (!query) return;
        setAsking(true);
        setError(null);
        setCandidates(null);
        try {
            const found = await api.locate(tripId, { ...request, query, hint: request.hint?.trim() || null, city: request.city?.trim() || null });
            setCandidates(found.candidates);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setAsking(false);
        }
    };

    const choose = (c: LocateCandidate) => {
        setCandidates(null);
        onPick(c);
    };

    const element = (
        <>
            {asking && (
                <p role="status" className="mt-2 flex items-center gap-2 rounded-xl bg-indigo-soft px-3 py-2 text-[13px] font-semibold text-indigo">
                    <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
                    Cerco «{query}» sul web…
                </p>
            )}

            {error && (
                <p role="alert" className="mt-2 rounded-xl bg-verm-soft px-3 py-2 text-[13px] font-semibold text-verm-ink">
                    {error}
                </p>
            )}

            {candidates && (
                <div className="mt-2 rounded-2xl border border-line bg-sunken p-2" role="region" aria-label="Luoghi proposti dall'AI">
                    {candidates.length === 0 ? (
                        <p className="px-1.5 py-1 text-[13px] text-mute">Non ho trovato niente di credibile: scrivi l'indirizzo a mano.</p>
                    ) : (
                        <>
                            <p className="px-1.5 pb-1.5 text-xs font-bold text-mute">Quale intendi? Riempio io l'indirizzo.</p>
                            <ul className="flex flex-col gap-1.5">
                                {candidates.map((c, i) => (
                                    <li key={`${c.address}-${i}`}>
                                        <button type="button" onClick={() => choose(c)} className="w-full rounded-xl border border-line bg-card px-3 py-2.5 text-left hover:bg-hover">
                                            <span className="flex items-start justify-between gap-2">
                                                <span className="min-w-0 text-sm font-bold">{c.name}</span>
                                                <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold', CONFIDENCE[c.confidence].tone)}>{CONFIDENCE[c.confidence].label}</span>
                                            </span>
                                            <span className="mt-0.5 block text-[13px]">{c.address}</span>
                                            <span className="mt-0.5 block text-xs text-mute">
                                                {c.note}
                                                {c.latitude == null && ' · senza posizione sulla mappa'}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                    <p className="flex items-center justify-between gap-2 px-1.5 pt-2 text-[11px] text-faint">
                        <span className="flex items-center gap-1">
                            <Sparkles className="size-3" aria-hidden="true" />
                            Suggerimenti AI: controlla prima di prenotare.
                        </span>
                        <button type="button" onClick={() => setCandidates(null)} className="h-7 text-xs font-bold text-mute hover:underline">
                            Chiudi
                        </button>
                    </p>
                </div>
            )}
        </>
    );

    const reset = () => {
        setCandidates(null);
        setError(null);
    };

    return { ask, reset, element };
}
