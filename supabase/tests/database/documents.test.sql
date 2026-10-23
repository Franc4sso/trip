begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email, raw_user_meta_data) values
    ('00000000-0000-0000-0000-0000000000a3', 'doc-owner@test', '{"name":"Anna"}'),
    ('00000000-0000-0000-0000-0000000000b3', 'doc-editor@test', '{"name":"Bruno"}'),
    ('00000000-0000-0000-0000-0000000000c3', 'doc-viewer@test', '{"name":"Carla"}'),
    ('00000000-0000-0000-0000-0000000000d3', 'doc-stranger@test', '{"name":"Dario"}');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
    select set_config('role', 'authenticated', true),
           set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
create temp table ctx (trip bigint, other_trip bigint, activity bigint, other_activity bigint);
grant select, insert, update on ctx to authenticated;
insert into ctx (trip) select create_trip('Docs', null, '2026-11-03', '2026-11-05');
update ctx set other_trip = create_trip('Altro', null, '2026-12-01', '2026-12-03');
insert into activities (trip_id, type, title) select trip, 'experience', 'teamLab' from ctx;
update ctx set activity = (select max(id) from activities where title = 'teamLab');
insert into activities (trip_id, type, title) select other_trip, 'visit', 'Altrove' from ctx;
update ctx set other_activity = (select max(id) from activities where title = 'Altrove');
create temp table tok as select get_invite_token((select trip from ctx)) as v;
grant select on tok to authenticated;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b3');
select join_trip((select v from tok));
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c3');
select join_trip((select v from tok));
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
update trip_members set role = 'viewer' where user_id = '00000000-0000-0000-0000-0000000000c3';

-- Anna: her passport (personal) and the group QR for teamLab
select lives_ok($$ insert into documents (trip_id, scope, title, file_path, mime_type, size_bytes)
    select trip, 'personal', 'Passaporto', trip || '/00000000-0000-0000-0000-0000000000a3/p.pdf', 'application/pdf', 1000 from ctx $$, 'members add personal documents');
select lives_ok($$ insert into documents (trip_id, scope, title, activity_id, file_path, mime_type, size_bytes)
    select trip, 'group', 'QR teamLab', activity, trip || '/00000000-0000-0000-0000-0000000000a3/q.png', 'image/png', 1000 from ctx $$, 'editors share documents with the group');
select throws_ok($$ insert into documents (trip_id, title, activity_id, file_path, mime_type, size_bytes)
    select trip, 'Sbagliato', other_activity, trip || '/00000000-0000-0000-0000-0000000000a3/x.pdf', 'application/pdf', 1000 from ctx $$, '23514', null, 'documents link only to activities of their trip');
select throws_ok($$ insert into documents (trip_id, title, file_path, mime_type, size_bytes)
    select trip, 'Altrui', trip || '/00000000-0000-0000-0000-0000000000b3/x.pdf', 'application/pdf', 1000 from ctx $$, '42501', null, 'files go only in your own folder');

-- Bruno sees the group QR, not Anna's passport
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b3');
select is((select array_agg(title order by title) from documents), array['QR teamLab'], 'others see group documents only');
select lives_ok($$ delete from documents where title = 'QR teamLab' $$, 'deleting someone else''s document...');
select is((select count(*)::int from documents where title = 'QR teamLab'), 1, '...changes nothing');
select throws_ok($$ update documents set file_path = 'x' $$, '42501', null, 'the file of a document never changes');

-- Carla (viewer) keeps her own papers but cannot share with the group
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c3');
select lives_ok($$ insert into documents (trip_id, title, file_path, mime_type, size_bytes)
    select trip, 'Assicurazione', trip || '/00000000-0000-0000-0000-0000000000c3/a.pdf', 'application/pdf', 1000 from ctx $$, 'viewers add personal documents');
select throws_ok($$ insert into documents (trip_id, scope, title, file_path, mime_type, size_bytes)
    select trip, 'group', 'Per tutti', trip || '/00000000-0000-0000-0000-0000000000c3/g.pdf', 'application/pdf', 1000 from ctx $$, '42501', null, 'viewers cannot share with the group');
select throws_ok($$ update documents set scope = 'group' where title = 'Assicurazione' $$, '42501', null, 'viewers cannot turn a document into a group one');

-- Anna does not see Carla's insurance; Dario sees nothing at all
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select is((select count(*)::int from documents where title = 'Assicurazione'), 0, 'personal documents stay personal, even for the owner of the trip');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d3');
select is((select count(*)::int from documents), 0, 'strangers see no documents');

select * from finish();
rollback;
