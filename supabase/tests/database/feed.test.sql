begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email, raw_user_meta_data) values
    ('00000000-0000-0000-0000-0000000000a1', 'feed-owner@test', '{"name":"Anna"}'),
    ('00000000-0000-0000-0000-0000000000b1', 'feed-friend@test', '{"name":"Bruno"}'),
    ('00000000-0000-0000-0000-0000000000c1', 'feed-stranger@test', '{"name":"Carla"}');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
    select set_config('role', 'authenticated', true),
           set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
create temp table t as select create_trip('Feed', null, '2026-11-03', '2026-11-05') as id;
grant select on t to authenticated;
create temp table tok as select get_invite_token((select id from t)) as v;
grant select on tok to authenticated;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select join_trip((select v from tok));
insert into activities (trip_id, date, type, title) values ((select id from t), '2026-11-04', 'visit', 'Senso-ji');
update activities set notes = 'portare yen';            -- not worth a line
update activities set start_time = '09:00';             -- worth a line
update activities set booking_required = true, booked = true;
delete from activities;

select results_eq(
    $$ select action || ':' || entity || ':' || label from trip_events order by id $$,
    array['joined:member:Anna', 'joined:member:Bruno', 'added:activity:Senso-ji', 'updated:activity:Senso-ji', 'booked:activity:Senso-ji', 'deleted:activity:Senso-ji'],
    'the feed records joins and meaningful changes in order'
);
select is((select actor from trip_events where action = 'added'), '00000000-0000-0000-0000-0000000000b1'::uuid, 'the actor is who made the change');
select throws_ok($$ insert into trip_events (trip_id, action, entity, label) values ((select id from t), 'added', 'activity', 'fake') $$, '42501', null, 'members cannot write the feed');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
update trip_members set role = 'viewer' where user_id = '00000000-0000-0000-0000-0000000000b1';
select is((select action || ':' || label from trip_events order by id desc limit 1), 'role:Bruno', 'role changes are logged');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from trip_events), 0, 'strangers do not see the feed');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
delete from trip_members where user_id = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select action || ':' || label from trip_events order by id desc limit 1), 'left:Bruno', 'leaving is logged');

delete from trips where id = (select id from t);
select is((select count(*)::int from trip_events where trip_id = (select id from t)), 0, 'deleting the trip clears its feed');
select is((select count(*)::int from trips where id = (select id from t)), 0, 'and the trip is gone without trigger errors');

select * from finish();
rollback;
