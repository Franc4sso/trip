# Pubblicare Tabi (Supabase + Cloudflare)

## Come funziona, in breve

```
telefono / browser ──▶ Cloudflare (serve solo i file dell'app: HTML, JS, icone)
        │
        └────────────▶ Supabase (tutti i dati, direttamente dal browser)
                         ├─ Auth      → registrazione e login
                         ├─ Postgres  → viaggi, attività, alloggi, membri
                         └─ Realtime  → avvisa gli altri quando qualcuno modifica
```

- **Cloudflare** (Workers con file statici) non ha un database e non esegue codice server: ospita l'app
  già compilata (`dist/`). La configurazione sta in `wrangler.jsonc` (ogni percorso che non è un file
  serve `index.html`) e gli header in `public/_headers`.
  (Prima era su Netlify: `netlify.toml` resta solo come riferimento.)
- **Supabase** è il "backend già pronto". L'app ci parla direttamente con due valori:
  - **Project URL** (es. `https://abcd1234.supabase.co`)
  - **anon key**: è *pubblica*, finisce nel browser. Non è un segreto, perché chi può fare cosa
    lo decidono le regole RLS nel database (`supabase/migrations/…_schema.sql`): uno sconosciuto
    con la anon key non vede nessun viaggio.
  - **service_role key**: è *segreta*, scavalca tutte le regole. Non serve all'app: non metterla mai
    su Cloudflare né nel codice.
- **Migrazioni**: lo schema del database sta nei file `supabase/migrations/*.sql`.
  `supabase db push` li applica al progetto online. Quando cambia lo schema si aggiunge un nuovo file
  e si rifà `db push`.
- `supabase/seed.sql` (gli utenti demo) va **solo** nel database locale, mai online.

## Cosa ti serve

| Cosa | Dove | Costo |
|---|---|---|
| Account Supabase | https://supabase.com (va bene il login con GitHub) | gratis |
| Account Cloudflare | https://dash.cloudflare.com/sign-up | gratis |
| La **password del database** che scegli quando crei il progetto Supabase | salvala in un password manager | — |

Limiti del piano gratuito Supabase da sapere:
- **Il progetto va in pausa dopo 7 giorni senza utilizzo.** Si riattiva dalla dashboard con un click
  (i dati restano). Durante il viaggio lo userete ogni giorno, quindi non è un problema.
- **Le email (conferma account, reset password) del server di default arrivano solo agli indirizzi
  del tuo team Supabase** e sono pochissime all'ora. Per un gruppo di amici conviene **disattivare la
  conferma email** (passo 3). Più avanti si può collegare un servizio email vero (es. Resend).

## Passi

### 1. Crea il progetto Supabase (dal sito)

1. https://supabase.com/dashboard → **New project**.
2. Nome `tabi`, regione **Central EU (Frankfurt)**, scegli una password del database e **salvala**.
3. Aspetta circa 2 minuti che sia pronto.
4. Copia il **Reference ID**: lo trovi nell'URL della dashboard (`/project/<ref>`) o in
   *Project Settings → General*.

### 2. Carica lo schema (dal terminale)

```bash
npx supabase login                          # apre il browser per autorizzare
npx supabase link --project-ref <ref>       # chiede la password del database
npx supabase db push                        # crea tabelle, regole, funzioni
```

### 3. Impostazioni Auth (dal sito)

*Authentication → Sign In / Providers → Email*:
- **Confirm email: OFF** (vedi i limiti sopra).

*Authentication → URL Configuration* (da fare **dopo** il passo 4, quando hai l'indirizzo Cloudflare):
- **Site URL**: `https://tabi.<tuo-account>.workers.dev`
- **Redirect URLs**: aggiungi `https://tabi.<tuo-account>.workers.dev/**`

### 4. Pubblica su Cloudflare

Collegato a GitHub: ogni push su `main` ripubblica da solo.

1. https://dash.cloudflare.com → **Workers & Pages → Create → Import a repository**.
2. Autorizza GitHub e scegli il repository `Franc4sso/trip`.
3. Impostazioni:
   - **Project name**: `tabi` (deve coincidere con `name` in `wrangler.jsonc`)
   - **Build command**: `npm run build`
   - **Deploy command**: `npx wrangler deploy`
4. **Build variables** (non le variabili del Worker: Vite le legge durante la build) →
   `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (valori sotto).
   La versione di Node la prende da `.nvmrc` (22).
5. **Deploy**. L'indirizzo è `https://tabi.<tuo-account>.workers.dev`.

La anon key la trovi in *Project Settings → API Keys* (quella `anon` / `public`).
Se cambi le variabili, rifai il deploy: finiscono nell'app al momento della build.

### 5. Prova e condividi

1. Apri `https://tabi.<tuo-account>.workers.dev`, crea il tuo account e il viaggio.
2. **Gruppo → Condividi link di invito** → mandalo agli amici.
3. Dal telefono: *Condividi → Aggiungi a schermata Home* (iPhone) o *Installa app* (Android).

### 6. Consigli AI (Claude)

I consigli girano in una **Supabase Edge Function** (`supabase/functions/advice`), non su Cloudflare:
sul sito statico non gira codice server, e una risposta ragionata può metterci parecchi secondi.

1. Crea una chiave su https://console.anthropic.com → *API Keys* (serve un metodo di pagamento;
   ogni richiesta costa qualche centesimo, i consigli sono messi in cache finché il viaggio non cambia
   e ogni persona ha al massimo 100 richieste al giorno: è solo una rete di sicurezza, per cambiarla
   aggiungi il secret `AI_DAILY_LIMIT`, es. `npx supabase secrets set AI_DAILY_LIMIT=300`).
2. Supabase → *Edge Functions → Secrets* → aggiungi `ANTHROPIC_API_KEY` con la chiave.
   (Dal terminale: `npx supabase secrets set ANTHROPIC_API_KEY=...`.) La chiave resta solo su Supabase,
   non va mai su Cloudflare né nel codice.
3. Pubblica la funzione: `npx supabase functions deploy advice`.

## Aggiornare l'app

- Codice cambiato → `git push`: Cloudflare ripubblica da solo.
- Schema cambiato (nuova migrazione) → prima `npx supabase db push`, poi il push del codice.
- Funzione dei consigli cambiata → `npx supabase functions deploy advice`.
