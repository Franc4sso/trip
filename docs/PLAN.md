# Tabi — piano di sviluppo

PWA per pianificare viaggi in gruppo. Mockup di riferimento (direzione A «Taccuino chiaro» + board desktop):
https://claude.ai/artifact/KHpwk1qW6LLcZwt4c62RyA

Stack: React 19 · Vite · Tailwind 4 · PWA su **Netlify** + **Supabase** (Auth, Postgres/RLS, Realtime).
Netlify non esegue PHP: il primo prototipo Laravel è conservato nel branch `laravel-prototype`.

## Modello dati

- `trips` — nome, destinazione, date (max 90 giorni), colore, valuta, `invite_token` (leggibile solo dagli organizzatori).
- `trip_members` — ruolo `owner` | `editor` | `viewer`; c'è sempre almeno un organizzatore.
- `activities` — attività di un giorno (`date` valorizzata) o idea in lista (`date` null, senza orario).
- `stays` — alloggi con check-in/check-out: danno la città di ogni notte.
- `profiles` — nome visibile agli altri membri.

I giorni non hanno una tabella: derivano dalle date del viaggio. Le analisi (buchi, carichi, notti
scoperte) sono calcolate nel browser da `src/lib/insights.ts`.

## Milestone

1. ✅ **Base** — auth, viaggi, membri + invito via link, giorni, attività, alloggi, lista idee,
   analisi, schermate A1–A6 + A9, realtime delle modifiche, PWA installabile, config Netlify.
2. **Presenza live** — chi è online e cosa sta modificando ("Sara sta modificando"), feed modifiche.
3. **Mappa** — MapLibre, geocoding luoghi, ordine ottimale tappe.
4. **Consigli AI** — Netlify Function che chiama Claude: idee per i buchi, conflitti, domande libere.
5. **Offline** — cache dei dati del viaggio per consultarlo senza rete, notifiche scadenze prenotazioni.
6. **Desktop board** — vista a colonne con drag & drop dalla lista idee; sondaggi.
