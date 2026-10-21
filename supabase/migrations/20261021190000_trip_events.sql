-- Activity feed: what changed in a trip and who did it ("Sara ha aggiunto Kiyomizu-dera").
-- Rows are written only by triggers; members read them and receive them through Realtime.

create table public.trip_events (
    id bigint generated always as identity primary key,
    trip_id bigint not null references public.trips on delete cascade,
    actor uuid references public.profiles on delete set null,
    action text not null check (action in ('added', 'updated', 'deleted', 'booked', 'joined', 'left', 'role')),
    entity text not null check (entity in ('activity', 'stay', 'member')),
    label text not null,
    created_at timestamptz not null default now()
);

create index trip_events_trip_idx on public.trip_events (trip_id, created_at desc);

alter table public.trip_events enable row level security;
create policy "members see the feed" on public.trip_events for select to authenticated using (public.is_member(trip_id));
revoke insert, update, delete on public.trip_events from authenticated, anon;

create function public.log_trip_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
    rec record := coalesce(new, old);
    act text;
    lbl text;
    ent text;
    who uuid := auth.uid();
begin
    -- the whole trip is going away: nothing to log
    if not exists (select 1 from public.trips where id = rec.trip_id) then
        return null;
    end if;

    if tg_table_name = 'activities' then
        ent := 'activity';
        lbl := rec.title;
        if tg_op = 'UPDATE' then
            if new.booked and not old.booked then
                act := 'booked';
            elsif (new.title, new.date, new.start_time, new.duration_minutes, new.location)
                  is not distinct from (old.title, old.date, old.start_time, old.duration_minutes, old.location) then
                return null; -- notes, costs and the like: not worth a feed line
            end if;
        end if;
    elsif tg_table_name = 'stays' then
        ent := 'stay';
        lbl := rec.name;
        if tg_op = 'UPDATE' and new.confirmed and not old.confirmed then
            act := 'booked';
        end if;
    else
        ent := 'member';
        lbl := coalesce((select name from public.profiles where id = rec.user_id), '—');
        act := case tg_op when 'INSERT' then 'joined' when 'DELETE' then 'left' else 'role' end;
        who := coalesce(who, rec.user_id);
        if tg_op = 'UPDATE' and new.role = old.role then
            return null;
        end if;
    end if;

    act := coalesce(act, case tg_op when 'INSERT' then 'added' when 'UPDATE' then 'updated' else 'deleted' end);

    insert into public.trip_events (trip_id, actor, action, entity, label)
    values (rec.trip_id, who, act, ent, lbl);

    -- keep the feed short
    delete from public.trip_events
    where trip_id = rec.trip_id
      and id < (select id from public.trip_events where trip_id = rec.trip_id order by id desc offset 199 limit 1);

    return null;
end;
$$;

create trigger activities_log after insert or update or delete on public.activities for each row execute function public.log_trip_event();
create trigger stays_log after insert or update or delete on public.stays for each row execute function public.log_trip_event();
create trigger trip_members_log after insert or update or delete on public.trip_members for each row execute function public.log_trip_event();

alter publication supabase_realtime add table public.trip_events;
