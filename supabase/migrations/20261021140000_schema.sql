-- Tabi schema: trips shared between members, with days derived from trip dates.
-- Permissions live in RLS policies; helper functions are SECURITY DEFINER so
-- policies can check membership without recursing into trip_members' own RLS.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- profiles

create table public.profiles (
    id uuid primary key references auth.users on delete cascade,
    name text not null check (char_length(name) between 1 and 80),
    created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    insert into public.profiles (id, name)
    values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)));
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- trips

create table public.trips (
    id bigint generated always as identity primary key,
    name text not null check (char_length(name) between 1 and 120),
    destination text check (char_length(destination) <= 200),
    start_date date not null,
    end_date date not null,
    color text not null default '#2F43C9' check (color ~ '^#[0-9A-Fa-f]{6}$'),
    currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
    invite_token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
    created_by uuid references auth.users on delete set null default auth.uid(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint trip_dates check (end_date >= start_date and end_date - start_date <= 90)
);

create type public.trip_role as enum ('owner', 'editor', 'viewer');

create table public.trip_members (
    trip_id bigint not null references public.trips on delete cascade,
    user_id uuid not null references public.profiles on delete cascade,
    role public.trip_role not null default 'editor',
    created_at timestamptz not null default now(),
    primary key (trip_id, user_id)
);

create index trip_members_user_idx on public.trip_members (user_id);

-- ---------------------------------------------------------------- activities

create type public.activity_type as enum ('visit', 'food', 'transport', 'experience', 'shopping', 'note');

create table public.activities (
    id bigint generated always as identity primary key,
    trip_id bigint not null references public.trips on delete cascade,
    created_by uuid references public.profiles on delete set null default auth.uid(),
    -- null date = idea in the wishlist, not placed on a day yet
    date date,
    start_time time,
    duration_minutes smallint check (duration_minutes between 0 and 1440),
    type public.activity_type not null,
    title text not null check (char_length(title) between 1 and 200),
    location text check (char_length(location) <= 255),
    city text check (char_length(city) <= 120),
    notes text check (char_length(notes) <= 5000),
    cost integer check (cost >= 0),
    booking_required boolean not null default false,
    booking_deadline date,
    booked boolean not null default false,
    booking_url text check (booking_url ~* '^https?://' and char_length(booking_url) <= 2048),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint idea_has_no_time check (date is not null or start_time is null)
);

create index activities_trip_date_idx on public.activities (trip_id, date);

-- ---------------------------------------------------------------- stays

create table public.stays (
    id bigint generated always as identity primary key,
    trip_id bigint not null references public.trips on delete cascade,
    name text not null check (char_length(name) between 1 and 200),
    city text not null check (char_length(city) between 1 and 120),
    address text check (char_length(address) <= 255),
    check_in date not null,
    check_out date not null,
    confirmed boolean not null default false,
    booking_ref text check (char_length(booking_ref) <= 120),
    cost integer check (cost >= 0),
    notes text check (char_length(notes) <= 5000),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint stay_dates check (check_out > check_in)
);

create index stays_trip_idx on public.stays (trip_id, check_in);

-- ---------------------------------------------------------------- integrity triggers

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger trips_touch before update on public.trips for each row execute function public.touch_updated_at();
create trigger activities_touch before update on public.activities for each row execute function public.touch_updated_at();
create trigger stays_touch before update on public.stays for each row execute function public.touch_updated_at();

-- The creator of a trip becomes its owner.
create function public.add_trip_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    if auth.uid() is not null then
        insert into public.trip_members (trip_id, user_id, role) values (new.id, auth.uid(), 'owner');
    end if;
    return new;
end;
$$;

create trigger trips_add_owner after insert on public.trips for each row execute function public.add_trip_owner();

-- Activities and stays must fall inside the trip.
create function public.check_within_trip() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
    t public.trips;
begin
    select * into t from public.trips where id = new.trip_id;
    if tg_table_name = 'activities' then
        if new.date is not null and (new.date < t.start_date or new.date > t.end_date) then
            raise exception 'La data deve essere tra % e %', t.start_date, t.end_date using errcode = '23514';
        end if;
    elsif new.check_in < t.start_date or new.check_out > t.end_date then
        raise exception 'L''alloggio deve essere tra % e %', t.start_date, t.end_date using errcode = '23514';
    end if;
    return new;
end;
$$;

create trigger activities_within_trip before insert or update on public.activities for each row execute function public.check_within_trip();
create trigger stays_within_trip before insert or update on public.stays for each row execute function public.check_within_trip();

-- A trip always keeps at least one owner.
create function public.keep_an_owner() returns trigger
language plpgsql set search_path = '' as $$
begin
    if old.role = 'owner'
        and (tg_op = 'DELETE' or new.role <> 'owner')
        and exists (select 1 from public.trips where id = old.trip_id)
        and not exists (
            select 1 from public.trip_members
            where trip_id = old.trip_id and role = 'owner' and user_id <> old.user_id
        ) then
        raise exception 'Il viaggio deve avere almeno un organizzatore' using errcode = '23514';
    end if;
    return coalesce(new, old);
end;
$$;

create trigger trip_members_keep_owner before update or delete on public.trip_members for each row execute function public.keep_an_owner();

-- ---------------------------------------------------------------- permission helpers

create function public.trip_role_of(p_trip bigint) returns public.trip_role
language sql stable security definer set search_path = '' as $$
    select role from public.trip_members where trip_id = p_trip and user_id = auth.uid();
$$;

create function public.is_member(p_trip bigint) returns boolean
language sql stable as $$ select public.trip_role_of(p_trip) is not null $$;

create function public.can_edit(p_trip bigint) returns boolean
language sql stable as $$ select public.trip_role_of(p_trip) in ('owner', 'editor') $$;

create function public.is_owner(p_trip bigint) returns boolean
language sql stable as $$ select public.trip_role_of(p_trip) = 'owner' $$;

-- ---------------------------------------------------------------- RLS

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.activities enable row level security;
alter table public.stays enable row level security;

create policy "see yourself and travel mates" on public.profiles for select to authenticated
    using (
        id = auth.uid()
        or exists (
            select 1 from public.trip_members mine
            join public.trip_members theirs on theirs.trip_id = mine.trip_id
            where mine.user_id = auth.uid() and theirs.user_id = profiles.id
        )
    );
create policy "edit your profile" on public.profiles for update to authenticated
    using (id = auth.uid()) with check (id = auth.uid());

create policy "members see the trip" on public.trips for select to authenticated using (public.is_member(id));
create policy "editors change the trip" on public.trips for update to authenticated using (public.can_edit(id)) with check (public.can_edit(id));
create policy "owners delete the trip" on public.trips for delete to authenticated using (public.is_owner(id));

-- trips are created through create_trip(); invite_token is readable only through get_invite_token()
revoke insert, select on public.trips from authenticated, anon;
grant select (id, name, destination, start_date, end_date, color, currency, created_by, created_at, updated_at) on public.trips to authenticated;
revoke update on public.trips from authenticated, anon;
grant update (name, destination, start_date, end_date, color, currency) on public.trips to authenticated;

create policy "members see members" on public.trip_members for select to authenticated using (public.is_member(trip_id));
create policy "owners change roles of others" on public.trip_members for update to authenticated
    using (public.is_owner(trip_id) and user_id <> auth.uid()) with check (public.is_owner(trip_id));
create policy "owners remove members, anyone leaves" on public.trip_members for delete to authenticated
    using (public.is_owner(trip_id) or user_id = auth.uid());
revoke update on public.trip_members from authenticated, anon;
grant update (role) on public.trip_members to authenticated;

create policy "members see activities" on public.activities for select to authenticated using (public.is_member(trip_id));
create policy "editors add activities" on public.activities for insert to authenticated with check (public.can_edit(trip_id));
create policy "editors change activities" on public.activities for update to authenticated using (public.can_edit(trip_id)) with check (public.can_edit(trip_id));
create policy "editors delete activities" on public.activities for delete to authenticated using (public.can_edit(trip_id));

create policy "members see stays" on public.stays for select to authenticated using (public.is_member(trip_id));
create policy "editors add stays" on public.stays for insert to authenticated with check (public.can_edit(trip_id));
create policy "editors change stays" on public.stays for update to authenticated using (public.can_edit(trip_id)) with check (public.can_edit(trip_id));
create policy "editors delete stays" on public.stays for delete to authenticated using (public.can_edit(trip_id));

-- ---------------------------------------------------------------- trip creation

-- Creates a trip owned by the caller (the owner row comes from trips_add_owner).
create function public.create_trip(
    p_name text, p_destination text, p_start date, p_end date,
    p_color text default '#2F43C9', p_currency text default 'EUR'
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
    t_id bigint;
begin
    if auth.uid() is null then
        raise exception 'Accedi per creare un viaggio' using errcode = '42501';
    end if;
    insert into public.trips (name, destination, start_date, end_date, color, currency, created_by)
    values (p_name, nullif(trim(p_destination), ''), p_start, p_end, coalesce(p_color, '#2F43C9'), upper(coalesce(p_currency, 'EUR')), auth.uid())
    returning id into t_id;
    return t_id;
end;
$$;

-- ---------------------------------------------------------------- invites

create function public.get_invite_token(p_trip bigint) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
    if not public.is_owner(p_trip) then
        raise exception 'Solo gli organizzatori vedono il link di invito' using errcode = '42501';
    end if;
    return (select invite_token from public.trips where id = p_trip);
end;
$$;

create function public.regenerate_invite(p_trip bigint) returns text
language plpgsql security definer set search_path = '' as $$
declare
    token text := encode(extensions.gen_random_bytes(18), 'hex');
begin
    if not public.is_owner(p_trip) then
        raise exception 'Solo gli organizzatori cambiano il link di invito' using errcode = '42501';
    end if;
    update public.trips set invite_token = token where id = p_trip;
    return token;
end;
$$;

-- Joins the trip behind an invite link as editor; returns its id.
create function public.join_trip(p_token text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
    t_id bigint;
begin
    if auth.uid() is null then
        raise exception 'Accedi per unirti al viaggio' using errcode = '42501';
    end if;
    select id into t_id from public.trips where invite_token = p_token;
    if t_id is null then
        raise exception 'Link di invito non valido' using errcode = 'P0002';
    end if;
    insert into public.trip_members (trip_id, user_id, role) values (t_id, auth.uid(), 'editor')
        on conflict do nothing;
    return t_id;
end;
$$;

revoke execute on function public.create_trip, public.get_invite_token, public.regenerate_invite, public.join_trip from anon, public;
grant execute on function public.create_trip, public.get_invite_token, public.regenerate_invite, public.join_trip to authenticated;

-- ---------------------------------------------------------------- realtime

-- trips stays out: its rows carry invite_token, which editors must not receive.
alter publication supabase_realtime add table public.trip_members, public.activities, public.stays;
