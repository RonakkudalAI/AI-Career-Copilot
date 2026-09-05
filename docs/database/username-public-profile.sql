-- Apply this migration to Supabase/Postgres before enabling username sign-in
-- and public profile URLs.
alter table public.profiles add column if not exists username text;

update public.profiles
set username = lower(regexp_replace(split_part(coalesce(full_name, 'member'), ' ', 1), '[^a-zA-Z0-9_]', '', 'g'))
where username is null;

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username))
  where username is not null;

alter table public.profiles
  add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9](?:[a-z0-9_]{1,28}[a-z0-9])?$');
