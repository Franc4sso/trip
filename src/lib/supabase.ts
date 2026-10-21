import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
    throw new Error('Mancano VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY: copia .env.example in .env.local');
}

export const supabase = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Turns a Supabase/Postgres error into a sentence for the user. */
export function errorMessage(error: unknown): string {
    if (!error || typeof error !== 'object') return 'Qualcosa è andato storto. Riprova.';
    const e = error as { message?: string; code?: string };
    if (e.code === '42501') return e.message?.startsWith('new row') ? 'Non hai i permessi per farlo.' : (e.message ?? 'Non hai i permessi per farlo.');
    if (e.message === 'Invalid login credentials') return 'Email o password sbagliate.';
    if (e.message === 'User already registered') return 'Esiste già un account con questa email.';
    if (e.message?.includes('Password should be')) return 'La password deve avere almeno 6 caratteri.';
    if (e.message?.includes('Failed to fetch')) return 'Sei offline o il server non risponde.';
    if (e.code === '23514' && e.message && !e.message.includes('violates')) return e.message;
    if (e.code === '23514') return 'Alcuni valori non sono validi: controlla date e campi.';
    return e.message ?? 'Qualcosa è andato storto. Riprova.';
}
