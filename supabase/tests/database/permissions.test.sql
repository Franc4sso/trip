begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- users: owner, editor, viewer, stranger
insert into auth.users (id, email, raw_user_meta_data) values
    ('00000000-0000-0000-0000-00000000000a', 'owner@test', '{"name":"Owner"}'),
    ('00000000-0000-0000-0000-00000000000b', 'editor@test', '{}'),
    ('00000000-0000-0000-0000-00000000000c', 'viewer@test', '{}'),
    ('00000000-0000-0000-0000-00000000000d', 'stranger@test', '{}');

select is((select name from profiles where id = '00000000-0000-0000-0000-00000000000b'), 'editor', 'profile name falls back to the email prefix');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
    select set_config('role', 'authenticated', true),
           set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- owner creates a trip
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ select create_trip('Giappone', 'Tokyo', '2026-11-03', '2026-11-07') $$, 'signed-in users create trips');
select is((select role::text from trip_members where user_id = '00000000-0000-0000-0000-00000000000a'), 'owner', 'the creator owns the trip');
select throws_ok($$ insert into trips (name, start_date, end_date) values ('x', '2026-01-01', '2026-01-02') $$, '42501', null, 'trips cannot be inserted directly');
select throws_ok($$ select create_trip('Lungo', null, '2026-01-01', '2026-12-31') $$, '23514', null, 'trips are at most 90 days');

create temp table ids as select (select id from trips where name = 'Giappone') as trip;
grant select on ids to authenticated;
select throws_ok($$ select invite_token from trips $$, '42501', null, 'invite_token is not selectable');
select isnt(get_invite_token((select trip from ids)), null, 'owners read the invite token');

-- editor joins with the token
create temp table tok as select get_invite_token((select trip from ids)) as t;
grant select on tok to authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select is(join_trip((select t from tok)), (select trip from ids), 'the invite link joins the trip');
select is((select role::text from trip_members where user_id = '00000000-0000-0000-0000-00000000000b'), 'editor', 'joiners are editors');
select throws_ok($$ select get_invite_token((select trip from ids)) $$, '42501', null, 'editors cannot read the invite token');
select throws_ok($$ select join_trip('nope') $$, 'P0002', null, 'bad tokens are rejected');

select lives_ok($$ insert into activities (trip_id, date, type, title) values ((select trip from ids), '2026-11-04', 'visit', 'Senso-ji') $$, 'editors add activities');
select throws_ok($$ insert into activities (trip_id, date, type, title) values ((select trip from ids), '2026-12-01', 'visit', 'Fuori') $$, '23514', null, 'activities stay inside the trip dates');
select throws_ok($$ insert into activities (trip_id, date, start_time, type, title) values ((select trip from ids), null, '10:00', 'visit', 'Idea') $$, '23514', null, 'ideas carry no time');
select throws_ok($$ insert into stays (trip_id, name, city, check_in, check_out) values ((select trip from ids), 'H', 'Tokyo', '2026-11-04', '2026-11-04') $$, '23514', null, 'stays end after they start');
select lives_ok($$ insert into stays (trip_id, name, city, check_in, check_out) values ((select trip from ids), 'H', 'Tokyo', '2026-11-03', '2026-11-05') $$, 'editors add stays');
select is((select count(*)::int from profiles), 2, 'members see each other''s profiles');

-- owner makes the third user a viewer by letting them join then demoting
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
select join_trip((select t from tok));
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
update trip_members set role = 'viewer' where user_id = '00000000-0000-0000-0000-00000000000c';
select throws_ok($$ delete from trip_members where user_id = '00000000-0000-0000-0000-00000000000a' $$, '23514', null, 'the last owner cannot leave');

select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from activities), 1, 'viewers see activities');
update activities set title = 'Hack';
select is((select title from activities), 'Senso-ji', 'viewers cannot change activities');
update trip_members set role = 'owner' where user_id = '00000000-0000-0000-0000-00000000000c';
select is((select role::text from trip_members where user_id = '00000000-0000-0000-0000-00000000000c'), 'viewer', 'members cannot promote themselves');

-- strangers see nothing
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
select is((select count(*)::int from trips), 0, 'strangers do not see the trip');
select is((select count(*)::int from activities), 0, 'strangers do not see activities');
delete from activities;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from activities), 1, 'strangers cannot delete activities');

select * from finish();
rollback;
