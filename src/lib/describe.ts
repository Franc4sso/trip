/**
 * "Tell us about this place" and "what is there around here": shared by the app and the
 * `advice` Edge Function (Deno). Fills activities and their options with photos and info.
 * Keep it free of browser/Node APIs; relative imports keep their .ts extension.
 */
import { z } from 'zod';
import type { ActivityType, PlaceInfo } from './types.ts';

const info = {
    summary: z.string().nullable().describe('Due o tre frasi in italiano, concrete: che posto è, atmosfera, perché andarci'),
    what: z
        .string()
        .nullable()
        .describe("Per un locale: cosa si mangia principalmente, es. «Ramen tonkotsu, gyoza». Per il resto: cos'è, es. «Tempio zen con giardino»"),
    price: z
        .string()
        .nullable()
        .describe("Per un locale: prezzo medio a testa. Per il resto: biglietto d'ingresso, o «Gratis». Valuta locale con la conversione, es. «¥1.500–2.500 (≈ 9–15 €)»"),
    hours: z.string().nullable().describe('Orari di apertura in breve, es. «11:00–23:00, chiuso il martedì»'),
    image_urls: z
        .array(z.string())
        .describe('Fino a 4 URL diretti (https) di foto del posto viste davvero nelle pagine lette, es. le immagini di anteprima; mai inventati'),
    source_urls: z.array(z.string()).describe('Fino a 3 pagine affidabili sul posto (sito ufficiale, Tabelog, guide, Wikipedia)'),
};

export const DescribeSchema = z.object({
    found: z.boolean().describe('false se non hai trovato il posto con sicurezza: allora gli altri campi restano vuoti'),
    address: z.string().nullable().describe('Indirizzo completo in caratteri latini'),
    city: z.string().nullable(),
    latitude: z.number().nullable().describe('Solo se la conosci con buona sicurezza, altrimenti null'),
    longitude: z.number().nullable(),
    ...info,
});

export const SuggestSchema = z.object({
    places: z
        .array(
            z.object({
                name: z.string().describe('Nome come lo si trova sul posto, in caratteri latini'),
                address: z.string().nullable(),
                city: z.string().nullable(),
                latitude: z.number().nullable().describe('Solo se la conosci con buona sicurezza, altrimenti null'),
                longitude: z.number().nullable(),
                walk: z.string().nullable().describe('Quanto è lontano dal punto di partenza, es. «6 min a piedi» o «12 min in treno»'),
                why: z.string().describe('Perché è adatto adesso, una frase breve in italiano'),
                ...info,
            }),
        )
        .describe('Da 3 a 5 posti reali, il più adatto per primo'),
});

export type Describe = z.infer<typeof DescribeSchema>;
export type Suggest = z.infer<typeof SuggestSchema>;
/** What the function sends back: the info with photos already checked. */
export type DescribedPlace = Pick<Describe, 'found' | 'address' | 'city' | 'latitude' | 'longitude'> & { info: PlaceInfo };
export type SuggestedPlace = Pick<Suggest['places'][number], 'name' | 'address' | 'city' | 'latitude' | 'longitude' | 'walk' | 'why'> & { info: PlaceInfo };

export interface DescribeRequest {
    /** The place the user typed or picked, e.g. "Ichiran Shibuya". */
    query: string;
    type: ActivityType;
    address?: string | null;
    city?: string | null;
    /** Currency of the group, for the price conversion. */
    currency?: string | null;
}

export interface SuggestRequest {
    /** What the slot is for, e.g. "Cena" or "Un tempio nel pomeriggio". */
    title: string;
    type: ActivityType;
    date: string | null;
    start_time: string | null;
    /** Where the group will be: a point, and how to call it. */
    near: { latitude: number; longitude: number; label: string };
    city?: string | null;
    currency?: string | null;
    /** Places already among the options, not to suggest again. */
    exclude?: string[];
}

const COMMON = `- Le informazioni servono a scegliere: brevi e concrete, niente frasi da brochure.
- Le foto: solo URL di immagini che hai davvero visto in una pagina (spesso l'immagine di anteprima, og:image). Mai inventarli; lista vuota se non ce ne sono.
- Coordinate solo se le hai trovate; mai inventate.
- Scrivi in italiano; nomi e indirizzi in caratteri latini.`;

export const DESCRIBE_PROMPT = `Sei l'assistente di Tabi, un'app per pianificare viaggi di gruppo.
Il gruppo ha aggiunto un posto al programma (una visita, un'esperienza, un ristorante…): descrivilo perché capiscano subito di cosa si tratta.

- Cerca sul web il posto esatto nella città indicata (sito ufficiale, Tabelog, Google Maps, guide, Wikipedia).
- Se il nome è una catena con più sedi, scegli la sede più probabile nella città e dillo nel riassunto.
- Se non trovi il posto con sicurezza, rispondi found=false con i campi null e le liste vuote.
${COMMON}`;

export const SUGGEST_PROMPT = `Sei l'assistente di Tabi, un'app per pianificare viaggi di gruppo.
Il gruppo cerca alternative per un momento della giornata: proponi posti reali vicino al punto indicato.

- Tieni conto di cosa cercano (il tipo e il titolo), dell'orario (devono essere aperti a quell'ora quel giorno) e della distanza: prima i posti a piedi.
- Varia le proposte (prezzo, stile) e non ripetere i posti già esclusi.
- Cerca sul web per verificare che esistano e siano aperti; meglio 3 posti sicuri che 5 dubbi.
${COMMON}`;

const TYPE_LABEL: Record<ActivityType, string> = {
    visit: 'visita',
    food: 'cibo (ristorante, locale)',
    transport: 'spostamento',
    experience: 'esperienza',
    shopping: 'shopping',
    hotel: 'hotel',
    note: 'nota',
};

export function describeTask(req: DescribeRequest): string {
    return [
        `Posto: «${req.query}» (tipo: ${TYPE_LABEL[req.type]})`,
        req.address ? `Indirizzo noto: ${req.address}` : null,
        req.city ? `Città: ${req.city}` : null,
        req.currency ? `Valuta del gruppo: ${req.currency}` : null,
    ]
        .filter(Boolean)
        .join('\n');
}

export function suggestTask(req: SuggestRequest): string {
    return [
        `Cosa cerchiamo: «${req.title}» (tipo: ${TYPE_LABEL[req.type]})`,
        req.date ? `Quando: ${req.date}${req.start_time ? ` alle ${req.start_time}` : ''}` : null,
        `Punto di partenza: ${req.near.label} (${req.near.latitude.toFixed(5)}, ${req.near.longitude.toFixed(5)})`,
        req.city ? `Città: ${req.city}` : null,
        req.currency ? `Valuta del gruppo: ${req.currency}` : null,
        req.exclude?.length ? `Già considerati, da non riproporre: ${req.exclude.join(', ')}` : null,
    ]
        .filter(Boolean)
        .join('\n');
}

export const MAX_PHOTOS = 4;

/** The preview image of an HTML page (og:image or twitter:image), made absolute. */
export function previewImage(html: string, pageUrl: string): string | null {
    const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
    for (const key of ['og:image:secure_url', 'og:image', 'twitter:image']) {
        for (const tag of tags) {
            const prop = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
            const content = /\bcontent\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
            if (prop !== key || !content) continue;
            const url = httpsUrl(content.replace(/&amp;/g, '&'), pageUrl);
            if (url) return url;
        }
    }
    return null;
}

/** An absolute https url, or null for anything else (http, data:, javascript:…). */
export function httpsUrl(value: string, base?: string): string | null {
    try {
        const url = new URL(value.trim(), base);
        return url.protocol === 'https:' ? url.href : null;
    } catch {
        return null;
    }
}

const text = (v: string | null | undefined, max: number) => (v?.trim() ? v.trim().slice(0, max) : null);

/** The stored shape of what the model said, with the photos that passed the check. */
export function toInfo(raw: Pick<Describe, 'summary' | 'what' | 'price' | 'hours' | 'source_urls'>, photos: string[]): PlaceInfo {
    return {
        summary: text(raw.summary, 600),
        what: text(raw.what, 160),
        price: text(raw.price, 120),
        hours: text(raw.hours, 160),
        photos: [...new Set(photos)].slice(0, MAX_PHOTOS),
        source_url: raw.source_urls.map((u) => httpsUrl(u)).find(Boolean) ?? null,
    };
}

/** Labels of the two facts, by kind of place. */
export function infoLabels(type: ActivityType): { what: string; price: string } {
    return type === 'food' ? { what: 'Cosa si mangia', price: 'Prezzo medio' } : { what: "Cos'è", price: 'Ingresso' };
}

/** One line under a name: "Ramen tonkotsu · ¥1.200–1.800". */
export const factsLine = (info?: PlaceInfo | null) => [info?.what, info?.price].filter(Boolean).join(' · ');
