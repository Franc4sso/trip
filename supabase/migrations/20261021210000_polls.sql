-- Group polls ("Nara o Himeji il 13?"): editors open them, every member votes once.

create table public.polls (
    id bigint generated always as identity primary key,
    trip_id bigint not null references public.trips on delete cascade,
    created_by uuid references public.profiles on delete set null default auth.uid(),
    question text not null check (char_length(question) between 1 and 200),
    closed boolean not null default false,
    created_at timestamptz not null default now()
);

create table public.poll_options (
    id bigint generated always as identity primary key,
    poll_id bigint not null references public.polls on delete cascade,
    label text not null check (char_length(label) between 1 and 120),
    -- optional link to an idea or activity the option stands for
    activity_id bigint references public.activities on delete set null,
    position smallint not null default 0
);

create table public.poll_votes (
    poll_id bigint not null references public.polls on delete cascade,
    option_id bigint not null references public.poll_options on delete cascade,
    user_id uuid not null default auth.uid() references public.profiles on delete cascade,
    created_at timestamptz not null default now(),
    primary key (poll_id, user_id)
);

create index polls_trip_idx on public.polls (trip_id, created_at desc);
create index poll_options_poll_idx on public.poll_options (poll_id);

-- trip of a poll, for policies on options and votes
create function public.poll_trip(p_poll bigint) returns bigint
language sql stable security definer set search_path = '' as $$
    select trip_id from public.polls where id = p_poll;
$$;

-- a vote must point at an option of the same poll
create function public.check_vote_option() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    if not exists (select 1 from public.poll_options where id = new.option_id and poll_id = new.poll_id) then
        raise exception 'Opzione non valida per questo sondaggio' using errcode = '23514';
    end if;
    if exists (select 1 from public.polls where id = new.poll_id and closed) then
        raise exception 'Il sondaggio è chiuso' using errcode = '23514';
    end if;
    return new;
end;
$$;

create trigger poll_votes_check before insert or update on public.poll_votes for each row execute function public.check_vote_option();

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

create policy "members see polls" on public.polls for select to authenticated using (public.is_member(trip_id));
create policy "editors open polls" on public.polls for insert to authenticated with check (public.can_edit(trip_id) and created_by = auth.uid());
create policy "author or owner closes polls" on public.polls for update to authenticated
    using (created_by = auth.uid() or public.is_owner(trip_id)) with check (public.is_member(trip_id));
create policy "author or owner deletes polls" on public.polls for delete to authenticated using (created_by = auth.uid() or public.is_owner(trip_id));
revoke update on public.polls from authenticated, anon;
grant update (closed) on public.polls to authenticated;

create policy "members see options" on public.poll_options for select to authenticated using (public.is_member(public.poll_trip(poll_id)));
create policy "poll author adds options" on public.poll_options for insert to authenticated
    with check (exists (select 1 from public.polls p where p.id = poll_id and p.created_by = auth.uid()));
revoke update, delete on public.poll_options from authenticated, anon;

create policy "members see votes" on public.poll_votes for select to authenticated using (public.is_member(public.poll_trip(poll_id)));
create policy "members vote for themselves" on public.poll_votes for insert to authenticated
    with check (user_id = auth.uid() and public.is_member(public.poll_trip(poll_id)));
create policy "members change their vote" on public.poll_votes for update to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member(public.poll_trip(poll_id)));
create policy "members take back their vote" on public.poll_votes for delete to authenticated using (user_id = auth.uid());
revoke update on public.poll_votes from authenticated, anon;
grant update (option_id) on public.poll_votes to authenticated;

-- votes carry no trip_id, so clients listen to all votes they may see and refetch
alter publication supabase_realtime add table public.polls, public.poll_votes;
