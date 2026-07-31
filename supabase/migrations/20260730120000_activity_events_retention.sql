-- Retain only the newest 5 activity_events rows per user.
-- Application code also prunes on write/read; this trigger is a safety net.

create or replace function public.prune_activity_events_for_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.activity_events ae
  where ae.user_id = new.user_id
    and ae.id not in (
      select id
      from public.activity_events
      where user_id = new.user_id
      order by created_at desc
      limit 5
    );
  return new;
end;
$$;

drop trigger if exists activity_events_prune_after_insert on public.activity_events;

create trigger activity_events_prune_after_insert
after insert on public.activity_events
for each row
execute function public.prune_activity_events_for_user();

-- One-time cleanup for existing accounts that already exceed the cap.
delete from public.activity_events ae
where ae.id not in (
  select kept.id
  from (
    select id,
           row_number() over (partition by user_id order by created_at desc) as rn
    from public.activity_events
  ) kept
  where kept.rn <= 5
);
