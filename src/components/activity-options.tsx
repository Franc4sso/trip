import { useAskAiPlace } from '@/components/ask-ai-place';
import { BottomSheet } from '@/components/bottom-sheet';
import { PlaceInput } from '@/components/place-input';
import { PrimaryButton } from '@/components/ui';
import { api } from '@/lib/api';
import { factsLine, infoLabels, type SuggestedPlace } from '@/lib/describe';
import { MAX_OPTIONS, optionKey, type Anchor } from '@/lib/options';
import { ACTIVITY_TYPES, type ActivityOption, type ActivityType, type PlaceInfo } from '@/lib/trip';
import { cn } from '@/lib/utils';
import { Check, Loader2, LocateFixed, MapPin, RefreshCw, Sparkles, X } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';

/** A place as the sheets show it: an option, or the activity itself. */
export interface ShownPlace {
    name: string;
    address: string | null;
    city: string | null;
    info?: PlaceInfo | null;
}

/** First photo that loads, else the type's icon: the compact picture of a place. */
export function Thumb({ info, type, className }: { info?: PlaceInfo | null; type: ActivityType; className?: string }) {
    const [failed, setFailed] = useState<string[]>([]);
    const photo = info?.photos.find((p) => !failed.includes(p));
    const meta = ACTIVITY_TYPES[type];
    const Icon = meta.icon;
    if (!photo) {
        return (
            <span className={cn('flex shrink-0 items-center justify-center rounded-[10px]', meta.tint, className)} aria-hidden="true">
                <Icon className="size-[18px]" />
            </span>
        );
    }
    return (
        <img
            src={photo}
            alt=""
            loading="lazy"
            // many sites refuse images linked from other sites: don't say where we come from
            referrerPolicy="no-referrer"
            onError={() => setFailed((f) => [...f, photo])}
            className={cn('shrink-0 rounded-[10px] bg-sunken object-cover', className)}
        />
    );
}

/** The photos of a place, side by side: swipe through them. */
function PhotoStrip({ photos, name }: { photos: string[]; name: string }) {
    const [failed, setFailed] = useState<string[]>([]);
    const shown = photos.filter((p) => !failed.includes(p));
    if (shown.length === 0) return null;
    return (
        <div className="-mx-5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
            {shown.map((p, i) => (
                <img
                    key={p}
                    src={p}
                    alt={`${name}, foto ${i + 1} di ${shown.length}`}
                    referrerPolicy="no-referrer"
                    onError={() => setFailed((f) => [...f, p])}
                    className={cn('h-52 shrink-0 snap-center rounded-2xl bg-sunken object-cover', shown.length === 1 ? 'w-full' : 'w-[85%]')}
                />
            ))}
        </div>
    );
}

/** What it is and what it costs, labelled for the kind of place. */
function Facts({ info, type }: { info: PlaceInfo; type: ActivityType }) {
    const labels = infoLabels(type);
    if (!info.what && !info.price && !info.hours) return null;
    return (
        <div className="grid grid-cols-2 gap-2">
            {info.what && (
                <div className="rounded-[14px] bg-clay-soft px-3 py-2.5">
                    <p className="text-[11px] font-bold text-clay-ink uppercase">{labels.what}</p>
                    <p className="mt-1 text-[13px] font-bold">{info.what}</p>
                </div>
            )}
            {info.price && (
                <div className="rounded-[14px] bg-leaf-soft px-3 py-2.5">
                    <p className="text-[11px] font-bold text-leaf uppercase">{labels.price}</p>
                    <p className="mt-1 text-[13px] font-bold">{info.price}</p>
                </div>
            )}
            {info.hours && (
                <div className="col-span-2 rounded-[14px] border border-line bg-card px-3 py-2.5">
                    <p className="text-[11px] font-bold text-mute uppercase">Orari</p>
                    <p className="mt-1 text-[13px] font-semibold">{info.hours}</p>
                </div>
            )}
        </div>
    );
}

/** Everything the AI found about a place, to understand it before choosing. */
export function PlaceSheet({
    place,
    type,
    open,
    onOpenChange,
    subtitle,
    chosen,
    onChoose,
}: {
    place: ShownPlace | null;
    type: ActivityType;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    subtitle?: string;
    /** For an option: whether it is the chosen one, and how to change that. */
    chosen?: boolean;
    onChoose?: () => void;
}) {
    const info = place?.info;
    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title={place?.name ?? ''}
            subtitle={subtitle}
            footer={
                onChoose && (
                    <PrimaryButton
                        onClick={() => {
                            onChoose();
                            onOpenChange(false);
                        }}
                        className={cn('w-full', !chosen && 'bg-leaf hover:bg-leaf')}
                    >
                        {chosen ? 'Togli la scelta' : 'Scegliamo questo'}
                    </PrimaryButton>
                )
            }
        >
            {place && (
                <div className="flex flex-col gap-3.5">
                    {info && <PhotoStrip photos={info.photos} name={place.name} />}
                    {info ? <Facts info={info} type={type} /> : <p className="text-[13px] text-mute">Ancora nessuna informazione su questo posto.</p>}
                    {info?.summary && <p className="text-sm leading-relaxed text-ink-2">{info.summary}</p>}
                    {(place.address || place.city) && (
                        <p className="flex items-start gap-2 rounded-[14px] border border-line bg-card px-3 py-2.5 text-[13px] text-ink-2">
                            <MapPin className="mt-0.5 size-4 shrink-0 text-mute" aria-hidden="true" />
                            {[place.address, place.city].filter(Boolean).join(' · ')}
                        </p>
                    )}
                    {info && (
                        <p className="flex items-center gap-1 text-[11px] text-faint">
                            <Sparkles className="size-3" aria-hidden="true" />
                            Informazioni raccolte dall'AI sul web: verificale prima di andare.
                        </p>
                    )}
                </div>
            )}
        </BottomSheet>
    );
}

/** The photo and facts of the activity itself, in its form. */
export function InfoPreview({ info, type, pending, onRefresh, onOpen }: { info: PlaceInfo | null; type: ActivityType; pending: boolean; onRefresh: () => void; onOpen: () => void }) {
    if (pending) {
        return (
            <p role="status" className="mt-2 flex items-center gap-2 rounded-xl bg-indigo-soft px-3 py-2 text-[13px] font-semibold text-indigo">
                <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
                L'AI sta cercando foto e informazioni…
            </p>
        );
    }
    if (!info) {
        return (
            <button type="button" onClick={onRefresh} className="mt-2 flex h-9 items-center gap-1.5 text-[13px] font-bold text-indigo hover:underline">
                <Sparkles className="size-4" aria-hidden="true" />
                Foto e informazioni con l'AI
            </button>
        );
    }
    return (
        <div className="mt-2 flex items-center gap-2.5 rounded-xl border border-line bg-card p-2">
            <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                <Thumb info={info} type={type} className="size-12" />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-clay-ink">{factsLine(info) || 'Informazioni dal web'}</span>
                    <span className="line-clamp-2 text-xs text-mute">{info.summary}</span>
                </span>
            </button>
            <button type="button" onClick={onRefresh} aria-label="Cerca di nuovo foto e informazioni" className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-field hover:bg-hover">
                <RefreshCw className="size-4" aria-hidden="true" />
            </button>
        </div>
    );
}

interface OptionsFieldProps {
    tripId: number;
    type: ActivityType;
    options: ActivityOption[];
    /** Option keys the AI is still describing. */
    pending: Set<string>;
    onAdd: (option: ActivityOption) => void;
    onRemove: (index: number) => void;
    onOpen: (index: number) => void;
    onDescribe: (index: number) => void;
    near?: { latitude: number; longitude: number } | null;
    city?: string | null;
    /** For the AI suggestions: what the slot is for, when, and where the group will be. */
    title: string;
    date: string | null;
    startTime: string | null;
    anchors: Anchor[];
}

/** The alternatives of an activity in its form: typed like "Cosa", described by the AI. */
export function OptionsField({ tripId, type, options, pending, onAdd, onRemove, onOpen, onDescribe, near, city, title, date, startTime, anchors }: OptionsFieldProps) {
    const [text, setText] = useState('');
    const [suggesting, setSuggesting] = useState(false);
    const taken = (name: string) => options.some((o) => optionKey(o.name) === optionKey(name));
    const add = (o: ActivityOption) => {
        if (!taken(o.name) && options.length < MAX_OPTIONS) onAdd(o);
        setText('');
    };
    const ai = useAskAiPlace(tripId, { query: text, city, kind: 'activity' }, (c) =>
        add({ name: c.name, address: c.address, city: c.city, latitude: c.latitude, longitude: c.longitude }),
    );

    const addTyped = () => {
        const name = text.trim();
        if (name) add({ name: name.slice(0, 200), address: null, city: city || null, latitude: null, longitude: null });
    };
    // Enter adds the option instead of saving the whole activity (a picked suggestion already handled it)
    const onKeyDown = (e: KeyboardEvent) => {
        if (e.key !== 'Enter' || e.defaultPrevented) return;
        e.preventDefault();
        addTyped();
    };

    return (
        // it sits in the "Alternative" row of the form, which already names it
        <div className="flex flex-col gap-2.5">
            <p className="text-xs text-mute">Più posti per lo stesso momento, da decidere sul posto. Scrivi un luogo: foto e informazioni le cerca l'AI.</p>
            {options.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                    {options.map((o, i) => {
                        const busy = pending.has(optionKey(o.name));
                        return (
                            <li key={optionKey(o.name)} className={cn('flex items-center gap-2 rounded-xl border p-1.5', busy ? 'border-dashed border-dash bg-indigo-soft' : o.chosen ? 'border-leaf bg-leaf-soft' : 'border-line')}>
                                <button type="button" onClick={() => onOpen(i)} disabled={busy} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                                    {busy ? (
                                        <span className="flex size-12 shrink-0 items-center justify-center rounded-[10px] bg-card text-indigo" aria-hidden="true">
                                            <Loader2 className="size-5 animate-spin" />
                                        </span>
                                    ) : (
                                        <Thumb info={o.info} type={type} className="size-12" />
                                    )}
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[13px] font-extrabold">
                                            {o.name}
                                            {o.chosen && <Check className="ml-1 inline size-3.5 text-leaf" aria-label="scelto" />}
                                        </span>
                                        <span className={cn('block truncate text-xs font-bold', busy ? 'text-indigo' : 'text-clay-ink')}>
                                            {busy ? "L'AI sta cercando foto e informazioni…" : factsLine(o.info) || o.address || o.city}
                                        </span>
                                    </span>
                                </button>
                                {!busy && !o.info && (
                                    <button
                                        type="button"
                                        aria-label={`Cerca foto e informazioni su ${o.name}`}
                                        onClick={() => onDescribe(i)}
                                        className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-field text-indigo hover:bg-hover"
                                    >
                                        <Sparkles className="size-4" aria-hidden="true" />
                                    </button>
                                )}
                                <button type="button" aria-label={`Togli ${o.name}`} onClick={() => onRemove(i)} className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-field hover:bg-hover">
                                    <X className="size-4" aria-hidden="true" />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
            {options.length < MAX_OPTIONS && (
                <>
                    <div className="flex gap-2" onKeyDown={onKeyDown}>
                        <div className="min-w-0 flex-1">
                            <PlaceInput
                                id="act-option"
                                value={text}
                                onChange={setText}
                                onSelect={(place) => add({ name: place.name, address: place.address ?? place.detail, city: place.city, latitude: place.latitude, longitude: place.longitude })}
                                near={near}
                                city={city}
                                placeholder={options.length ? 'Un altro posto…' : 'Kinkaku-ji, Ichiran…'}
                                maxLength={200}
                                onAskAi={ai.ask}
                            />
                        </div>
                        <button type="button" onClick={addTyped} disabled={!text.trim()} className="h-11 shrink-0 rounded-xl border border-field px-3 text-[13px] font-bold enabled:hover:bg-hover disabled:opacity-40">
                            Aggiungi
                        </button>
                    </div>
                    {ai.element}
                    {suggesting ? (
                        <SuggestPanel
                            tripId={tripId}
                            type={type}
                            title={title}
                            date={date}
                            startTime={startTime}
                            city={city}
                            anchors={anchors}
                            exclude={options.map((o) => o.name)}
                            taken={taken}
                            onAdd={(p) => add({ name: p.name, address: p.address, city: p.city, latitude: p.latitude, longitude: p.longitude, info: p.info })}
                            onClose={() => setSuggesting(false)}
                        />
                    ) : (
                        <button type="button" onClick={() => setSuggesting(true)} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-soft text-[13px] font-extrabold text-indigo hover:bg-indigo-soft/70">
                            <Sparkles className="size-4" aria-hidden="true" />
                            Consigliami dei posti qui vicino
                        </button>
                    )}
                </>
            )}
        </div>
    );
}

const HERE = 'La mia posizione';

/** Real places around where the group will be, proposed by the AI: tap to add. */
function SuggestPanel({
    tripId,
    type,
    title,
    date,
    startTime,
    city,
    anchors,
    exclude,
    taken,
    onAdd,
    onClose,
}: {
    tripId: number;
    type: ActivityType;
    title: string;
    date: string | null;
    startTime: string | null;
    city?: string | null;
    anchors: Anchor[];
    exclude: string[];
    taken: (name: string) => boolean;
    onAdd: (place: SuggestedPlace) => void;
    onClose: () => void;
}) {
    const [from, setFrom] = useState<string | null>(null);
    const [places, setPlaces] = useState<SuggestedPlace[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const here = () =>
        new Promise<Anchor>((resolve, reject) => {
            if (!('geolocation' in navigator)) return reject(new Error('Questo telefono non dà la posizione: scegli un altro punto.'));
            navigator.geolocation.getCurrentPosition(
                (p) => resolve({ label: 'la nostra posizione attuale', latitude: p.coords.latitude, longitude: p.coords.longitude }),
                () => reject(new Error('Posizione non disponibile: consenti la posizione o scegli un altro punto.')),
                { enableHighAccuracy: false, timeout: 10_000, maximumAge: 120_000 },
            );
        });

    const ask = async (label: string) => {
        setFrom(label);
        setLoading(true);
        setError(null);
        setPlaces(null);
        try {
            const near = label === HERE ? await here() : anchors.find((a) => a.label === label)!;
            const found = await api.suggest(tripId, { title: title.trim() || ACTIVITY_TYPES[type].label, type, date, start_time: startTime, near, city, exclude });
            setPlaces(found.places);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="rounded-2xl border border-line bg-sunken p-2.5" role="region" aria-label="Posti consigliati dall'AI">
            <div className="flex items-center justify-between gap-2 px-1">
                <p className="text-xs font-bold text-mute">Vicino a</p>
                <button type="button" onClick={onClose} className="h-8 text-xs font-bold text-mute hover:underline">
                    Chiudi
                </button>
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
                {[...anchors.map((a) => a.label), HERE].map((label) => (
                    <button
                        key={label}
                        type="button"
                        onClick={() => ask(label)}
                        disabled={loading}
                        aria-pressed={from === label}
                        className={cn(
                            'inline-flex h-9 max-w-full items-center gap-1.5 truncate rounded-full border px-3 text-xs font-bold disabled:opacity-60',
                            from === label ? 'border-ink bg-ink text-paper' : 'border-field bg-card enabled:hover:bg-hover',
                        )}
                    >
                        {label === HERE && <LocateFixed className="size-3.5" aria-hidden="true" />}
                        {label}
                    </button>
                ))}
            </div>
            {!from && <p className="mt-2 px-1 text-xs text-mute">L'AI tiene conto di cosa cercate, dell'orario e della distanza a piedi.</p>}
            {loading && (
                <p role="status" className="mt-2 flex items-center gap-2 rounded-xl bg-indigo-soft px-3 py-2 text-[13px] font-semibold text-indigo">
                    <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
                    Cerco posti aperti a quell'ora, con foto…
                </p>
            )}
            {error && (
                <p role="alert" className="mt-2 rounded-xl bg-verm-soft px-3 py-2 text-[13px] font-semibold text-verm-ink">
                    {error}
                </p>
            )}
            {places && places.length === 0 && <p className="mt-2 px-1 text-[13px] text-mute">Nessun posto convincente qui: prova un altro punto.</p>}
            {places && places.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1.5">
                    {places.map((p) => {
                        const added = taken(p.name);
                        return (
                            <li key={p.name}>
                                <button
                                    type="button"
                                    onClick={() => !added && onAdd(p)}
                                    aria-pressed={added}
                                    className={cn('flex w-full items-start gap-2.5 rounded-xl border p-2 text-left', added ? 'border-indigo bg-indigo-soft' : 'border-line bg-card hover:bg-hover')}
                                >
                                    <Thumb info={p.info} type={type} className="size-14" />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[13px] font-extrabold">{p.name}</span>
                                        {factsLine(p.info) && <span className="block text-[11px] font-bold text-clay-ink">{factsLine(p.info)}</span>}
                                        {p.walk && <span className="block text-[11px] font-bold text-leaf">{p.walk}</span>}
                                        <span className="block text-[11px] leading-snug text-mute">{p.why}</span>
                                    </span>
                                    <span className={cn('shrink-0 self-center rounded-full px-2 py-1 text-[11px] font-extrabold', added ? 'bg-indigo text-on-indigo' : 'bg-stone-soft text-stone-ink')}>
                                        {added ? 'Aggiunto' : '+ Aggiungi'}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
            {places && from && (
                <button type="button" onClick={() => ask(from)} disabled={loading} className="mt-2 h-9 px-1 text-xs font-bold text-indigo hover:underline">
                    Altri posti
                </button>
            )}
        </div>
    );
}

/** The alternatives under an activity in the day: open one to see it, tick it to choose. */
export function OptionList({
    options,
    type,
    canChoose,
    onChoose,
    onOpen,
}: {
    options: ActivityOption[];
    type: ActivityType;
    canChoose: boolean;
    onChoose: (index: number | null) => void;
    onOpen: (index: number) => void;
}) {
    const chosen = options.findIndex((o) => o.chosen);
    const [expanded, setExpanded] = useState(false);
    const shown = options.map((o, i) => ({ o, i })).filter(({ i }) => chosen < 0 || expanded || i === chosen);

    return (
        <div className="rounded-2xl border border-line bg-card p-2">
            <div className="flex min-h-8 items-center justify-between gap-2 px-1">
                <p className={cn('text-xs font-bold', chosen >= 0 ? 'text-leaf' : 'text-sun-ink')}>{chosen >= 0 ? 'Scelto' : `${options.length} opzioni, da scegliere sul posto`}</p>
                {chosen >= 0 && options.length > 1 && (
                    <button onClick={() => setExpanded((e) => !e)} aria-expanded={expanded} className="h-8 shrink-0 rounded-[10px] px-2 text-xs font-bold text-indigo hover:bg-indigo-soft">
                        {expanded ? 'Chiudi' : canChoose ? 'Cambia' : 'Vedi tutte'}
                    </button>
                )}
            </div>
            <ul className="mt-1 flex flex-col gap-1.5">
                {shown.map(({ o, i }) => (
                    <li key={optionKey(o.name)} className={cn('flex items-center gap-1.5 rounded-xl border p-1.5', o.chosen ? 'border-leaf bg-leaf-soft' : 'border-line')}>
                        <button onClick={() => onOpen(i)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                            <Thumb info={o.info} type={type} className="size-14" />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-extrabold">{o.name}</span>
                                {factsLine(o.info) && <span className="block truncate text-[11px] font-bold text-clay-ink">{factsLine(o.info)}</span>}
                                <span className="line-clamp-2 text-[11px] leading-snug text-mute">{o.info?.summary ?? o.address}</span>
                            </span>
                        </button>
                        {canChoose && (
                            <button
                                onClick={() => {
                                    onChoose(o.chosen ? null : i);
                                    setExpanded(false);
                                }}
                                aria-pressed={!!o.chosen}
                                aria-label={o.chosen ? `Togli la scelta di ${o.name}` : `Scegli ${o.name}`}
                                className="flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-hover"
                            >
                                <span className={cn('flex size-6 items-center justify-center rounded-full border-2', o.chosen ? 'border-leaf bg-leaf text-paper' : 'border-field')} aria-hidden="true">
                                    {o.chosen && <Check className="size-3.5" />}
                                </span>
                            </button>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}
