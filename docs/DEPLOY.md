# Pubblicare Tabi (Supabase + Netlify)

## Come funziona, in breve

```
telefono / browser ──▶ Netlify  (serve solo i file dell'app: HTML, JS, icone)
        │
        └────────────▶ Supabase (tutti i dati, direttamente dal browser)
                         ├─ Auth      → registrazione e login
                         ├─ Postgres  → viaggi, attività, alloggi, membri
                         └─ Realtime  → avvisa gli altri quando qualcuno modifica
```

- **Netlify** non ha un database e non esegue codice server: ospita l'app già compilata (`dist/`).
- **Supabase** è il "backend già pronto". L'app ci parla direttamente con due valori:
  - **Project URL** (es. `https://abcd1234.supabase.co`)
  - **anon key**: è *pubblica*, finisce nel browser. Non è un segreto, perché chi può fare cosa
    lo decidono le regole RLS nel database (`supabase/migrations/…_schema.sql`): uno sconosciuto
    con la anon key non vede nessun viaggio.
  - **service_role key**: è *segreta*, scavalca tutte le regole. Non serve all'app: non metterla mai
    su Netlify né nel codice.
- **Migrazioni**: lo schema del database sta nei file `supabase/migrations/*.sql`.
  `supabase db push` li applica al progetto online. Quando cambia lo schema si aggiunge un nuovo file
  e si rifà `db push`.
- `supabase/seed.sql` (gli utenti demo) va **solo** nel database locale, mai online.

## Cosa ti serve

| Cosa | Dove | Costo |
|---|---|---|
| Account Supabase | https://supabase.com (va bene il login con GitHub) | gratis |
| Account Netlify | https://netlify.com | gratis |
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

*Authentication → URL Configuration* (da fare **dopo** il passo 4, quando hai l'indirizzo Netlify):
- **Site URL**: `https://<tuo-sito>.netlify.app`
- **Redirect URLs**: aggiungi `https://<tuo-sito>.netlify.app/**`

### 4. Pubblica su Netlify

**Consigliato: collegato a GitHub** (ogni push su `main` ripubblica da solo)

1. https://app.netlify.com → **Add new project → Import an existing project → GitHub** → `Franc4sso/trip`.
2. Build e cartella di output sono già in `netlify.toml`: lascia i valori proposti.
3. Prima di cliccare *Deploy*, apri **Add environment variables** e aggiungi
   `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (valori sotto).
4. **Deploy**. Poi in *Project configuration → Change project name* scegli l'indirizzo (es. `tabi-giappone`).

**In alternativa, dal terminale** (senza GitHub):

```bash
npx netlify login
npx netlify sites:create --name <nome-sito>        # es. tabi-viaggi → tabi-viaggi.netlify.app
npx netlify env:set VITE_SUPABASE_URL https://<ref>.supabase.co
npx netlify env:set VITE_SUPABASE_ANON_KEY <anon-key>
npx netlify deploy --build --prod
```

La anon key la trovi in *Project Settings → API Keys* (quella `anon` / `public`).

### 5. Prova e condividi

1. Apri `https://<nome-sito>.netlify.app`, crea il tuo account e il viaggio.
2. **Gruppo → Condividi link di invito** → mandalo agli amici.
3. Dal telefono: *Condividi → Aggiungi a schermata Home* (iPhone) o *Installa app* (Android).

### 6. Consigli AI (Claude)

I consigli girano in una **Supabase Edge Function** (`supabase/functions/advice`), non su Netlify:
le Netlify Functions gratuite si fermano dopo 10 secondi, una risposta ragionata può metterci di più.

1. Crea una chiave su https://console.anthropic.com → *API Keys* (serve un metodo di pagamento;
   ogni richiesta costa qualche centesimo, i consigli sono messi in cache finché il viaggio non cambia
   e ogni persona ha al massimo 100 richieste al giorno: è solo una rete di sicurezza, per cambiarla
   aggiungi il secret `AI_DAILY_LIMIT`, es. `npx supabase secrets set AI_DAILY_LIMIT=300`).
2. Supabase → *Edge Functions → Secrets* → aggiungi `ANTHROPIC_API_KEY` con la chiave.
   (Dal terminale: `npx supabase secrets set ANTHROPIC_API_KEY=...`.) La chiave resta solo su Supabase,
   non va mai su Netlify né nel codice.
3. Pubblica la funzione: `npx supabase functions deploy advice`.

## Aggiornare l'app

- Codice cambiato → `git push` (con Netlify collegato a GitHub), altrimenti `npx netlify deploy --build --prod`
- Schema cambiato (nuova migrazione) → prima `npx supabase db push`, poi il push del codice.
- Funzione dei consigli cambiata → `npx supabase functions deploy advice`.
