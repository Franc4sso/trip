-- Coordinates of a picked place (from the place search), used to bias searches and, later, the map.
alter table public.activities
    add column latitude double precision check (latitude between -90 and 90),
    add column longitude double precision check (longitude between -180 and 180);

alter table public.stays
    add column latitude double precision check (latitude between -90 and 90),
    add column longitude double precision check (longitude between -180 and 180);
