alter table public.jobs
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

alter table public.jobs
  drop constraint if exists jobs_coordinates_range;

alter table public.jobs
  add constraint jobs_coordinates_range check (
    (latitude is null and longitude is null)
    or (latitude between -90 and 90 and longitude between -180 and 180)
  );
