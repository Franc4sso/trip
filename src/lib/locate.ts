/**
 * "Ask the AI where it is": shared by the app and the `advice` Edge Function (Deno).
 * Used when the place search finds nothing for a hotel or an activity.
 * Keep it free of browser/Node APIs; relative imports keep their .ts extension.
 */
import { z } from 'zod';

export const LocateSchema = z.object({
    candidates: z
        .array(
            z.object({
                name: z.string().describe('Nome del luogo come lo si trova sul posto, es. «Hotel Gracery Shinjuku»'),
                address: z.string().describe('Indirizzo completo e scrivibile, es. «1-19-1 Kabukicho, Shinjuku-ku, Tokyo 160-8466»'),
                city: z.string().nullable(),
                latitude: z.number().nullable().describe('Solo se la conosci con buona sicurezza, altrimenti null'),
                longitude: z.number().nullable(),
                confidence: z.enum(['high', 'medium', 'low']),
                note: z.string().describe('Perché è plausibile, in una frase breve in italiano'),
            }),
        )
        .describe('Da 1 a 4 indirizzi plausibili, il più probabile per primo; vuoto se non trovi niente di credibile'),
});

export type Locate = z.infer<typeof LocateSchema>;
export type LocateCandidate = Locate['candidates'][number];

export interface LocateRequest {
    /** What to find, e.g. the hotel or activity name the user typed. */
    query: string;
    /** Whatever address the user already wrote, even partial. */
    hint?: string | null;
    city?: string | null;
    kind: 'stay' | 'activity';
}

export const LOCATE_PROMPT = `Sei l'assistente di Tabi, un'app per pianificare viaggi di gruppo.
Il gruppo non ha trovato l'indirizzo di un luogo con la ricerca delle mappe: trovalo tu.

- Cerca sul web il luogo esatto (sito ufficiale, Google Maps, siti di prenotazione) e proponi gli indirizzi più plausibili.
- Se il nome è ambiguo (catene con più sedi, nomi generici come «Hotel a Namba») proponi le sedi più probabili nella città indicata e spiega la differenza nella nota.
- Scrivi gli indirizzi nella forma usata sul posto ma in caratteri latini, così si possono incollare in una mappa.
- Coordinate solo se le hai trovate o sei sicuro; mai inventate. Confidenza «high» solo se hai una fonte chiara.
- Non inventare luoghi: se non trovi niente di credibile, restituisci una lista vuota.`;

export function locateTask(req: LocateRequest): string {
    return [
        `Cosa cercare: ${req.kind === 'stay' ? 'alloggio' : 'attività o luogo'} «${req.query}»`,
        req.city ? `Città: ${req.city}` : null,
        req.hint ? `Indirizzo scritto finora dal gruppo (può essere incompleto o sbagliato): ${req.hint}` : null,
    ]
        .filter(Boolean)
        .join('\n');
}
