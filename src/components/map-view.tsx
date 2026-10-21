import type { Coordinates } from '@/lib/places';
import { useIsDark } from '@/lib/theme';
import * as maplibregl from 'maplibre-gl';
import type { LngLatLike } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// the worker is a standalone file: let Vite serve/emit it and point MapLibre at it
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { useEffect, useRef } from 'react';

export interface MapPin extends Coordinates {
    id: string;
    /** Number shown in the pin, or null for the stay. */
    label: string | null;
    color: string;
    title: string;
}

interface Props {
    pins: MapPin[];
    /** Draw a dashed walk through these points, in order. */
    route: Coordinates[];
    onPinClick?: (id: string) => void;
}

// OpenFreeMap: free OpenStreetMap vector tiles, no key
const STYLE = {
    light: 'https://tiles.openfreemap.org/styles/positron',
    dark: 'https://tiles.openfreemap.org/styles/dark',
};
const ROUTE_SOURCE = 'tabi-route';
maplibregl.setWorkerUrl(workerUrl);
// lucide "bed-double", inlined because markers are plain DOM elements
const BED_ICON =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M12 4v6"/><path d="M2 18h20"/></svg>';

export function MapView({ pins, route, onPinClick }: Props) {
    const dark = useIsDark();
    const container = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const markers = useRef<maplibregl.Marker[]>([]);
    // set on 'load': isStyleLoaded() turns false again while tiles stream in
    const ready = useRef(false);
    const latest = useRef({ pins, route, onPinClick });
    latest.current = { pins, route, onPinClick };

    // create the map once; recreate the style when the theme flips
    useEffect(() => {
        const m = new maplibregl.Map({
            container: container.current!,
            style: dark ? STYLE.dark : STYLE.light,
            center: [139.7, 35.68],
            zoom: 11,
            attributionControl: { compact: true },
        });
        m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        m.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }), 'top-right');
        m.on('load', () => {
            ready.current = true;
            draw(m, latest.current, markers, true);
        });
        map.current = m;
        return () => {
            markers.current.forEach((mk) => mk.remove());
            markers.current = [];
            m.remove();
            map.current = null;
            ready.current = false;
        };
    }, [dark]);

    // redraw pins and route when the data changes
    const key = JSON.stringify([pins, route]);
    useEffect(() => {
        const m = map.current;
        if (m && ready.current) draw(m, latest.current, markers, true);
    }, [key]);

    return <div ref={container} className="size-full" role="region" aria-label="Mappa del giorno" />;
}

function draw(m: maplibregl.Map, { pins, route, onPinClick }: Pick<Props, 'pins' | 'route' | 'onPinClick'>, markers: React.RefObject<maplibregl.Marker[]>, fit: boolean) {
    markers.current.forEach((mk) => mk.remove());
    markers.current = pins.map((pin) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.setAttribute('aria-label', pin.label ? `${pin.label}. ${pin.title}` : `Alloggio: ${pin.title}`);
        el.className = 'tabi-pin';
        // MapLibre owns the marker's transform, so the drop shape lives on inner elements
        const drop = document.createElement('span');
        drop.className = 'tabi-pin-drop';
        drop.style.background = pin.color;
        const content = document.createElement('span');
        if (pin.label) content.textContent = pin.label;
        else content.innerHTML = BED_ICON;
        drop.appendChild(content);
        el.appendChild(drop);
        el.addEventListener('click', () => onPinClick?.(pin.id));
        return new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([pin.longitude, pin.latitude]).addTo(m);
    });

    const line = { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: route.map((c) => [c.longitude, c.latitude]) } };
    const source = m.getSource(ROUTE_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (source) source.setData(line);
    else {
        m.addSource(ROUTE_SOURCE, { type: 'geojson', data: line });
        m.addLayer({
            id: ROUTE_SOURCE,
            type: 'line',
            source: ROUTE_SOURCE,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#5B6CFF', 'line-width': 4, 'line-dasharray': [0.1, 2] },
        });
    }

    if (fit && pins.length) {
        const bounds = new maplibregl.LngLatBounds();
        pins.forEach((p) => bounds.extend([p.longitude, p.latitude] as LngLatLike));
        m.fitBounds(bounds, { padding: { top: 70, bottom: 40, left: 40, right: 60 }, maxZoom: 15, duration: 0 });
    }
}
