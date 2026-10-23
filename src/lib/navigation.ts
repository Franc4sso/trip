import type { Coordinates } from './places';
import { ROUTER } from './walking';

/** One instruction of a walk: what to do where the step starts. */
export interface NavStep {
    type: string;
    modifier: string | null;
    /** Spoken and shown, in Italian: «Gira a destra su Kabukicho-dori». */
    text: string;
    /** Metres from the start of the route to where this step begins. */
    at: number;
}

export interface NavRoute {
    line: Coordinates[];
    /** Metres from the start of `line` to each of its points. */
    cumulative: number[];
    steps: NavStep[];
    /** Metres. */
    length: number;
    /** Seconds per metre, from the router's own estimate. */
    pace: number;
}

export interface NavProgress {
    /** Metres walked along the route, projected on it. */
    along: number;
    /** How far the position is from the route, in metres. */
    offRoute: number;
    /** The step being walked now and the next one to announce. */
    current: NavStep;
    next: NavStep | null;
    /** Metres to the next instruction. */
    toNext: number;
    /** Metres and seconds left to the destination. */
    remaining: number;
    seconds: number;
    /** Where on the route the position falls: the walked part stops here. */
    snapped: Coordinates;
    /** Index of the line point right after `snapped`. */
    index: number;
}

const EARTH = 6_371_000;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Metres between two points; flat-earth is exact enough at walking scale. */
export function meters(a: Coordinates, b: Coordinates): number {
    const x = rad(b.longitude - a.longitude) * Math.cos(rad((a.latitude + b.latitude) / 2));
    const y = rad(b.latitude - a.latitude);
    return Math.hypot(x, y) * EARTH;
}

/** Compass bearing from a to b, 0 = north, clockwise. */
export function bearing(a: Coordinates, b: Coordinates): number {
    const x = rad(b.longitude - a.longitude) * Math.cos(rad((a.latitude + b.latitude) / 2));
    const y = rad(b.latitude - a.latitude);
    return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
}

// ---------------------------------------------------------------- instructions

const SIDE: Record<string, string> = {
    left: 'a sinistra',
    right: 'a destra',
    'slight left': 'leggermente a sinistra',
    'slight right': 'leggermente a destra',
    'sharp left': 'tutto a sinistra',
    'sharp right': 'tutto a destra',
};

const COMPASS = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ovest', 'ovest', 'nord-ovest'];

interface OsrmManeuver {
    type: string;
    modifier?: string;
    exit?: number;
    bearing_after?: number;
}

/** OSRM maneuver → a short Italian instruction. */
export function instruction(m: OsrmManeuver, street: string): string {
    const on = street ? ` su ${street}` : '';
    const side = m.modifier ? SIDE[m.modifier] : undefined;
    switch (m.type) {
        case 'depart':
            return `Cammina verso ${COMPASS[Math.round((m.bearing_after ?? 0) / 45) % 8]}${on}`;
        case 'arrive':
            return 'Sei arrivato';
        case 'roundabout':
        case 'rotary':
            return m.exit ? `Alla rotonda prendi la ${m.exit}ª uscita${on}` : `Attraversa la rotonda${on}`;
        case 'fork':
            return `Al bivio tieni ${m.modifier?.includes('left') ? 'la sinistra' : 'la destra'}${on}`;
        case 'merge':
            return `Immettiti${on}`;
        case 'new name':
        case 'continue':
            return m.modifier === 'uturn' ? 'Torna indietro' : side ? `Tieni ${side}${on}` : `Prosegui${on}`;
        default:
            // turn, end of road, ramps, notifications…
            if (m.modifier === 'uturn') return 'Torna indietro';
            if (!side) return `Prosegui dritto${on}`;
            return m.type === 'end of road' ? `In fondo alla strada gira ${side}${on}` : `Gira ${side}${on}`;
    }
}

/** «50 m», «1,2 km»: rounded the way you would say it while walking. */
export function formatMeters(m: number): string {
    if (m >= 1000) return `${(m / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })} km`;
    if (m >= 100) return `${Math.round(m / 50) * 50} m`;
    return `${Math.max(5, Math.round(m / 5) * 5)} m`;
}

/** «Tra 150 metri, gira a destra» */
export function spoken(step: NavStep, distance: number): string {
    const lower = step.text.charAt(0).toLowerCase() + step.text.slice(1);
    if (distance < 25) return step.text;
    const words = distance >= 1000 ? `${(distance / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })} chilometri` : `${formatMeters(distance).replace(' m', '')} metri`;
    return `Tra ${words}, ${lower}`;
}

// ---------------------------------------------------------------- routing

export function navigationUrl(from: Coordinates, to: Coordinates): string {
    const path = [from, to].map((p) => `${p.longitude},${p.latitude}`).join(';');
    return `${ROUTER}${path}?${new URLSearchParams({ overview: 'full', geometries: 'geojson', steps: 'true' })}`;
}

interface OsrmStep {
    distance: number;
    name: string;
    maneuver: OsrmManeuver;
}

interface OsrmAnswer {
    code: string;
    routes?: { distance: number; duration: number; geometry: { coordinates: number[][] }; legs: { steps: OsrmStep[] }[] }[];
}

function cumulate(line: Coordinates[]): number[] {
    const out = [0];
    for (let i = 1; i < line.length; i++) out.push(out[i - 1] + meters(line[i - 1], line[i]));
    return out;
}

export function parseNavigation(answer: OsrmAnswer): NavRoute {
    const route = answer.routes?.[0];
    if (answer.code !== 'Ok' || !route) throw new Error(`Percorso non disponibile (${answer.code})`);
    const line = route.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude }));
    const cumulative = cumulate(line);
    const length = cumulative[cumulative.length - 1] ?? 0;
    // the router's step lengths and ours differ a little: scale them onto our line
    const scale = route.distance > 0 ? length / route.distance : 1;
    const steps: NavStep[] = [];
    let at = 0;
    for (const s of route.legs.flatMap((l) => l.steps)) {
        steps.push({ type: s.maneuver.type, modifier: s.maneuver.modifier ?? null, text: instruction(s.maneuver, s.name), at: at * scale });
        at += s.distance;
    }
    return { line, cumulative, steps, length, pace: route.distance > 0 ? route.duration / route.distance : 0.8 };
}

/** Where `p` is along the route: the closest point of the line, and how far from it. */
export function progress(route: NavRoute, p: Coordinates): NavProgress {
    const { line, cumulative } = route;
    let best = { offRoute: Infinity, along: 0, snapped: line[0] ?? p, index: 1 };
    for (let i = 1; i < line.length; i++) {
        const a = line[i - 1];
        const b = line[i];
        // project p on the segment in a local flat frame centred on a
        const k = Math.cos(rad(a.latitude));
        const bx = (b.longitude - a.longitude) * k;
        const by = b.latitude - a.latitude;
        const px = (p.longitude - a.longitude) * k;
        const py = p.latitude - a.latitude;
        const len2 = bx * bx + by * by;
        const t = len2 > 0 ? Math.max(0, Math.min(1, (px * bx + py * by) / len2)) : 0;
        const snapped = { latitude: a.latitude + by * t, longitude: a.longitude + (bx * t) / k };
        const offRoute = meters(p, snapped);
        if (offRoute < best.offRoute) best = { offRoute, along: cumulative[i - 1] + meters(a, snapped), snapped, index: i };
    }
    const { steps } = route;
    let n = 0;
    while (n + 1 < steps.length && steps[n + 1].at <= best.along) n++;
    const next = steps[n + 1] ?? null;
    const remaining = Math.max(0, route.length - best.along);
    return {
        ...best,
        current: steps[n],
        next,
        toNext: next ? Math.max(0, next.at - best.along) : remaining,
        remaining,
        seconds: remaining * route.pace,
    };
}

/** Google Maps with the trip already set, for transit or when GPS is not available here. */
export function googleMapsUrl(to: Coordinates, mode: 'walking' | 'transit'): string {
    return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', destination: `${to.latitude},${to.longitude}`, travelmode: mode })}`;
}
