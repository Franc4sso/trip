# Tabi — piano di sviluppo

PWA per pianificare viaggi in gruppo. Mockup di riferimento (direzione A «Taccuino chiaro» + board desktop):
https://claude.ai/artifact/KHpwk1qW6LLcZwt4c62RyA

Stack: Laravel 12 · Inertia · React 19 · Tailwind 4 · SQLite in dev (Postgres in prod).

## Modello dati

- `trips` — nome, destinazione, date, colore, `invite_token`.
- `trip_user` — membri con ruolo `owner` | `editor` | `viewer`.
- `activities` — attività di un giorno (`date` valorizzata) o idea in lista (`date` null).
  Tipo, orario, durata, luogo/città, costo, note, prenotazione (richiesta, scadenza, stato, link).
- `stays` — alloggi con check-in/check-out: danno la città di ogni notte.

I giorni non hanno una tabella: derivano dalle date del viaggio.

## Milestone

1. **Base** — auth, viaggi, membri + invito via link, giorni, attività, alloggi, lista idee,
   insight (buchi, giorni vuoti/pieni, notti scoperte, prenotazioni in scadenza), schermate A1–A6 + A9.
2. **Realtime** — Laravel Reverb: modifiche live, presenza ("Sara sta modificando"), feed attività.
3. **Mappa** — MapLibre, geocoding luoghi, ordine ottimale tappe.
4. **Consigli AI** — Claude legge l'itinerario: idee per buchi, conflitti orari/chiusure, domande libere.
5. **PWA** — manifest, service worker, uso offline, notifiche scadenze prenotazioni.
6. **Desktop board** — vista a colonne con drag & drop dalla lista idee; sondaggi.
