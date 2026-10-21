-- AI advice (supabase/functions/advice). The function runs with the caller's JWT, so
-- these policies are what keeps one trip's advice and one person's quota apart.

-- Last suggestions per trip, reused while the itinerary is unchanged.
create table public.trip_advice (
    trip_id bigint primary key references public.trips on delete cascade,
    itinerary_hash text not null,
    payload jsonb not null,
    created_at timestamptz not null default now()
);

alter table public.trip_advice enable row level security;
create policy "members read advice" on public.trip_advice for select to authenticated using (public.is_member(trip_id));
create policy "members store advice" on public.trip_advice for insert to authenticated with check (public.is_member(trip_id));
create policy "members refresh advice" on public.trip_advice for update to authenticated using (public.is_member(trip_id)) with check (public.is_member(trip_id));

-- One row per model call, for the daily quota.
create table public.ai_requests (
    id bigint generated always as identity primary key,
    user_id uuid not null default auth.uid() references public.profiles on delete cascade,
    trip_id bigint not null references public.trips on delete cascade,
    kind text not null check (kind in ('suggestions', 'question')),
    created_at timestamptz not null default now()
);

create index ai_requests_user_day_idx on public.ai_requests (user_id, created_at desc);

alter table public.ai_requests enable row level security;
create policy "see your own requests" on public.ai_requests for select to authenticated using (user_id = auth.uid());
create policy "log your own requests" on public.ai_requests for insert to authenticated
    with check (user_id = auth.uid() and public.is_member(trip_id));
revoke update, delete on public.ai_requests from authenticated, anon;

-- Calls left today for the signed-in user.
create function public.ai_requests_left(p_daily_limit int default 30) returns int
language sql stable security invoker set search_path = '' as $$
    select greatest(0, p_daily_limit - count(*)::int)
    from public.ai_requests
    where user_id = auth.uid() and created_at > now() - interval '1 day';
$$;
