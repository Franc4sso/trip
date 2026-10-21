begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email, raw_user_meta_data) values
    ('00000000-0000-0000-0000-0000000000a2', 'poll-owner@test', '{"name":"Anna"}'),
    ('00000000-0000-0000-0000-0000000000b2', 'poll-viewer@test', '{"name":"Bruno"}'),
    ('00000000-0000-0000-0000-0000000000c2', 'poll-stranger@test', '{"name":"Carla"}');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
    select set_config('role', 'authenticated', true),
           set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
create temp table ctx (trip bigint, poll bigint, nara bigint, himeji bigint);
grant select, insert, update on ctx to authenticated;
insert into ctx (trip) select create_trip('Polls', null, '2026-11-03', '2026-11-05');
insert into polls (trip_id, question) select trip, 'Gita del 13?' from ctx;
update ctx set poll = (select max(id) from polls);
insert into poll_options (poll_id, label) select poll, 'Nara' from ctx;
update ctx set nara = (select max(id) from poll_options);
insert into poll_options (poll_id, label) select poll, 'Himeji' from ctx;
update ctx set himeji = (select max(id) from poll_options);
create temp table tok as select get_invite_token((select trip from ctx)) as v;
grant select on tok to authenticated;
select ok((select poll from ctx) is not null, 'editors open polls with options');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
select join_trip((select v from tok));
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
update trip_members set role = 'viewer' where user_id = '00000000-0000-0000-0000-0000000000b2';

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
select throws_ok($$ insert into polls (trip_id, question) values ((select trip from ctx), 'Mio?') $$, '42501', null, 'viewers cannot open polls');
select lives_ok($$ insert into poll_votes (poll_id, option_id) values ((select poll from ctx), (select nara from ctx)) $$, 'viewers can vote');
select throws_ok($$ insert into poll_votes (poll_id, option_id) values ((select poll from ctx), (select himeji from ctx)) $$, '23505', null, 'one vote per person');
select lives_ok($$ update poll_votes set option_id = (select himeji from ctx) where user_id = auth.uid() $$, 'votes can change');
select is((select option_id from poll_votes where user_id = '00000000-0000-0000-0000-0000000000b2'), (select himeji from ctx), 'the vote moved');
select throws_ok($$ insert into poll_votes (poll_id, option_id, user_id) values ((select poll from ctx), (select nara from ctx), '00000000-0000-0000-0000-0000000000a2') $$, '42501', null, 'nobody votes for someone else');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
update polls set closed = true;
select throws_ok($$ insert into poll_votes (poll_id, option_id) values ((select poll from ctx), (select nara from ctx)) $$, '23514', null, 'closed polls take no votes');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000c2');
select is((select count(*)::int from polls), 0, 'strangers do not see polls');
select is((select count(*)::int from poll_votes), 0, 'strangers do not see votes');

select * from finish();
rollback;
