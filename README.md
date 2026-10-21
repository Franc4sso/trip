# Tabi · 旅

PWA per pianificare viaggi in gruppo: giorni, attività, alloggi, prenotazioni e lista idee,
condivisi in tempo reale con chi parte con te.

- **Frontend**: React 19 + Vite + Tailwind 4, installabile come PWA. Deploy su **Netlify**.
- **Backend**: **Supabase** (Auth, Postgres con RLS, Realtime, Edge Functions). Nessun server da gestire.
- **Consigli AI**: Claude (Anthropic) tramite la Edge Function `advice`.
- **Mappe e luoghi**: OpenStreetMap (OpenFreeMap per le mappe, Photon per la ricerca), senza chiavi.

Mockup di riferimento: https://claude.ai/artifact/KHpwk1qW6LLcZwt4c62RyA

## Sviluppo in locale

Serve Docker (per Supabase locale) e Node 22.

```bash
npm install
npx supabase start                # avvia Postgres, Auth, Realtime in Docker
npx supabase db reset             # applica migrazioni + dati demo (supabase/seed.sql)
npx supabase status -o env        # copia API_URL e ANON_KEY in .env.local (vedi .env.example)
npm run dev

# consigli AI in locale (opzionale): serve una chiave Anthropic
echo "ANTHROPIC_API_KEY=sk-ant-..." > supabase/functions/.env
npx supabase functions serve advice --env-file supabase/functions/.env
```

Utente demo: `demo@tabi.test` / `password` (anche `ale@`, `sara@`, `davide@tabi.test`).

### Test

```bash
npm test                          # logica dei giorni: buchi, giorni pieni/vuoti, notti scoperte
npx supabase test db              # permessi (RLS), inviti, feed, sondaggi, vincoli sulle date
```

## Deploy

### 1. Supabase (una volta)

1. Crea un progetto su https://supabase.com (piano gratuito).
2. Collega e applica lo schema:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref-del-progetto>
   npx supabase db push
   ```
3. In **Authentication → URL Configuration** imposta *Site URL* sull'indirizzo Netlify
   (es. `https://tabi.netlify.app`) e aggiungilo ai *Redirect URLs*.
4. Da **Project Settings → API** prendi `Project URL` e la chiave `anon public`.

### 2. Netlify

1. *Add new site → Import from Git* e scegli questo repository (build e redirect sono in `netlify.toml`).
2. In **Site configuration → Environment variables** aggiungi:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Deploy. Ogni push sul branch principale ripubblica il sito.

La chiave `anon` è pensata per stare nel browser: i dati sono protetti dalle policy RLS in
`supabase/migrations`. Non mettere mai la chiave `service_role` su Netlify.

## Struttura

```
src/
  lib/insights.ts      analisi del viaggio (buchi, giorni pieni/vuoti, notti scoperte, prenotazioni)
  lib/api.ts           query Supabase + aggiornamenti realtime
  lib/advice.ts        itinerario per Claude e schema dei consigli (condiviso con la Edge Function)
  lib/presence.tsx     chi è online e cosa sta modificando
  lib/offline.ts       cache sul dispositivo e stato della connessione
  pages/               schermate (lista viaggi, panoramica, giorno, bilancio, prenotazioni, gruppo)
  components/          UI condivisa, bottom sheet per attività e alloggi
supabase/
  migrations/          schema, RLS, funzioni (create_trip, join_trip, inviti), feed, sondaggi, consigli
  functions/advice/    Edge Function dei consigli AI
  tests/database/      test pgTAP dei permessi
  seed.sql             viaggio demo
```
