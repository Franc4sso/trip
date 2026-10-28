import { MAP_STYLE } from '@/components/map-view';
import {
    bearing,
    formatMeters,
    googleMapsUrl,
    meters,
    navigationUrl,
    parseNavigation,
    progress as progressOn,
    spoken,
    type NavProgress,
    type NavRoute,
    type NavStep,
} from '@/lib/navigation';
import type { Coordinates } from '@/lib/places';
import { transitPaysOff } from '@/lib/route';
import { formatMinutes } from '@/lib/trip';
import { useIsDark } from '@/lib/theme';
import { cn } from '@/lib/utils';
import * as maplibregl from 'maplibre-gl';
import {
    ArrowUp,
    ArrowUpLeft,
    ArrowUpRight,
    ChevronLeft,
    ChevronRight,
    CornerUpLeft,
    CornerUpRight,
    ExternalLink,
    Flag,
    Loader2,
    LocateFixed,
    Navigation2,
    RefreshCw,
    RotateCcw,
    TrainFront,
    Undo2,
    Volume2,
    VolumeX,
    X,
    type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface NavTarget extends Coordinates {
    id: string;
    title: string;
    /** Number on the pin, null for the stay. */
    label: string | null;
    color: string;
    start_time: string | null;
}

interface Props {
    targets: NavTarget[];
    start: number;
    /** The day being walked: the ETA is compared with start times only today. */
    date: string;
    onClose: () => void;
}

const ARRIVED_M = 25;
const OFF_ROUTE_M = 35;
const REROUTE_EVERY_MS = 10_000;
const VOICE_KEY = 'tabi-voice';

interface Gps {
    position: Coordinates | null;
    accuracy: number;
    /** Where you are walking, degrees from north; null until it is known. */
    heading: number | null;
    error: string | null;
}

/** Live position from the phone's GPS, with the walking direction. */
function useGps(): Gps {
    const [gps, setGps] = useState<Gps>({ position: null, accuracy: 0, heading: null, error: null });
    const last = useRef<Coordinates | null>(null);

    useEffect(() => {
        if (!window.isSecureContext) {
            setGps((g) => ({ ...g, error: "Il GPS funziona solo dall'app pubblicata (https), non da un indirizzo di rete locale." }));
            return;
        }
        if (!('geolocation' in navigator)) {
            setGps((g) => ({ ...g, error: 'Questo browser non dà accesso al GPS.' }));
            return;
        }
        const id = navigator.geolocation.watchPosition(
            ({ coords }) => {
                const position = { latitude: coords.latitude, longitude: coords.longitude };
                setGps((g) => {
                    // the phone's own heading while moving; else the direction of the last few steps
                    let heading = g.heading;
                    if (coords.heading != null && !Number.isNaN(coords.heading) && (coords.speed ?? 0) > 0.7) heading = coords.heading;
                    else if (last.current && meters(last.current, position) > 4) heading = bearing(last.current, position);
                    if (!last.current || meters(last.current, position) > 4) last.current = position;
                    return { position, accuracy: coords.accuracy, heading, error: null };
                });
            },
            (e) =>
                setGps((g) => ({
                    ...g,
                    // a slow fix is not an error once we have a position
                    error:
                        e.code === e.PERMISSION_DENIED
                            ? 'Hai negato la posizione: consentila per Tabi nelle impostazioni del browser.'
                            : g.position
                              ? null
                              : 'Non trovo il segnale GPS: prova all’aperto.',
                })),
            { enableHighAccuracy: true, maximumAge: 2000, timeout: 20_000 },
        );
        return () => navigator.geolocation.clearWatch(id);
    }, []);

    return gps;
}

/** Keeps the screen on while navigating, where the browser allows it. */
function useWakeLock() {
    useEffect(() => {
        let lock: WakeLockSentinel | null = null;
        const take = () => navigator.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {});
        take();
        // the lock drops when the tab hides: take it again on return
        const again = () => document.visibilityState === 'visible' && take();
        document.addEventListener('visibilitychange', again);
        return () => {
            document.removeEventListener('visibilitychange', again);
            lock?.release().catch(() => {});
        };
    }, []);
}

function say(text: string) {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'it-IT';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
}

function readVoice(): boolean {
    try {
        return localStorage.getItem(VOICE_KEY) !== 'off';
    } catch {
        return true;
    }
}

function maneuverIcon(step: NavStep | null): LucideIcon {
    if (!step) return Navigation2;
    if (step.type === 'arrive') return Flag;
    if (step.type === 'roundabout' || step.type === 'rotary') return RotateCcw;
    switch (step.modifier) {
        case 'uturn':
            return Undo2;
        case 'left':
        case 'sharp left':
            return CornerUpLeft;
        case 'right':
        case 'sharp right':
            return CornerUpRight;
        case 'slight left':
            return ArrowUpLeft;
        case 'slight right':
            return ArrowUpRight;
        default:
            return ArrowUp;
    }
}

const clock = (d: Date) => d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

function todayIso(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Turn-by-turn walking navigation to the day's stops, full screen, on the phone's GPS. */
export function Navigator({ targets, start, date, onClose }: Props) {
    const [index, setIndex] = useState(start);
    const target = targets[index];
    const gps = useGps();
    const [route, setRoute] = useState<NavRoute | null>(null);
    const [routing, setRouting] = useState(false);
    const [routeError, setRouteError] = useState<string | null>(null);
    const [voice, setVoice] = useState(readVoice);
    const [following, setFollowing] = useState(true);
    const abort = useRef<AbortController | null>(null);
    const lastRoute = useRef(0);
    const offCount = useRef(0);
    const announced = useRef(new Set<string>());
    useWakeLock();

    const fetchRoute = useCallback(
        async (from: Coordinates) => {
            abort.current?.abort();
            const controller = new AbortController();
            abort.current = controller;
            lastRoute.current = Date.now();
            offCount.current = 0;
            setRouting(true);
            setRouteError(null);
            try {
                const res = await fetch(navigationUrl(from, target), { signal: controller.signal });
                if (!res.ok) throw new Error(`Router ${res.status}`);
                setRoute(parseNavigation(await res.json()));
            } catch (e) {
                if ((e as Error).name !== 'AbortError') setRouteError('Percorso non disponibile ora: riprova o apri Google Maps.');
            } finally {
                if (!controller.signal.aborted) setRouting(false);
            }
        },
        [target],
    );

    // a new destination: forget the old route and what was already said
    useEffect(() => {
        setRoute(null);
        setFollowing(true);
        announced.current.clear();
        return () => abort.current?.abort();
    }, [target]);

    const hasFix = !!gps.position;
    useEffect(() => {
        if (hasFix && !route && !routing && !routeError) fetchRoute(gps.position!);
    }, [hasFix, route, routing, routeError, fetchRoute]); // eslint-disable-line react-hooks/exhaustive-deps

    const progress: NavProgress | null = route && gps.position ? progressOn(route, gps.position) : null;
    const arrived = !!gps.position && (meters(gps.position, target) < ARRIVED_M || (!!progress && progress.remaining < ARRIVED_M));

    // off the route for two fixes in a row: work out a new one from here
    useEffect(() => {
        if (!progress || arrived || !gps.position) return;
        if (progress.offRoute > Math.max(OFF_ROUTE_M, gps.accuracy)) offCount.current++;
        else offCount.current = 0;
        if (offCount.current >= 2 && Date.now() - lastRoute.current > REROUTE_EVERY_MS) {
            if (voice) say('Ricalcolo il percorso');
            fetchRoute(gps.position);
        }
    }, [gps.position]); // eslint-disable-line react-hooks/exhaustive-deps

    // speak each instruction twice: a heads-up, then right at the corner
    useEffect(() => {
        if (!voice) return;
        const once = (key: string, text: string) => {
            if (announced.current.has(key)) return;
            announced.current.add(key);
            say(text);
        };
        if (arrived) return once(`arrived-${target.id}`, `Sei arrivato a ${target.title}`);
        if (!progress) return;
        if (progress.along < 15) once(`start-${route?.length}`, progress.current.text);
        const next = progress.next;
        if (!next) return;
        if (progress.toNext <= 35) once(`${next.at}-near`, next.text);
        else if (progress.toNext <= 150) once(`${next.at}-far`, spoken(next, progress.toNext));
    });

    const toggleVoice = () => {
        const on = !voice;
        setVoice(on);
        try {
            localStorage.setItem(VOICE_KEY, on ? 'on' : 'off');
        } catch {
            /* the choice lasts this session only */
        }
        if (on) say('Voce attiva');
        else window.speechSynthesis?.cancel();
    };

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        // the page underneath stays still while the map takes the whole screen
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = overflow;
        };
    }, [onClose]);

    const Icon = maneuverIcon(arrived ? { type: 'arrive', modifier: null, text: '', at: 0 } : (progress?.next ?? null));
    const eta = progress ? new Date(Date.now() + progress.seconds * 1000) : null;
    const lateness = (() => {
        if (!eta || !target.start_time || date !== todayIso()) return null;
        const [h, m] = target.start_time.split(':').map(Number);
        const due = new Date();
        due.setHours(h, m, 0, 0);
        return Math.round((eta.getTime() - due.getTime()) / 60_000);
    })();
    const walkMinutes = route ? (route.length * route.pace) / 60 : 0;
    const transit = !!route && transitPaysOff({ km: route.length / 1000, minutes: walkMinutes });
    const next = targets[index + 1];

    const status = gps.error ?? (!gps.position ? 'Cerco la tua posizione…' : routeError ?? (!route ? 'Calcolo il percorso a piedi…' : null));

    return createPortal(
        <div className="fixed inset-0 z-[60] flex flex-col bg-sunken text-ink" role="dialog" aria-modal="true" aria-label={`Navigazione verso ${target.title}`}>
            <NavMap route={route} progress={progress} gps={gps} target={target} following={following} onUnfollow={() => setFollowing(false)} />

            {/* what to do next */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 px-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
                <div className="pointer-events-auto mx-auto max-w-md" aria-live="polite">
                    {arrived ? (
                        <div className="flex items-center gap-3 rounded-[24px] bg-leaf px-4 py-4 text-paper shadow-xl">
                            <Flag className="size-9 shrink-0" aria-hidden="true" />
                            <p className="min-w-0 text-lg leading-tight font-extrabold">Sei arrivato a {target.title}</p>
                        </div>
                    ) : progress?.next ? (
                        <div className="rounded-[24px] bg-indigo text-on-indigo shadow-xl">
                            <div className="flex items-center gap-3 px-4 py-3.5">
                                <Icon className="size-11 shrink-0" strokeWidth={2.4} aria-hidden="true" />
                                <div className="min-w-0">
                                    <p className="text-[28px] leading-none font-extrabold tabular-nums">{formatMeters(progress.toNext)}</p>
                                    <p className="mt-1 text-[15px] leading-snug font-bold">{progress.next.type === 'arrive' ? `Arrivo a ${target.title}` : progress.next.text}</p>
                                </div>
                            </div>
                            {progress.toNext > 150 && progress.current.type !== 'depart' && (
                                <p className="rounded-b-[24px] bg-indigo-deep px-4 py-2 text-xs font-semibold">Ora: {progress.current.text.charAt(0).toLowerCase() + progress.current.text.slice(1)}</p>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center gap-3 rounded-[24px] bg-card px-4 py-3.5 shadow-xl">
                            {gps.error || routeError ? <LocateFixed className="size-6 shrink-0 text-verm-ink" aria-hidden="true" /> : <Loader2 className="size-6 shrink-0 animate-spin text-indigo" aria-hidden="true" />}
                            <p className="min-w-0 flex-1 text-sm font-bold">{status}</p>
                            {routeError && gps.position && (
                                <button onClick={() => fetchRoute(gps.position!)} className="flex h-9 shrink-0 items-center gap-1 rounded-[10px] border border-field px-2.5 text-xs font-bold">
                                    <RefreshCw className="size-3.5" aria-hidden="true" />
                                    Riprova
                                </button>
                            )}
                        </div>
                    )}

                    {transit && !arrived && (
                        <a
                            href={googleMapsUrl(target, 'transit')}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 flex items-center gap-2.5 rounded-2xl bg-card px-3.5 py-2.5 text-[13px] shadow-lg"
                        >
                            <TrainFront className="size-5 shrink-0 text-indigo" aria-hidden="true" />
                            <span className="min-w-0 flex-1">
                                A piedi {formatMinutes(Math.round(walkMinutes))}: <b>meglio i mezzi</b>, orari e linee su Google Maps
                            </span>
                            <span className="flex shrink-0 items-center gap-1 font-bold text-indigo">
                                Mezzi
                                <ExternalLink className="size-3.5" aria-hidden="true" />
                            </span>
                        </a>
                    )}
                </div>
            </div>

            {!following && gps.position && (
                <button
                    onClick={() => setFollowing(true)}
                    className="absolute right-4 bottom-[calc(max(env(safe-area-inset-bottom),0.75rem)+190px)] z-10 flex h-12 items-center gap-2 rounded-full bg-card px-4 text-sm font-bold text-indigo shadow-xl"
                >
                    <LocateFixed className="size-5" aria-hidden="true" />
                    Ricentra
                </button>
            )}

            {/* where to, how long, and the way out */}
            <div className="absolute inset-x-0 bottom-0 z-10">
                <div className="mx-auto max-w-md rounded-t-[28px] bg-card px-4 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] shadow-[0_-8px_30px_rgba(0,0,0,0.18)]">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setIndex((i) => i - 1)}
                            disabled={index === 0}
                            aria-label="Tappa precedente"
                            className="flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-hover disabled:opacity-30"
                        >
                            <ChevronLeft className="size-5" aria-hidden="true" />
                        </button>
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white" style={{ background: target.color }} aria-hidden="true">
                            {target.label ?? <Navigation2 className="size-4" />}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-extrabold">{target.title}</p>
                            <p className="text-xs text-mute">
                                Tappa {index + 1} di {targets.length}
                                {target.start_time && ` · alle ${target.start_time}`}
                            </p>
                        </div>
                        <button
                            onClick={() => setIndex((i) => i + 1)}
                            disabled={!next}
                            aria-label="Tappa successiva"
                            className="flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-hover disabled:opacity-30"
                        >
                            <ChevronRight className="size-5" aria-hidden="true" />
                        </button>
                    </div>

                    {arrived ? (
                        <div className="mt-3 flex gap-2">
                            {next ? (
                                <button onClick={() => setIndex(index + 1)} className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl bg-indigo px-4 text-sm font-extrabold text-on-indigo">
                                    <Navigation2 className="size-4 shrink-0" aria-hidden="true" />
                                    <span className="truncate">Prossima: {next.title}</span>
                                </button>
                            ) : (
                                <p className="flex h-12 flex-1 items-center text-sm font-bold text-leaf">Ultima tappa della giornata.</p>
                            )}
                            <button onClick={onClose} className="h-12 shrink-0 rounded-2xl border border-field px-4 text-sm font-bold">
                                Fine
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="mt-3 flex items-baseline gap-2" aria-live="off">
                                {progress ? (
                                    <>
                                        <span className="text-2xl font-extrabold text-leaf tabular-nums">{formatMinutes(Math.max(1, Math.round(progress.seconds / 60)))}</span>
                                        <span className="text-sm font-semibold text-mute tabular-nums">
                                            {formatMeters(progress.remaining)} · arrivo {clock(eta!)}
                                        </span>
                                    </>
                                ) : (
                                    <span className="text-sm text-mute">—</span>
                                )}
                            </div>
                            {lateness !== null && (
                                <p className={cn('mt-0.5 text-xs font-bold', lateness > 0 ? 'text-verm-ink' : 'text-leaf')}>
                                    {lateness > 0 ? `${formatMinutes(lateness)} di ritardo sull'orario` : lateness < 0 ? `${formatMinutes(-lateness)} prima dell'orario` : 'In perfetto orario'}
                                </p>
                            )}
                            <div className="mt-3 flex gap-2">
                                <button
                                    onClick={toggleVoice}
                                    aria-pressed={voice}
                                    aria-label={voice ? 'Disattiva la voce' : 'Attiva la voce'}
                                    className={cn('flex size-12 shrink-0 items-center justify-center rounded-2xl border', voice ? 'border-indigo bg-indigo-soft text-indigo' : 'border-field text-mute')}
                                >
                                    {voice ? <Volume2 className="size-5" aria-hidden="true" /> : <VolumeX className="size-5" aria-hidden="true" />}
                                </button>
                                <a
                                    href={googleMapsUrl(target, 'walking')}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex h-12 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-field px-3 text-sm font-bold"
                                >
                                    Google Maps
                                    <ExternalLink className="size-3.5" aria-hidden="true" />
                                </a>
                                <button onClick={onClose} className="flex h-12 shrink-0 items-center gap-1.5 rounded-2xl bg-verm px-4 text-sm font-extrabold text-on-verm">
                                    <X className="size-4" aria-hidden="true" />
                                    Esci
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
}

const LEFT = 'nav-left';
const DONE = 'nav-done';

function lineFeature(points: Coordinates[]) {
    return { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: points.map((c) => [c.longitude, c.latitude]) } };
}

/** The map under the navigation: follows you, turned the way you walk. */
function NavMap({ route, progress, gps, target, following, onUnfollow }: { route: NavRoute | null; progress: NavProgress | null; gps: Gps; target: NavTarget; following: boolean; onUnfollow: () => void }) {
    const dark = useIsDark();
    const container = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const me = useRef<maplibregl.Marker | null>(null);
    const goal = useRef<maplibregl.Marker | null>(null);
    const [ready, setReady] = useState(false);
    const unfollow = useRef(onUnfollow);
    unfollow.current = onUnfollow;

    useEffect(() => {
        const m = new maplibregl.Map({
            container: container.current!,
            style: dark ? MAP_STYLE.dark : MAP_STYLE.light,
            center: [target.longitude, target.latitude],
            zoom: 16,
            attributionControl: { compact: true },
        });
        // a drag by hand means "let me look around": stop following until "Ricentra"
        m.on('dragstart', () => unfollow.current());
        m.on('load', () => {
            for (const [id, color, width, opacity] of [
                [DONE, '#9AA0B4', 6, 0.7],
                [LEFT, '#5B6CFF', 8, 0.95],
            ] as const) {
                m.addSource(id, { type: 'geojson', data: lineFeature([]) });
                m.addLayer({ id, type: 'line', source: id, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': color, 'line-width': width, 'line-opacity': opacity } });
            }
            setReady(true);
        });
        map.current = m;
        return () => {
            me.current?.remove();
            goal.current?.remove();
            me.current = goal.current = null;
            m.remove();
            map.current = null;
            setReady(false);
        };
    }, [dark]); // eslint-disable-line react-hooks/exhaustive-deps

    // the destination pin
    useEffect(() => {
        const m = map.current;
        if (!m) return;
        goal.current?.remove();
        const el = document.createElement('span');
        el.className = 'tabi-pin';
        const drop = document.createElement('span');
        drop.className = 'tabi-pin-drop';
        drop.style.background = target.color;
        const content = document.createElement('span');
        content.textContent = target.label ?? '★';
        drop.appendChild(content);
        el.appendChild(drop);
        goal.current = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([target.longitude, target.latitude]).addTo(m);
        if (!gps.position) m.jumpTo({ center: [target.longitude, target.latitude], zoom: 16 });
    }, [target, ready]); // eslint-disable-line react-hooks/exhaustive-deps

    // you, the route split into walked and still to walk, and the camera
    useEffect(() => {
        const m = map.current;
        if (!m || !ready) return;
        if (gps.position) {
            if (!me.current) {
                const el = document.createElement('div');
                el.className = 'tabi-me';
                el.innerHTML = '<span class="tabi-me-cone"></span><span class="tabi-me-dot"></span>';
                me.current = new maplibregl.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat([gps.position.longitude, gps.position.latitude]).addTo(m);
            }
            me.current.setLngLat([gps.position.longitude, gps.position.latitude]);
            me.current.setRotation(gps.heading ?? 0);
            (me.current.getElement().firstElementChild as HTMLElement).style.display = gps.heading == null ? 'none' : '';
        }
        const left = m.getSource(LEFT) as maplibregl.GeoJSONSource | undefined;
        const done = m.getSource(DONE) as maplibregl.GeoJSONSource | undefined;
        if (route && progress) {
            left?.setData(lineFeature([progress.snapped, ...route.line.slice(progress.index)]));
            done?.setData(lineFeature([...route.line.slice(0, progress.index), progress.snapped]));
        } else {
            left?.setData(lineFeature(route?.line ?? []));
            done?.setData(lineFeature([]));
        }
        if (following && gps.position) {
            // look ahead: you sit low on the screen, the way in front of you fills it
            const ahead = route && progress ? (route.line[progress.index] ?? target) : target;
            const heading = gps.heading ?? bearing(gps.position, ahead);
            m.easeTo({ center: [gps.position.longitude, gps.position.latitude], bearing: heading, zoom: 17.5, pitch: 50, padding: { top: 180, bottom: 220, left: 0, right: 0 }, duration: 900 });
        }
    }, [ready, gps.position, gps.heading, route, progress?.index, progress?.along, following]); // eslint-disable-line react-hooks/exhaustive-deps

    // MapLibre makes its container position: relative, so the full-screen box is a wrapper
    return (
        <div className="absolute inset-0">
            <div ref={container} className="size-full" aria-label="Mappa di navigazione" role="region" />
        </div>
    );
}
