// AI advice for a trip: suggestions (cached per itinerary version) and free questions.
// Runs with the caller's JWT, so RLS decides which trip it can read.
//
// Secrets: ANTHROPIC_API_KEY (`supabase secrets set ANTHROPIC_API_KEY=...`).
// SUPABASE_URL and SUPABASE_ANON_KEY are provided by the Edge runtime.

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { createClient } from '@supabase/supabase-js';
import { AdviceSchema, itineraryHash, itineraryText, SYSTEM_PROMPT } from '../../../src/lib/advice.ts';
import type { Activity, Stay, Trip } from '../../../src/lib/types.ts';

const MODEL = 'claude-opus-5-5';
const DAILY_LIMIT = 30;

const TRIP_COLUMNS = 'id, name, destination, start_date, end_date, color, currency';
const ACTIVITY_COLUMNS =
    'id, trip_id, created_by, date, start_time, duration_minutes, type, title, location, city, notes, cost, booking_required, booking_deadline, booked, booking_url, latitude, longitude';
const STAY_COLUMNS = 'id, trip_id, name, city, address, check_in, check_out, confirmed, booking_ref, cost, notes, latitude, longitude';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (status: number, message: string) => json({ error: message }, status);

const anthropic = new Anthropic();

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return fail(405, 'Usa POST.');

    const authorization = req.headers.get('Authorization') ?? '';
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false },
    });
    const { data: auth } = await supabase.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
    if (!auth.user) return fail(401, 'Accedi per chiedere consigli.');

    let body: { tripId?: unknown; question?: unknown; refresh?: unknown };
    try {
        body = await req.json();
    } catch {
        return fail(400, 'Richiesta non valida.');
    }
    const tripId = Number(body.tripId);
    const question = typeof body.question === 'string' ? body.question.trim().slice(0, 500) : '';
    if (!Number.isInteger(tripId) || tripId <= 0) return fail(400, 'Viaggio non valido.');

    // RLS: a trip you are not a member of simply does not exist here
    const [tripRes, activitiesRes, staysRes] = await Promise.all([
        supabase.from('trips').select(TRIP_COLUMNS).eq('id', tripId).maybeSingle(),
        supabase.from('activities').select(ACTIVITY_COLUMNS).eq('trip_id', tripId),
        supabase.from('stays').select(STAY_COLUMNS).eq('trip_id', tripId),
    ]);
    if (tripRes.error || activitiesRes.error || staysRes.error) return fail(500, 'Non riesco a leggere il viaggio.');
    if (!tripRes.data) return fail(404, 'Viaggio non trovato.');

    const trip = tripRes.data as Trip;
    const activities = (activitiesRes.data as Activity[]).map((a) => ({ ...a, start_time: a.start_time?.slice(0, 5) ?? null }));
    const itinerary = itineraryText(trip, activities, staysRes.data as Stay[]);
    const hash = await itineraryHash(itinerary);

    // suggestions for an unchanged itinerary: serve the stored ones, no model call
    if (!question && body.refresh !== true) {
        const { data: cached } = await supabase.from('trip_advice').select('payload, itinerary_hash, created_at').eq('trip_id', tripId).maybeSingle();
        if (cached?.itinerary_hash === hash) return json({ ...cached.payload, cached: true, created_at: cached.created_at, itinerary_hash: hash });
    }

    // say it plainly instead of failing inside the SDK, and before spending today's quota
    if (!Deno.env.get('ANTHROPIC_API_KEY') && !Deno.env.get('ANTHROPIC_AUTH_TOKEN')) {
        return fail(503, 'I consigli AI non sono ancora attivi: manca la chiave Anthropic sul server (vedi docs/DEPLOY.md, passo 6).');
    }

    const { data: left } = await supabase.rpc('ai_requests_left', { p_daily_limit: DAILY_LIMIT });
    if (typeof left === 'number' && left <= 0) return fail(429, `Hai usato i ${DAILY_LIMIT} consigli di oggi: riprova domani.`);
    await supabase.from('ai_requests').insert({ trip_id: tripId, kind: question ? 'question' : 'suggestions' });

    const task = question
        ? `Domanda del gruppo: «${question}»\nRispondi in "answer" e aggiungi solo i consigli collegati alla domanda (anche 0).`
        : 'Dai i consigli più utili per questo itinerario adesso. "answer" deve essere null.';

    try {
        const response = await anthropic.beta.messages.parse({
            model: MODEL,
            max_tokens: 16000,
            // on a safety decline, retry server-side on Anthropic's recommended fallback model
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            output_config: { effort: 'medium', format: betaZodOutputFormat(AdviceSchema) },
            system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
            messages: [
                {
                    role: 'user',
                    content: [
                        // stable across questions on the same itinerary: cache it
                        { type: 'text', text: itinerary, cache_control: { type: 'ephemeral' } },
                        { type: 'text', text: task },
                    ],
                },
            ],
        });

        if (response.stop_reason === 'refusal') return fail(422, 'Non posso rispondere a questa richiesta: prova a riformularla.');
        if (response.stop_reason === 'max_tokens' || !response.parsed_output) return fail(502, 'La risposta è arrivata incompleta: riprova.');

        const advice = response.parsed_output;
        if (!question) {
            await supabase.from('trip_advice').upsert({ trip_id: tripId, itinerary_hash: hash, payload: advice, created_at: new Date().toISOString() });
        }
        return json({ ...advice, cached: false, created_at: new Date().toISOString(), itinerary_hash: hash });
    } catch (error) {
        if (error instanceof Anthropic.RateLimitError) return fail(503, 'Il servizio di consigli è molto richiesto: riprova tra un minuto.');
        if (error instanceof Anthropic.AuthenticationError) return fail(500, 'Consigli non configurati: manca la chiave Anthropic.');
        if (error instanceof Anthropic.APIConnectionError) return fail(503, 'Non riesco a raggiungere il servizio di consigli: riprova.');
        if (error instanceof Anthropic.APIError) return fail(502, `Errore del servizio di consigli (${error.status}).`);
        console.error(error);
        return fail(500, 'Qualcosa è andato storto.');
    }
});
