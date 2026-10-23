-- Tickets and documents (PDF or image), optionally tied to an activity or a stay.
-- "personal": only whoever uploaded it sees it (passport, own Shinkansen seat).
-- "group": every member sees it (one QR for all, the hotel booking).

create type public.document_scope as enum ('personal', 'group');

create table public.documents (
    id bigint generated always as identity primary key,
    trip_id bigint not null references public.trips on delete cascade,
    owner uuid not null default auth.uid() references public.profiles on delete cascade,
    scope public.document_scope not null default 'personal',
    title text not null check (char_length(title) between 1 and 120),
    activity_id bigint references public.activities on delete set null,
    stay_id bigint references public.stays on delete set null,
    -- <trip_id>/<owner>/<random>.<ext> in the private "documents" bucket
    file_path text not null unique check (char_length(file_path) <= 512),
    mime_type text not null check (mime_type in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
    size_bytes integer not null check (size_bytes between 1 and 10485760),
    created_at timestamptz not null default now()
);

create index documents_trip_idx on public.documents (trip_id, created_at desc);

-- the linked activity or stay must belong to the same trip
create function public.check_document_links() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    if new.activity_id is not null and not exists (select 1 from public.activities where id = new.activity_id and trip_id = new.trip_id) then
        raise exception 'L''attività non è di questo viaggio' using errcode = '23514';
    end if;
    if new.stay_id is not null and not exists (select 1 from public.stays where id = new.stay_id and trip_id = new.trip_id) then
        raise exception 'L''alloggio non è di questo viaggio' using errcode = '23514';
    end if;
    return new;
end;
$$;

create trigger documents_check_links before insert or update on public.documents for each row execute function public.check_document_links();

alter table public.documents enable row level security;

create policy "see group documents and your own" on public.documents for select to authenticated
    using (public.is_member(trip_id) and (scope = 'group' or owner = auth.uid()));
-- anyone in the trip keeps their own papers; sharing with the group is for editors, like the rest of the plan
create policy "add your documents" on public.documents for insert to authenticated
    with check (
        owner = auth.uid() and public.is_member(trip_id) and (scope = 'personal' or public.can_edit(trip_id))
        and file_path like trip_id || '/' || auth.uid() || '/%'
    );
create policy "change your documents" on public.documents for update to authenticated
    using (owner = auth.uid()) with check (owner = auth.uid() and public.is_member(trip_id) and (scope = 'personal' or public.can_edit(trip_id)));
create policy "delete your documents" on public.documents for delete to authenticated using (owner = auth.uid());
revoke update on public.documents from authenticated, anon;
grant update (title, scope, activity_id, stay_id) on public.documents to authenticated;

alter publication supabase_realtime add table public.documents;

-- ---------------------------------------------------------------- files

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- a file is readable exactly when its documents row is (that table's policies decide)
create policy "read files of visible documents" on storage.objects for select to authenticated
    using (bucket_id = 'documents' and exists (select 1 from public.documents d where d.file_path = name));
-- upload only into <a trip you are in>/<your id>/
create policy "upload into your folder" on storage.objects for insert to authenticated
    with check (
        bucket_id = 'documents'
        and (storage.foldername(name))[2] = auth.uid()::text
        -- case, not and: SQL may evaluate the cast before the format check
        and public.is_member(case when (storage.foldername(name))[1] ~ '^\d+$' then ((storage.foldername(name))[1])::bigint end)
    );
create policy "delete your files" on storage.objects for delete to authenticated
    using (bucket_id = 'documents' and (storage.foldername(name))[2] = auth.uid()::text);
