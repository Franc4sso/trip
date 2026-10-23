import { inputClass } from '@/components/ui';
import { searchPlaces, type Coordinates, type Place, type PlaceKind } from '@/lib/places';
import { cn } from '@/lib/utils';
import { Loader2, MapPin, Sparkles } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

interface Props {
    id: string;
    value: string;
    /** Free typing: the text is kept even when no suggestion is picked. */
    onChange: (text: string) => void;
    onSelect: (place: Place) => void;
    kind?: PlaceKind;
    /** Rank results close to this point first (e.g. tonight's stay). */
    near?: Coordinates | null;
    /** Rank results in this city first, for when there are no coordinates yet. */
    city?: string | null;
    /** Part of the text to search, e.g. only the last stop of "Tokyo, Kyo". */
    queryOf?: (value: string) => string;
    placeholder?: string;
    required?: boolean;
    maxLength?: number;
    autoFocus?: boolean;
    /** Offer "ask the AI" when the map has nothing, or not the right place. */
    onAskAi?: () => void;
}

const MIN_CHARS = 3;
const DEBOUNCE_MS = 300;

/** Text input with real-place suggestions (accessible combobox). */
export function PlaceInput({ id, value, onChange, onSelect, kind = 'any', near, city, queryOf, placeholder, required, maxLength, autoFocus, onAskAi }: Props) {
    const listId = useId();
    const [results, setResults] = useState<Place[]>([]);
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);
    // the query the current results answer, to tell "nothing found" from "not searched yet"
    const [searched, setSearched] = useState<string | null>(null);
    // only search after the user types, not when the field is pre-filled
    const typed = useRef(false);

    const query = (queryOf ? queryOf(value) : value).trim();

    useEffect(() => {
        const q = query;
        if (!typed.current || q.length < MIN_CHARS) {
            setResults([]);
            setSearched(null);
            setLoading(false);
            return;
        }
        const controller = new AbortController();
        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const found = await searchPlaces(q, { kind, near, city, signal: controller.signal });
                setResults(found);
                setSearched(q);
                setFailed(false);
                setActive(-1);
                setOpen(true);
            } catch (e) {
                if ((e as Error).name !== 'AbortError') setFailed(true);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }, DEBOUNCE_MS);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [value, kind, city, near?.latitude, near?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

    const pick = (place: Place) => {
        typed.current = false;
        setOpen(false);
        setResults([]);
        setSearched(null);
        onSelect(place);
    };

    const askAi = () => {
        setOpen(false);
        onAskAi?.();
    };

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (!open || results.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => (i + 1) % results.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
        } else if (e.key === 'Enter' && active >= 0) {
            e.preventDefault();
            pick(results[active]);
        } else if (e.key === 'Escape') {
            e.stopPropagation(); // close the list, not the sheet
            setOpen(false);
        }
    };

    const showList = open && results.length > 0;
    const nothingFound = !!onAskAi && !loading && results.length === 0 && searched === query;

    return (
        <div className="relative">
            <input
                id={id}
                role="combobox"
                aria-expanded={showList}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
                autoComplete="off"
                className={cn(inputClass, 'pr-9')}
                value={value}
                placeholder={placeholder}
                required={required}
                maxLength={maxLength}
                autoFocus={autoFocus}
                onChange={(e) => {
                    typed.current = true;
                    onChange(e.target.value);
                }}
                onKeyDown={onKeyDown}
                onFocus={() => results.length > 0 && setOpen(true)}
                // let a tap on a suggestion land before the list closes
                onBlur={() => setTimeout(() => setOpen(false), 150)}
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-faint" aria-hidden="true">
                {loading ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
            </span>

            {showList && (
                <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-10 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-line bg-card py-1 shadow-lg">
                    {results.map((place, i) => (
                        <li
                            key={`${place.name}-${place.latitude}-${place.longitude}`}
                            id={`${listId}-${i}`}
                            role="option"
                            aria-selected={i === active}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pick(place)}
                            className={cn('flex cursor-pointer items-start gap-2.5 px-3 py-2.5', i === active ? 'bg-indigo-soft' : 'hover:bg-hover')}
                        >
                            <MapPin className="mt-0.5 size-4 shrink-0 text-indigo" aria-hidden="true" />
                            <span className="min-w-0">
                                <span className="block truncate text-sm font-bold">{place.name}</span>
                                {place.detail && <span className="block truncate text-xs text-mute">{place.detail}</span>}
                            </span>
                        </li>
                    ))}
                    {onAskAi && (
                        <li
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={askAi}
                            className="mx-1.5 mt-1 flex cursor-pointer items-center gap-2.5 rounded-lg border-t border-line px-1.5 py-2.5 text-sm font-bold text-indigo hover:bg-hover"
                        >
                            <Sparkles className="size-4 shrink-0" aria-hidden="true" />
                            Non è nessuno di questi? Chiedi all'AI
                        </li>
                    )}
                    <li className="px-3 pt-1 pb-1.5 text-[10px] text-faint" aria-hidden="true">
                        Dati © OpenStreetMap
                    </li>
                </ul>
            )}
            {nothingFound && (
                <div className="mt-1.5 flex items-center justify-between gap-2 rounded-xl bg-sunken py-1.5 pr-1.5 pl-3">
                    <p className="min-w-0 text-xs text-mute">Nessun luogo trovato sulla mappa.</p>
                    <button
                        type="button"
                        onClick={askAi}
                        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] bg-indigo px-2.5 text-xs font-bold text-on-indigo hover:bg-indigo-deep"
                    >
                        <Sparkles className="size-3.5" aria-hidden="true" />
                        Chiedi all'AI
                    </button>
                </div>
            )}
            {failed && <p className="mt-1 text-xs text-mute">Suggerimenti non disponibili ora: puoi scrivere il luogo a mano.</p>}
        </div>
    );
}
