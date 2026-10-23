/**
 * Everything about AI advice that the app and the `advice` Edge Function (Deno) share:
 * the response schema, the instructions, and how a trip is written down for the model.
 * Keep it free of browser/Node APIs; relative imports keep their .ts extension.
 */
import { z } from 'zod';
import { computeInsights } from './insights.ts';
import type { Activity, Stay, Trip } from './types.ts';

export const SUGGESTION_KINDS = ['gap', 'conflict', 'timing', 'booking', 'balance', 'idea', 'practical'] as const;

const SuggestedActivity = z.object({
    title: z.string().describe('Nome breve, es. «Nara, cervi e Todai-ji»'),
    date: z.string().nullable().describe('YYYY-MM-DD dentro le date del viaggio, oppure null per la lista idee'),
    start_time: z.string().nullable().describe('HH:MM, oppure null'),
    duration_minutes: z.number().int().nullable(),
    type: z.enum(['visit', 'food', 'transport', 'experience', 'shopping', 'hotel', 'note']),
    city: z.string().nullable(),
});

export const AdviceSchema = z.object({
    suggestions: z
        .array(
            z.object({
                kind: z.enum(SUGGESTION_KINDS),
                title: z.string().describe('Titolo breve e concreto, max 60 caratteri'),
                body: z.string().describe('1-3 frasi in italiano, pratiche, riferite al loro itinerario'),
                date: z.string().nullable().describe('Il giorno a cui si riferisce (YYYY-MM-DD) o null'),
                add: SuggestedActivity.nullable().describe("Attività pronta da aggiungere con un tocco, se il consiglio è aggiungere qualcosa; altrimenti null"),
            }),
        )
        .describe('Da 3 a 8 consigli, i più utili per primi'),
    answer: z.string().nullable().describe('Risposta alla domanda del gruppo, se c\'è; altrimenti null'),
});

export type Advice = z.infer<typeof AdviceSchema>;
export type Suggestion = Advice['suggestions'][number];
export type SuggestedActivity = z.infer<typeof SuggestedActivity>;

export const SYSTEM_PROMPT = `Sei il consulente di viaggio di Tabi, un'app con cui un gruppo di amici pianifica un viaggio insieme.
Ricevi l'itinerario del gruppo e rispondi sempre in italiano, con tono amichevole e concreto.

Cosa fare:
- Guarda i problemi che l'app ha già calcolato (giorni vuoti, buchi di 2 ore o più, giorni troppo pieni, notti senza alloggio, prenotazioni in scadenza) e proponi soluzioni specifiche per quella città e quel momento della giornata.
- Cerca conflitti che l'app non vede: luoghi chiusi in quel giorno della settimana, orari poco furbi (folla, tramonto, distanze tra tappe lontane nello stesso giorno), spostamenti mancanti tra città, prenotazioni che di solito vanno fatte con molto anticipo.
- Quando un consiglio è «aggiungi X», compila "add" con un'attività pronta, coerente con città, giorno e buchi liberi. Preferisci le idee già nella loro lista quando ci stanno.
- Se c'è una domanda del gruppo, rispondi in "answer" in modo diretto (max 120 parole) e collega i consigli alla domanda.

Onestà:
- Orari di apertura, giorni di chiusura e prezzi cambiano: quando ne parli, dillo come indicazione da verificare («di solito», «controlla sul sito»), mai come certezza.
- Non inventare prenotazioni, nomi di ristoranti specifici o eventi di cui non sei sicuro.
- Se l'itinerario è ancora quasi vuoto, dai consigli per iniziare a riempirlo.`;

const WEEKDAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

function weekday(date: string): string {
    const [y, m, d] = date.split('-').map(Number);
    return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function hours(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

/** The trip as plain text for the model. Deterministic, so it can be hashed and cached. */
export function itineraryText(trip: Trip, activities: Activity[], stays: Stay[]): string {
    const insights = computeInsights(trip, activities, stays);
    const byDay = new Map<string, Activity[]>();
    for (const a of [...activities].sort((x, y) => (x.start_time ?? '99').localeCompare(y.start_time ?? '99') || x.id - y.id)) {
        if (a.date) byDay.set(a.date, [...(byDay.get(a.date) ?? []), a]);
    }

    const line = (a: Activity) =>
        [
            a.start_time ?? 'senza orario',
            a.title,
            `(${a.type}${a.duration_minutes ? `, ${hours(a.duration_minutes)}` : ''}${a.city ? `, ${a.city}` : ''})`,
            a.booking_required ? (a.booked ? '[prenotato]' : `[da prenotare${a.booking_deadline ? ` entro ${a.booking_deadline}` : ''}]`) : '',
            a.notes ? `— note: ${a.notes.replace(/\s+/g, ' ').slice(0, 160)}` : '',
        ]
            .filter(Boolean)
            .join(' ');

    const out: string[] = [
        `VIAGGIO: ${trip.name}${trip.destination ? ` — ${trip.destination}` : ''}`,
        `DATE: ${trip.start_date} → ${trip.end_date} (${insights.days.length} giorni). Valuta: ${trip.currency}.`,
        '',
        'ALLOGGI:',
        ...(stays.length
            ? [...stays].sort((a, b) => a.check_in.localeCompare(b.check_in)).map((s) => `- ${s.name}, ${s.city}: ${s.check_in} → ${s.check_out}${s.confirmed ? '' : ' (da confermare)'}`)
            : ['- nessuno']),
        '',
        'GIORNI:',
    ];

    for (const d of insights.days) {
        const flags = [
            d.load === 'empty' ? 'VUOTO' : d.load === 'full' ? `PIENO (${hours(d.planned_minutes)})` : `${hours(d.planned_minutes)} pianificate`,
            ...d.gaps.map((g) => `buco ${g.from}-${g.to}`),
        ];
        out.push(`${d.date} (${weekday(d.date)}, giorno ${d.number}${d.city ? `, ${d.city}` : ''}) — ${flags.join('; ')}`);
        for (const a of byDay.get(d.date) ?? []) out.push(`  • ${line(a)}`);
    }

    const ideas = activities.filter((a) => !a.date);
    out.push('', 'LISTA IDEE (non ancora in un giorno):', ...(ideas.length ? ideas.map((a) => `- ${line(a)}`) : ['- nessuna']));
    out.push(
        '',
        'PROBLEMI CALCOLATI DALL\'APP:',
        `- Giorni vuoti: ${insights.empty_days.join(', ') || 'nessuno'}`,
        `- Giorni troppo pieni: ${insights.full_days.join(', ') || 'nessuno'}`,
        `- Notti senza alloggio: ${insights.uncovered_nights.join(', ') || 'nessuna'}`,
        `- Prenotazioni da fare: ${insights.pending_bookings.map((b) => `${b.title}${b.deadline ? ` (entro ${b.deadline})` : ''}`).join('; ') || 'nessuna'}`,
    );
    return out.join('\n');
}

/** SHA-256 of the itinerary text, hex. Same result in the browser and in Deno. */
export async function itineraryHash(text: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
