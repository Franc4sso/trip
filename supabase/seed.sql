-- Local demo data, mirrors the mockup. Login: demo@tabi.test / password
-- (also ale@, sara@, davide@tabi.test). Runs on `supabase db reset` only.

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, extensions.crypt('password', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', jsonb_build_object('name', u.name), now(), now(), '', '', '', ''
from (values
    ('11111111-1111-1111-1111-111111111111'::uuid, 'demo@tabi.test', 'Francesco'),
    ('22222222-2222-2222-2222-222222222222'::uuid, 'ale@tabi.test', 'Ale'),
    ('33333333-3333-3333-3333-333333333333'::uuid, 'sara@tabi.test', 'Sara'),
    ('44444444-4444-4444-4444-444444444444'::uuid, 'davide@tabi.test', 'Davide')
) as u(id, email, name);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email), 'email', now(), now(), now()
from auth.users where email like '%@tabi.test';

with t as (
    insert into public.trips (name, destination, start_date, end_date, currency, created_by)
    values ('Giappone', 'Tokyo, Kyoto, Osaka', '2026-11-03', '2026-11-17', 'JPY', '11111111-1111-1111-1111-111111111111')
    returning id
), members as (
    insert into public.trip_members (trip_id, user_id, role)
    select t.id, m.user_id, m.role::public.trip_role from t, (values
        ('11111111-1111-1111-1111-111111111111'::uuid, 'owner'),
        ('22222222-2222-2222-2222-222222222222'::uuid, 'editor'),
        ('33333333-3333-3333-3333-333333333333'::uuid, 'editor'),
        ('44444444-4444-4444-4444-444444444444'::uuid, 'viewer')
    ) as m(user_id, role)
), stays as (
    insert into public.stays (trip_id, name, city, check_in, check_out, confirmed, latitude, longitude)
    select t.id, s.* from t, (values
        ('Hotel Gracery Shinjuku', 'Tokyo', '2026-11-03'::date, '2026-11-06'::date, true, 35.6946, 139.7016),
        ('Ryokan a Higashiyama', 'Kyoto', '2026-11-06'::date, '2026-11-11'::date, true, 34.9986, 135.7810),
        ('Hotel a Namba', 'Osaka', '2026-11-11'::date, '2026-11-16'::date, false, 34.6655, 135.5010)
    ) as s
)
insert into public.activities (trip_id, date, start_time, duration_minutes, type, title, city, cost, booking_required, booking_deadline, booked)
select t.id, a.* from t, (values
    ('2026-11-03'::date, '15:00'::time, 120, 'transport'::public.activity_type, 'Arrivo a Narita e transfer', 'Tokyo', null::int, false, null::date, false),
    ('2026-11-03', '19:30', 90, 'food', 'Ramen a Shinjuku', 'Tokyo', null, false, null, false),
    ('2026-11-04', '09:00', 120, 'visit', 'Senso-ji, Asakusa', 'Tokyo', null, false, null, false),
    ('2026-11-04', '12:00', 60, 'food', 'Pranzo ad Asakusa', 'Tokyo', null, false, null, false),
    ('2026-11-04', '17:00', 120, 'experience', 'teamLab Planets', 'Tokyo', 3800, true, '2026-10-28', true),
    ('2026-11-05', '08:30', 90, 'visit', 'Meiji Jingu', 'Tokyo', null, false, null, false),
    ('2026-11-05', '10:00', 150, 'visit', 'Harajuku e Omotesando', 'Tokyo', null, false, null, false),
    ('2026-11-05', '13:00', 60, 'food', 'Pranzo', 'Tokyo', null, false, null, false),
    ('2026-11-05', '14:00', 210, 'visit', 'Odaiba', 'Tokyo', null, false, null, false),
    ('2026-11-05', '18:00', 90, 'experience', 'Shibuya Sky', 'Tokyo', 2500, true, '2026-11-01', false),
    ('2026-11-05', '20:00', 120, 'food', 'Izakaya a Shinjuku', 'Tokyo', null, false, null, false),
    ('2026-11-06', '08:10', 135, 'transport', 'Shinkansen → Kyoto', 'Kyoto', null, false, null, false),
    ('2026-11-06', '10:45', 30, 'transport', 'Deposito bagagli al ryokan', 'Kyoto', null, false, null, false),
    ('2026-11-06', '14:00', 120, 'visit', 'Kiyomizu-dera', 'Kyoto', 500, false, null, false),
    ('2026-11-06', '16:30', 90, 'visit', 'Passeggiata a Gion', 'Kyoto', null, false, null, false),
    ('2026-11-06', '19:30', 120, 'food', 'Cena kaiseki', 'Kyoto', 9000, true, '2026-10-30', false),
    ('2026-11-07', '07:30', 180, 'visit', 'Fushimi Inari', 'Kyoto', null, false, null, false),
    ('2026-11-07', '15:00', 90, 'visit', 'Tofuku-ji', 'Kyoto', null, false, null, false),
    ('2026-11-08', '09:00', 240, 'visit', 'Arashiyama e bambù', 'Kyoto', null, false, null, false),
    ('2026-11-09', '10:00', 180, 'visit', 'Kinkaku-ji', 'Kyoto', null, false, null, false),
    ('2026-11-10', '10:00', 180, 'visit', 'Nijo-jo', 'Kyoto', null, false, null, false),
    ('2026-11-11', '10:00', 60, 'transport', 'Treno → Osaka', 'Osaka', null, false, null, false),
    ('2026-11-11', '18:00', 120, 'food', 'Street food a Dotonbori', 'Osaka', null, false, null, false),
    ('2026-11-12', '09:00', 480, 'experience', 'Universal Studios', 'Osaka', 9000, true, '2026-11-05', false),
    ('2026-11-15', '11:00', 120, 'visit', 'Castello di Osaka', 'Osaka', null, false, null, false),
    ('2026-11-17', '10:00', 180, 'transport', 'Volo di ritorno', 'Osaka', null, false, null, false),
    (null, null, 360, 'visit', 'Nara, cervi e Todai-ji', 'Nara', null, false, null, false),
    (null, null, 300, 'visit', 'Castello di Himeji', 'Himeji', null, false, null, false),
    (null, null, 120, 'experience', 'Onsen', null, null, false, null, false),
    (null, null, 90, 'food', 'Nishiki Market', 'Kyoto', null, false, null, false),
    (null, null, 120, 'experience', 'Ghibli Museum', 'Tokyo', 1000, true, null, false)
) as a;

-- the demo rows above were inserted without a signed-in user: start with a clean feed
delete from public.trip_events;
