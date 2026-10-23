-- "Back to the hotel" as its own kind of activity: it fills time in the day (no false gaps)
-- but is not counted as planned sightseeing.
alter type public.activity_type add value if not exists 'hotel';

-- The advice function can also look up the address of a place the search did not find.
alter table public.ai_requests drop constraint ai_requests_kind_check;
alter table public.ai_requests add constraint ai_requests_kind_check check (kind in ('suggestions', 'question', 'locate'));
