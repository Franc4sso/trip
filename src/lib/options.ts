import { hotelOn } from './insights.ts';
import type { Coordinates } from './places.ts';
import type { Activity, ActivityOption, Stay } from './types.ts';

export const MAX_OPTIONS = 10;

export const chosenOption = (a: Pick<Activity, 'options'>): ActivityOption | undefined => a.options.find((o) => o.chosen);

/** Same place, whatever the case and spacing: one option per place. */
export const optionKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * The update that picks option `index` (or drops the choice, with null): the chosen place
 * becomes the activity's location, so the map, the route and the navigator follow it.
 */
export function choosePatch(a: Pick<Activity, 'options' | 'city'>, index: number | null): Pick<Activity, 'options' | 'location' | 'city' | 'latitude' | 'longitude'> {
    const options = a.options.map((o, i) => {
        const rest = { ...o };
        delete rest.chosen;
        return i === index ? { ...rest, chosen: true } : rest;
    });
    const pick = index === null ? undefined : options[index];
    return {
        options,
        location: pick ? (pick.address ?? pick.name) : null,
        city: pick?.city ?? a.city,
        latitude: pick?.latitude ?? null,
        longitude: pick?.longitude ?? null,
    };
}

export interface Anchor extends Coordinates {
    /** Shown on the chip and handed to the AI, e.g. "Dopo Fushimi Inari". */
    label: string;
}

/**
 * Where the group will be for an activity on `date` at `time`: right after the activity
 * before it (or the last one with a place, without a time), and the hotel of that night.
 */
export function suggestAnchors(
    activities: Pick<Activity, 'id' | 'date' | 'start_time' | 'title' | 'type' | 'latitude' | 'longitude'>[],
    stays: Pick<Stay, 'check_in' | 'check_out' | 'name' | 'latitude' | 'longitude'>[],
    date: string | null,
    time: string | null,
    exceptId?: number,
): Anchor[] {
    const anchors: Anchor[] = [];
    if (!date) return anchors;
    const before = activities
        .filter((a) => a.date === date && a.id !== exceptId && a.type !== 'hotel' && a.latitude != null && a.longitude != null)
        .filter((a) => !time || (a.start_time != null && a.start_time < time))
        .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
        .pop();
    if (before) anchors.push({ label: `Dopo ${before.title}`, latitude: before.latitude!, longitude: before.longitude! });
    const hotel = hotelOn(stays, date);
    if (hotel?.latitude != null && hotel.longitude != null) anchors.push({ label: hotel.name, latitude: hotel.latitude, longitude: hotel.longitude });
    return anchors;
}
