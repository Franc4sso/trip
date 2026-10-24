// AI advice for a trip: suggestions (cached per itinerary version), free questions,
// finding the address of a place the map search did not know (`locate`), photos and info
// about a place (`describe`) and real places around a point for an activity (`suggest`).
// Runs with the caller's JWT, so RLS decides which trip it can read.
//
// Secrets: ANTHROPIC_API_KEY (`supabase secrets set ANTHROPIC_API_KEY=...`).
// SUPABASE_URL and SUPABASE_ANON_KEY are provided by the Edge runtime.

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AdviceSchema, itineraryHash, itineraryText, SYSTEM_PROMPT } from '../../../src/lib/advice.ts';
import {
    DESCRIBE_PROMPT,
    DescribeSchema,
    describeTask,
    httpsUrl,
    MAX_PHOTOS,
    previewImage,
    SUGGEST_PROMPT,
    SuggestSchema,
    suggestTask,
    toInfo,
    type DescribedPlace,
    type DescribeRequest,
    type SuggestedPlace,
    type SuggestRequest,
} from '../../../src/lib/describe.ts';
import { LOCATE_PROMPT, LocateSchema, locateTask, type LocateRequest } from '../../../src/lib/locate.ts';
import { ACTIVITY_TYPE_VALUES, type Activity, type ActivityType, type Stay, type Trip } from '../../../src/lib/types.ts';
import type { z } from 'zod';

const MODEL = 'claude-opus-5-5';
// a safety net against loops and leaked invite links, not a budget: raise it with the AI_DAILY_LIMIT secret
const DAILY_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT')) || 100;

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

    let body: { tripId?: unknown; question?: unknown; refresh?: unknown; locate?: unknown; describe?: unknown; suggest?: unknown };
    try {
        body = await req.json();
    } catch {
        return fail(400, 'Richiesta non valida.');
    }
    const tripId = Number(body.tripId);
    const question = typeof body.question === 'string' ? body.question.trim().slice(0, 500) : '';
    if (!Number.isInteger(tripId) || tripId <= 0) return fail(400, 'Viaggio non valido.');
    if (body.locate !== undefined) return locate(supabase, tripId, body.locate);
    if (body.describe !== undefined) return describe(supabase, tripId, body.describe);
    if (body.suggest !== undefined) return suggest(supabase, tripId, body.suggest);

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

    const blocked = await spendQuota(supabase, tripId, question ? 'question' : 'suggestions');
    if (blocked) return blocked;

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
        return apiFailure(error);
    }
});

type Supabase = SupabaseClient;

/** Checks the key and today's quota, then logs the call. Returns the error response, if any. */
async function spendQuota(supabase: Supabase, tripId: number, kind: 'suggestions' | 'question' | 'locate' | 'describe' | 'suggest'): Promise<Response | null> {
    // say it plainly instead of failing inside the SDK, and before spending today's quota
    if (!Deno.env.get('ANTHROPIC_API_KEY') && !Deno.env.get('ANTHROPIC_AUTH_TOKEN')) {
        return fail(503, 'I consigli AI non sono ancora attivi: manca la chiave Anthropic sul server (vedi docs/DEPLOY.md, passo 6).');
    }
    const { data: left } = await supabase.rpc('ai_requests_left', { p_daily_limit: DAILY_LIMIT });
    if (typeof left === 'number' && left <= 0) return fail(429, `Hai usato le ${DAILY_LIMIT} richieste AI di oggi: riprova domani.`);
    await supabase.from('ai_requests').insert({ trip_id: tripId, kind });
    return null;
}

function apiFailure(error: unknown): Response {
    if (error instanceof Anthropic.RateLimitError) return fail(503, 'Il servizio AI è molto richiesto: riprova tra un minuto.');
    if (error instanceof Anthropic.AuthenticationError) return fail(500, 'AI non configurata: manca la chiave Anthropic.');
    if (error instanceof Anthropic.APIConnectionError) return fail(503, 'Non riesco a raggiungere il servizio AI: riprova.');
    if (error instanceof Anthropic.APIError) return fail(502, `Errore del servizio AI (${error.status}).`);
    console.error(error);
    return fail(500, 'Qualcosa è andato storto.');
}

/** Plausible addresses for a place the map search did not find, looked up on the web. */
async function locate(supabase: Supabase, tripId: number, raw: unknown): Promise<Response> {
    const input = (raw ?? {}) as Record<string, unknown>;
    const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const req: LocateRequest = {
        query: text(input.query, 200),
        hint: text(input.hint, 255) || null,
        city: text(input.city, 120) || null,
        kind: input.kind === 'stay' ? 'stay' : 'activity',
    };
    if (!req.query) return fail(400, 'Scrivi prima il nome del luogo da cercare.');

    // RLS: only members of the trip may spend AI calls on it
    const { data: trip } = await supabase.from('trips').select('id').eq('id', tripId).maybeSingle();
    if (!trip) return fail(404, 'Viaggio non trovato.');

    const blocked = await spendQuota(supabase, tripId, 'locate');
    if (blocked) return blocked;

    try {
        const response = await searchAndAnswer(LOCATE_PROMPT, locateTask(req), LocateSchema, 3);
        const failed = answerFailure(response, 'Non posso cercare questo luogo: prova a riformulare il nome.');
        if (failed) return failed;
        return json(response!.parsed_output);
    } catch (error) {
        return apiFailure(error);
    }
}

/**
 * One structured answer from the model with web search, the way every lookup here works:
 * a long search turn can pause (resumed server-side), and where web search is off for the
 * organization the model answers from what it knows.
 */
async function searchAndAnswer<T extends z.ZodType>(system: string, task: string, schema: T, searches: number) {
    const ask = async (withSearch: boolean) => {
        const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: task }];
        for (let turn = 0; turn < 3; turn++) {
            const response = await anthropic.beta.messages.parse({
                model: MODEL,
                max_tokens: 16000,
                betas: ['server-side-fallback-2026-07-01'],
                fallbacks: 'default',
                // a lookup, not a hard problem: low effort means fewer, more focused searches and a much faster answer
                output_config: { effort: 'low', format: betaZodOutputFormat(schema) },
                system,
                tools: withSearch ? [{ type: 'web_search_20260209', name: 'web_search', max_uses: searches }] : undefined,
                messages,
            });
            if (response.stop_reason !== 'pause_turn') return response;
            messages.push({ role: 'assistant', content: response.content });
        }
        return null;
    };
    try {
        return await ask(true);
    } catch (error) {
        // web search off for this organization (or not combinable here): answer from what the model knows
        if (!(error instanceof Anthropic.BadRequestError)) throw error;
        console.warn('lookup without web search:', error.message);
        return await ask(false);
    }
}

/** The error response for an answer we cannot use, if any. */
function answerFailure(response: { stop_reason: string | null; parsed_output: unknown } | null, refusal: string): Response | null {
    if (!response) return fail(504, 'La ricerca sta durando troppo: riprova.');
    if (response.stop_reason === 'refusal') return fail(422, refusal);
    if (response.stop_reason === 'max_tokens' || !response.parsed_output) return fail(502, 'La risposta è arrivata incompleta: riprova.');
    return null;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const activityType = (v: unknown): ActivityType => (ACTIVITY_TYPE_VALUES.includes(v as ActivityType) ? (v as ActivityType) : 'visit');

/** RLS: only members of the trip may spend AI calls on it. Returns its currency. */
async function memberTrip(supabase: Supabase, tripId: number): Promise<{ currency: string } | null> {
    const { data } = await supabase.from('trips').select('currency').eq('id', tripId).maybeSingle();
    return data;
}

/** Photos and the facts that help to understand a place, for an activity or one of its options. */
async function describe(supabase: Supabase, tripId: number, raw: unknown): Promise<Response> {
    const input = (raw ?? {}) as Record<string, unknown>;
    const trip = await memberTrip(supabase, tripId);
    if (!trip) return fail(404, 'Viaggio non trovato.');
    const req: DescribeRequest = {
        query: str(input.query, 200),
        type: activityType(input.type),
        address: str(input.address, 255) || null,
        city: str(input.city, 120) || null,
        currency: trip.currency,
    };
    if (!req.query) return fail(400, 'Scrivi prima il nome del posto.');

    const blocked = await spendQuota(supabase, tripId, 'describe');
    if (blocked) return blocked;

    try {
        const response = await searchAndAnswer(DESCRIBE_PROMPT, describeTask(req), DescribeSchema, 3);
        const failed = answerFailure(response, 'Non posso descrivere questo posto: prova a riformulare il nome.');
        if (failed) return failed;
        const d = response!.parsed_output!;
        const photos = d.found ? await checkedPhotos(d.image_urls, d.source_urls, [req.query, req.city].filter(Boolean).join(' ')) : [];
        const place: DescribedPlace = { found: d.found, address: d.address, city: d.city, latitude: d.latitude, longitude: d.longitude, info: toInfo(d, photos) };
        return json(place);
    } catch (error) {
        return apiFailure(error);
    }
}

/** Real places around a point for an activity slot, each already described. */
async function suggest(supabase: Supabase, tripId: number, raw: unknown): Promise<Response> {
    const input = (raw ?? {}) as Record<string, unknown>;
    const near = (input.near ?? {}) as Record<string, unknown>;
    const trip = await memberTrip(supabase, tripId);
    if (!trip) return fail(404, 'Viaggio non trovato.');
    const latitude = Number(near.latitude);
    const longitude = Number(near.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        return fail(400, 'Manca il punto di partenza.');
    }
    const date = str(input.date, 10);
    const time = str(input.start_time, 5);
    const req: SuggestRequest = {
        title: str(input.title, 200) || 'Qualcosa da fare',
        type: activityType(input.type),
        date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
        start_time: /^\d{2}:\d{2}$/.test(time) ? time : null,
        near: { latitude, longitude, label: str(near.label, 120) || 'il punto indicato' },
        city: str(input.city, 120) || null,
        currency: trip.currency,
        exclude: Array.isArray(input.exclude) ? input.exclude.slice(0, 20).map((e) => str(e, 120)).filter(Boolean) : [],
    };

    const blocked = await spendQuota(supabase, tripId, 'suggest');
    if (blocked) return blocked;

    try {
        const response = await searchAndAnswer(SUGGEST_PROMPT, suggestTask(req), SuggestSchema, 5);
        const failed = answerFailure(response, 'Non posso proporre posti per questa richiesta: prova a cambiare il titolo.');
        if (failed) return failed;
        const places: SuggestedPlace[] = await Promise.all(
            response!.parsed_output!.places.slice(0, 5).map(async (p) => ({
                name: p.name,
                address: p.address,
                city: p.city,
                latitude: p.latitude,
                longitude: p.longitude,
                walk: p.walk,
                why: p.why,
                info: toInfo(p, await checkedPhotos(p.image_urls, p.source_urls, [p.name, p.city].filter(Boolean).join(' '))),
            })),
        );
        return json({ places });
    } catch (error) {
        return apiFailure(error);
    }
}

// ---------------------------------------------------------------- photos

const FETCH_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; TabiBot/1.0; trip planner)', Accept: 'text/html,image/*;q=0.9,*/*;q=0.5' };

/** Only public https hosts by name: these urls come from the web, not from us. */
function fetchable(url: string | null): url is string {
    if (!url) return false;
    const { hostname, port } = new URL(url);
    return !port && hostname.includes('.') && !/^[\d.]+$/.test(hostname) && !hostname.includes(':') && !/(^|\.)(localhost|internal|local)$/.test(hostname);
}

async function isImage(url: string): Promise<boolean> {
    try {
        const res = await fetch(url, { headers: FETCH_HEADERS, redirect: 'follow', signal: AbortSignal.timeout(4000) });
        await res.body?.cancel();
        return res.ok && (res.headers.get('content-type') ?? '').startsWith('image/');
    } catch {
        return false;
    }
}

async function pagePreview(url: string): Promise<string | null> {
    try {
        const res = await fetch(url, { headers: FETCH_HEADERS, redirect: 'follow', signal: AbortSignal.timeout(5000) });
        if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) {
            await res.body?.cancel();
            return null;
        }
        // the preview tags are in <head>: the first 200 KB are plenty
        return previewImage((await res.text()).slice(0, 200_000), res.url || url);
    } catch {
        return null;
    }
}

/** The main picture of the best matching Wikipedia article, when it has one. */
async function wikipediaPhoto(query: string): Promise<string | null> {
    const params = new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrsearch: query, gsrlimit: '1', prop: 'pageimages', piprop: 'original' });
    try {
        const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(4000) });
        const data = await res.json();
        const page = Object.values(data?.query?.pages ?? {})[0] as { original?: { source?: string } } | undefined;
        return httpsUrl(page?.original?.source ?? '');
    } catch {
        return null;
    }
}

/**
 * Photos that really load: the model's own image urls first, then the preview image of
 * the pages it read, then Wikipedia. The model may misremember a url, the pages do not.
 */
async function checkedPhotos(imageUrls: string[], sourceUrls: string[], query: string): Promise<string[]> {
    const candidates = imageUrls.map((u) => httpsUrl(u)).filter(fetchable).slice(0, MAX_PHOTOS + 2);
    const found = (await Promise.all(candidates.map(async (u) => ((await isImage(u)) ? u : null)))).filter((u): u is string => !!u);
    if (found.length < 2) {
        const pages = sourceUrls.map((u) => httpsUrl(u)).filter(fetchable).slice(0, 3);
        for (const preview of await Promise.all(pages.map(pagePreview))) {
            if (fetchable(preview) && !found.includes(preview) && (await isImage(preview))) found.push(preview);
        }
    }
    if (found.length === 0) {
        const wiki = await wikipediaPhoto(query);
        if (wiki) found.push(wiki);
    }
    return [...new Set(found)].slice(0, MAX_PHOTOS);
}
