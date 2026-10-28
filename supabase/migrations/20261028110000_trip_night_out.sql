-- Until when a night out goes on: activities on the next day starting before this
-- (minutes after midnight) belong to the evening before. 0 turns it off.
alter table public.trips add column night_out_ends smallint not null default 240 check (night_out_ends between 0 and 360);

grant select (night_out_ends) on public.trips to authenticated;
grant update (night_out_ends) on public.trips to authenticated;
