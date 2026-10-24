-- A personal document can also be shared with some travel mates only (the tickets of the
-- two of you going to the museum): they see it like their own, nobody else does.
alter table public.documents
    add column shared_with uuid[] not null default '{}'
        check (cardinality(shared_with) <= 50),
    -- a group document is already for everyone
    add constraint documents_shared_only_personal check (scope = 'personal' or cardinality(shared_with) = 0);

-- the linked activity or stay must belong to the same trip, the people must be in it
create or replace function public.check_document_links() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    if new.activity_id is not null and not exists (select 1 from public.activities where id = new.activity_id and trip_id = new.trip_id) then
        raise exception 'L''attività non è di questo viaggio' using errcode = '23514';
    end if;
    if new.stay_id is not null and not exists (select 1 from public.stays where id = new.stay_id and trip_id = new.trip_id) then
        raise exception 'L''alloggio non è di questo viaggio' using errcode = '23514';
    end if;
    if exists (
        select 1 from unnest(new.shared_with) as u(id)
        where not exists (select 1 from public.trip_members m where m.trip_id = new.trip_id and m.user_id = u.id)
    ) then
        raise exception 'Puoi condividere solo con chi è nel viaggio' using errcode = '23514';
    end if;
    return new;
end;
$$;

drop policy "see group documents and your own" on public.documents;
create policy "see group documents, your own and the ones shared with you" on public.documents for select to authenticated
    using (public.is_member(trip_id) and (scope = 'group' or owner = auth.uid() or auth.uid() = any (shared_with)));

grant update (shared_with) on public.documents to authenticated;
