# Tabi — piano di sviluppo

PWA per pianificare viaggi in gruppo. Mockup di riferimento (direzione A «Taccuino chiaro» + board desktop):
https://claude.ai/artifact/KHpwk1qW6LLcZwt4c62RyA

Stack: React 19 · Vite · Tailwind 4 · PWA su **Netlify** + **Supabase** (Auth, Postgres/RLS, Realtime, Edge Functions).
Netlify non esegue PHP: il primo prototipo Laravel è conservato nel branch `laravel-prototype`.

## Modello dati

- `trips` — nome, destinazione, date (max 90 giorni), colore, valuta, `invite_token` (leggibile solo dagli organizzatori).
- `trip_members` — ruolo `owner` | `editor` | `viewer`; c'è sempre almeno un organizzatore.
- `activities` — attività di un giorno (`date` valorizzata) o idea in lista (`date` null, senza orario), con coordinate.
- `stays` — alloggi con check-in/check-out (danno la città di ogni notte), con coordinate.
- `profiles` — nome visibile agli altri membri.
- `trip_events` — feed delle modifiche, scritto solo da trigger.
- `polls`, `poll_options`, `poll_votes` — sondaggi del gruppo, un voto a testa.
- `trip_advice`, `ai_requests` — ultimi consigli AI per versione dell'itinerario, quota giornaliera.

I giorni non hanno una tabella: derivano dalle date del viaggio. Le analisi (buchi, carichi, notti
scoperte) sono calcolate da `src/lib/insights.ts`, condiviso con la Edge Function.

## Milestone

1. ✅ **Base** — auth, viaggi, membri + invito via link, giorni, attività, alloggi, lista idee, analisi, PWA.
2. ✅ **Tema scuro, località reali, campi corretti** — tema chiaro/scuro/automatico, ricerca luoghi OpenStreetMap (Photon).
3. ✅ **Presenza live** — chi è online e cosa sta modificando, feed delle modifiche.
4. ✅ **Mappa** — MapLibre + OpenFreeMap, percorso a piedi, ordine più corto, Google Maps.
5. ✅ **Consigli AI** — Edge Function `advice` con Claude (claude-opus-5-5), cache per itinerario e quota.
6. ✅ **Offline** — viaggio salvato sul dispositivo, fascia offline, modifiche in pausa.
7. ✅ **Sondaggi e board desktop** — voti in tempo reale, board a colonne con trascinamento.

## Idee per dopo

- Login con Google (serve un client OAuth Google, si configura in Supabase → Authentication → Providers).
- Email di Supabase in italiano e servizio email dedicato (es. Resend) per conferme e reset password.
- Spese condivise e "chi deve cosa a chi".
- Notifiche push per le prenotazioni in scadenza.
- Diario/foto a viaggio concluso.
