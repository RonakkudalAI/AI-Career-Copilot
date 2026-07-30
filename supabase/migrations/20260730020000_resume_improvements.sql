create table if not exists public.resume_improvement_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resume_version_id uuid not null,
  job_description_id uuid,
  ats_analysis_id uuid,
  status text not null default 'pending' check (status in ('pending','generating','validating','completed','failed','cancelled')),
  provider text not null,
  model text not null,
  prompt_version text not null,
  requested_sections text[] not null,
  validation_summary jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(id,user_id),
  foreign key(resume_version_id,user_id) references public.resume_versions(id,user_id),
  foreign key(job_description_id,user_id) references public.job_descriptions(id,user_id),
  foreign key(ats_analysis_id,user_id) references public.ats_analyses(id,user_id)
);

alter table public.resume_suggestions alter column analysis_id drop not null;
alter table public.resume_suggestions
  add column if not exists run_id uuid,
  add column if not exists source_block_id text,
  add column if not exists source_text_hash text,
  add column if not exists suggestion_type text,
  add column if not exists evidence_references jsonb not null default '[]'::jsonb,
  add column if not exists validation_status text,
  add column if not exists validation_issues jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='resume_suggestions_run_owner_fk'
      and conrelid='public.resume_suggestions'::regclass
  ) then
    alter table public.resume_suggestions
      add constraint resume_suggestions_run_owner_fk
      foreign key(run_id,user_id) references public.resume_improvement_runs(id,user_id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='resume_suggestions_origin_check'
      and conrelid='public.resume_suggestions'::regclass
  ) then
    alter table public.resume_suggestions
      add constraint resume_suggestions_origin_check check (analysis_id is not null or run_id is not null);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='resume_suggestions_type_check'
      and conrelid='public.resume_suggestions'::regclass
  ) then
    alter table public.resume_suggestions
      add constraint resume_suggestions_type_check check (
        suggestion_type is null or suggestion_type in ('rewrite','clarity','conciseness','action_verb','structure','job_alignment','formatting')
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='resume_suggestions_validation_check'
      and conrelid='public.resume_suggestions'::regclass
  ) then
    alter table public.resume_suggestions
      add constraint resume_suggestions_validation_check check (
        validation_status is null or validation_status in ('passed','warning','blocked','stale')
      );
  end if;
end
$$;

alter table public.resume_exports add column if not exists filename text;
update public.resume_exports
set filename = id::text || case when export_format='pdf' then '.pdf' else '.docx' end
where filename is null;
alter table public.resume_exports alter column filename set not null;

alter table public.resume_versions
  add column if not exists improvement_run_id uuid,
  add column if not exists change_metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='resume_versions_improvement_run_owner_fk'
      and conrelid='public.resume_versions'::regclass
  ) then
    alter table public.resume_versions
      add constraint resume_versions_improvement_run_owner_fk
      foreign key(improvement_run_id,user_id) references public.resume_improvement_runs(id,user_id);
  end if;
end
$$;

create index if not exists resume_improvement_runs_user_created_idx
  on public.resume_improvement_runs(user_id,created_at desc);
create index if not exists resume_improvement_runs_version_idx
  on public.resume_improvement_runs(resume_version_id);
create index if not exists resume_improvement_runs_status_idx
  on public.resume_improvement_runs(status);
create index if not exists resume_suggestions_run_idx
  on public.resume_suggestions(run_id);
create index if not exists resume_exports_version_idx
  on public.resume_exports(resume_version_id);

alter table public.resume_improvement_runs enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='resume_improvement_runs' and policyname='resume_improvement_runs_select'
  ) then
    create policy resume_improvement_runs_select on public.resume_improvement_runs
      for select using ((select auth.uid())=user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='resume_improvement_runs' and policyname='resume_improvement_runs_insert'
  ) then
    create policy resume_improvement_runs_insert on public.resume_improvement_runs
      for insert with check ((select auth.uid())=user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='resume_improvement_runs' and policyname='resume_improvement_runs_update'
  ) then
    create policy resume_improvement_runs_update on public.resume_improvement_runs
      for update using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='resume_improvement_runs' and policyname='resume_improvement_runs_delete'
  ) then
    create policy resume_improvement_runs_delete on public.resume_improvement_runs
      for delete using ((select auth.uid())=user_id);
  end if;
end
$$;

grant select,insert,update,delete on public.resume_improvement_runs to authenticated;
grant all privileges on public.resume_improvement_runs to service_role;
