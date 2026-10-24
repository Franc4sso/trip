-- Alternatives for one slot of the day (e.g. three places for dinner), picked on the spot.
-- Each option is { name, address, city, latitude, longitude, info?, chosen? }: the chosen one is
-- also copied into the activity's own location, so map and walking route keep working.
alter table public.activities
    add column options jsonb not null default '[]'::jsonb
        check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) <= 10),
    -- what the AI found about the place: { summary, what, price, hours, photos[], source_url }
    add column info jsonb check (info is null or jsonb_typeof(info) = 'object');

-- The advice function also describes places (photos and info) and suggests nearby ones.
alter table public.ai_requests drop constraint ai_requests_kind_check;
alter table public.ai_requests add constraint ai_requests_kind_check check (kind in ('suggestions', 'question', 'locate', 'describe', 'suggest'));
