create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '', avatar_path text, headline text, bio text, phone text, location text,
  "current_role" text, years_experience numeric, career_level text, career_goal text,
  onboarding_step smallint not null default 1 check (onboarding_step between 1 and 6),
  onboarding_completed boolean not null default false,
  profile_completion smallint not null default 0 check (profile_completion between 0 and 100),
  profile_completion_details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (years_experience is null or years_experience >= 0)
);

create table public.candidate_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  target_roles text[] not null default '{}', preferred_industries text[] not null default '{}', preferred_locations text[] not null default '{}',
  work_modes text[] not null default '{}', employment_types text[] not null default '{}', notice_period_days integer,
  willing_to_relocate boolean not null default false, work_authorization text, salary_min numeric, salary_max numeric,
  salary_currency text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (notice_period_days is null or notice_period_days >= 0), check (salary_min is null or salary_min >= 0),
  check (salary_max is null or salary_max >= 0), check (salary_min is null or salary_max is null or salary_min <= salary_max),
  check (salary_currency is null or salary_currency ~ '^[A-Z]{3}$')
);

create table public.candidate_skills (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, normalized_name text not null, category text, proficiency text,
  years_experience numeric check (years_experience is null or years_experience >= 0), source text not null default 'candidate',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id, normalized_name)
);
create table public.candidate_experiences (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  company_name text not null, role_title text not null, employment_type text, location text, start_date date, end_date date,
  is_current boolean not null default false, summary text, display_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date), check (not is_current or end_date is null)
);
create table public.candidate_projects (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  title text not null, role text, description text, start_date date, end_date date, project_url text, repository_url text,
  skills text[] not null default '{}', display_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create table public.candidate_education (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  institution text not null, degree text, field_of_study text, location text, start_date date, end_date date, grade text,
  description text, display_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create table public.candidate_certifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, issuer text, issue_date date, expiry_date date, credential_id text, credential_url text,
  does_not_expire boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (expiry_date is null or issue_date is null or expiry_date >= issue_date), check (not does_not_expire or expiry_date is null)
);
create table public.candidate_languages (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  language text not null, normalized_language text not null, proficiency text, display_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id, normalized_language)
);
create table public.candidate_links (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  link_type text not null check (link_type in ('linkedin','github','portfolio','website','other')), label text, url text not null,
  display_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.resumes (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  title text not null, is_active boolean not null default false, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), deleted_at timestamptz, unique(id, user_id)
);
create unique index one_active_resume_per_user on public.resumes(user_id) where is_active and deleted_at is null;
create table public.resume_versions (
  id uuid primary key default gen_random_uuid(), resume_id uuid not null, user_id uuid not null references auth.users(id) on delete cascade,
  version_number integer not null check (version_number > 0), source_type text not null check (source_type in ('uploaded','edited','exported')),
  original_filename text not null, storage_path text not null, mime_type text not null check (mime_type in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes bigint not null check (size_bytes > 0), sha256 text not null, plain_text text, structured_content jsonb not null default '{}'::jsonb,
  extraction_status text not null default 'pending' check (extraction_status in ('pending','processing','review_required','confirmed','failed')),
  extraction_warnings jsonb not null default '[]'::jsonb, extraction_confidence jsonb not null default '{}'::jsonb,
  candidate_confirmed_at timestamptz, created_from_version_id uuid references public.resume_versions(id), created_at timestamptz not null default now(),
  unique(resume_id, version_number), unique(id, user_id), foreign key(resume_id,user_id) references public.resumes(id,user_id) on delete cascade
);
create table public.job_descriptions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  input_type text not null check (input_type in ('text','pdf','docx')), title text not null, company text, role_title text,
  original_filename text, storage_path text, mime_type text, size_bytes bigint, sha256 text, raw_text text,
  structured_content jsonb not null default '{}'::jsonb,
  extraction_status text not null default 'pending' check (extraction_status in ('pending','processing','review_required','confirmed','failed')),
  extraction_warnings jsonb not null default '[]'::jsonb, extraction_confidence jsonb not null default '{}'::jsonb,
  candidate_confirmed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id),
  check ((input_type='text' and raw_text is not null and storage_path is null) or (input_type in ('pdf','docx') and storage_path is not null and size_bytes > 0))
);

create table public.ats_analyses (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  resume_version_id uuid not null, job_description_id uuid not null,
  status text not null default 'draft' check (status in ('draft','queued','processing','completed','failed')),
  algorithm_version text, overall_score numeric check (overall_score is null or overall_score between 0 and 100),
  score_breakdown jsonb, summary jsonb, error_code text, error_message text, created_at timestamptz not null default now(),
  started_at timestamptz, completed_at timestamptz, unique(id,user_id),
  foreign key(resume_version_id,user_id) references public.resume_versions(id,user_id),
  foreign key(job_description_id,user_id) references public.job_descriptions(id,user_id)
);
create table public.ats_evidence (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, analysis_id uuid not null,
  category text, requirement_text text not null, requirement_type text, resume_evidence_text text, resume_section text,
  resume_source_reference jsonb, job_description_source_reference jsonb,
  match_status text not null check (match_status in ('strong_match','partial_match','not_found','unverified','not_applicable')),
  score_contribution numeric, rule_id text, explanation text, created_at timestamptz not null default now(),
  foreign key(analysis_id,user_id) references public.ats_analyses(id,user_id) on delete cascade
);
create table public.resume_suggestions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  analysis_id uuid not null, resume_version_id uuid not null, section_key text not null, original_text text, suggested_text text not null,
  reason text, supporting_evidence_ids uuid[] not null default '{}', decision text not null default 'pending' check (decision in ('pending','accepted','rejected','edited')),
  candidate_text text, created_at timestamptz not null default now(), decided_at timestamptz,
  foreign key(analysis_id,user_id) references public.ats_analyses(id,user_id) on delete cascade,
  foreign key(resume_version_id,user_id) references public.resume_versions(id,user_id)
);
create table public.resume_exports (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  resume_version_id uuid not null, export_format text not null check (export_format in ('pdf','docx')), storage_path text not null,
  created_at timestamptz not null default now(), foreign key(resume_version_id,user_id) references public.resume_versions(id,user_id)
);

create table public.interview_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  resume_version_id uuid, job_description_id uuid, mode text not null check (mode in ('resume','resume_and_jd','role','topic','company','behavioural','technical','hr','mixed')),
  target_role text, target_company text, topic text, difficulty text, question_count integer check (question_count > 0),
  duration_minutes integer check (duration_minutes > 0), camera_enabled boolean not null default false, microphone_enabled boolean not null default false,
  recording_consent boolean not null default false, status text not null default 'draft' check (status in ('draft','ready','in_progress','completed','cancelled','failed')),
  started_at timestamptz, completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id),
  foreign key(resume_version_id,user_id) references public.resume_versions(id,user_id), foreign key(job_description_id,user_id) references public.job_descriptions(id,user_id)
);
create table public.interview_questions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, session_id uuid not null,
  position integer not null check (position > 0), question text not null, question_type text, source_context jsonb,
  created_at timestamptz not null default now(), unique(session_id,position), unique(id,user_id),
  foreign key(session_id,user_id) references public.interview_sessions(id,user_id) on delete cascade
);
create table public.interview_responses (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null, question_id uuid not null, typed_response text, transcript text, audio_path text, video_path text,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0), created_at timestamptz not null default now(),
  foreign key(session_id,user_id) references public.interview_sessions(id,user_id) on delete cascade,
  foreign key(question_id,user_id) references public.interview_questions(id,user_id) on delete cascade
);
create table public.interview_reports (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, session_id uuid not null,
  evaluator_version text, overall_score numeric check (overall_score is null or overall_score between 0 and 100),
  technical_score numeric check (technical_score is null or technical_score between 0 and 100),
  communication_score numeric check (communication_score is null or communication_score between 0 and 100),
  visual_score numeric check (visual_score is null or visual_score between 0 and 100),
  technical_metrics jsonb, communication_metrics jsonb, visual_metrics jsonb, feedback jsonb,
  created_at timestamptz not null default now(), foreign key(session_id,user_id) references public.interview_sessions(id,user_id) on delete cascade
);

create table public.learning_paths (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  title text not null, description text, source_type text not null check (source_type in ('ats_analysis','interview_report','candidate_selected')),
  source_id uuid, status text not null default 'active' check (status in ('active','completed','archived')),
  progress_percentage smallint not null default 0 check (progress_percentage between 0 and 100),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id)
);
create table public.learning_items (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, learning_path_id uuid not null,
  position integer not null check (position > 0), title text not null, objective text, item_type text, difficulty text,
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes >= 0), status text not null default 'pending' check (status in ('pending','in_progress','completed')),
  completed_at timestamptz, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id),
  foreign key(learning_path_id,user_id) references public.learning_paths(id,user_id) on delete cascade
);
create table public.learning_resources (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, learning_item_id uuid not null,
  title text not null, resource_type text, provider text, url text, reason_recommended text, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), foreign key(learning_item_id,user_id) references public.learning_items(id,user_id) on delete cascade
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(), external_source text, external_id text, title text not null, company text not null,
  location text, work_mode text, employment_type text, experience_min numeric, experience_max numeric, salary_min numeric, salary_max numeric,
  salary_currency text, description text not null, requirements jsonb not null default '[]'::jsonb, application_url text,
  published_at timestamptz, expires_at timestamptz, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(external_source,external_id), check (experience_min is null or experience_min >= 0), check (experience_max is null or experience_max >= experience_min)
);
create table public.job_recommendations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade, resume_version_id uuid not null,
  match_score numeric check (match_score between 0 and 100), match_breakdown jsonb, evidence jsonb, algorithm_version text,
  generated_at timestamptz not null default now(), foreign key(resume_version_id,user_id) references public.resume_versions(id,user_id), unique(user_id,job_id,resume_version_id)
);
create table public.saved_jobs (
  user_id uuid not null references auth.users(id) on delete cascade, job_id uuid not null references public.jobs(id) on delete cascade,
  status text not null default 'saved' check (status in ('saved','applied','interviewing','offer','rejected','withdrawn')),
  notes text, saved_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key(user_id,job_id)
);

create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade, job_alerts boolean not null default false,
  learning_reminders boolean not null default true, interview_reminders boolean not null default true, product_updates boolean not null default false,
  email_frequency text not null default 'weekly' check (email_frequency in ('never','daily','weekly')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.privacy_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade, camera_permission text not null default 'ask' check (camera_permission in ('ask','allowed','disabled')),
  microphone_permission text not null default 'ask' check (microphone_permission in ('ask','allowed','disabled')),
  recording_retention_days integer not null default 0 check (recording_retention_days between 0 and 365),
  resume_processing_consent boolean not null default false, job_recommendation_consent boolean not null default false,
  profile_visibility text not null default 'private' check (profile_visibility in ('private','limited')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.activity_events (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null, entity_type text, entity_id uuid, summary text not null, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table public.user_notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null, title text not null, message text not null, action_route text, read_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,full_name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name','')) on conflict do nothing;
  insert into public.candidate_preferences(user_id) values(new.id) on conflict do nothing;
  insert into public.notification_preferences(user_id) values(new.id) on conflict do nothing;
  insert into public.privacy_preferences(user_id) values(new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

do $$ declare t text; begin
  foreach t in array array['profiles','candidate_preferences','candidate_skills','candidate_experiences','candidate_projects','candidate_education','candidate_certifications','candidate_languages','candidate_links','resumes','resume_versions','job_descriptions','ats_analyses','ats_evidence','resume_suggestions','resume_exports','interview_sessions','interview_questions','interview_responses','interview_reports','learning_paths','learning_items','learning_resources','jobs','job_recommendations','saved_jobs','notification_preferences','privacy_preferences','activity_events','user_notifications'] loop
    execute format('alter table public.%I enable row level security',t);
  end loop;
end $$;

create policy profiles_select on public.profiles for select using ((select auth.uid())=id);
create policy profiles_insert on public.profiles for insert with check ((select auth.uid())=id);
create policy profiles_update on public.profiles for update using ((select auth.uid())=id) with check ((select auth.uid())=id);
create policy profiles_delete on public.profiles for delete using ((select auth.uid())=id);

do $$ declare t text; begin
  foreach t in array array['candidate_preferences','candidate_skills','candidate_experiences','candidate_projects','candidate_education','candidate_certifications','candidate_languages','candidate_links','resumes','resume_versions','job_descriptions','ats_analyses','ats_evidence','resume_suggestions','resume_exports','interview_sessions','interview_questions','interview_responses','interview_reports','learning_paths','learning_items','learning_resources','job_recommendations','saved_jobs','notification_preferences','privacy_preferences','activity_events','user_notifications'] loop
    execute format('create policy %I on public.%I for select using ((select auth.uid())=user_id)',t||'_select',t);
    execute format('create policy %I on public.%I for insert with check ((select auth.uid())=user_id)',t||'_insert',t);
    execute format('create policy %I on public.%I for update using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id)',t||'_update',t);
    execute format('create policy %I on public.%I for delete using ((select auth.uid())=user_id)',t||'_delete',t);
  end loop;
end $$;
create policy jobs_read_active on public.jobs for select to authenticated using (is_active and (expires_at is null or expires_at>now()));

do $$ declare t text; begin
  foreach t in array array['profiles','candidate_preferences','candidate_skills','candidate_experiences','candidate_projects','candidate_education','candidate_certifications','candidate_languages','candidate_links','resumes','job_descriptions','interview_sessions','learning_paths','learning_items','jobs','saved_jobs','notification_preferences','privacy_preferences'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',t||'_set_updated_at',t);
  end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array['candidate_skills','candidate_experiences','candidate_projects','candidate_education','candidate_certifications','candidate_languages','candidate_links','resumes','resume_versions','job_descriptions','ats_analyses','ats_evidence','resume_suggestions','resume_exports','interview_sessions','interview_questions','interview_responses','interview_reports','learning_paths','learning_items','learning_resources','job_recommendations','saved_jobs','activity_events','user_notifications'] loop
    execute format('create index %I on public.%I(user_id)',t||'_user_id_idx',t);
  end loop;
end $$;
create index ats_analyses_status_idx on public.ats_analyses(status);
create index interview_sessions_status_idx on public.interview_sessions(status);
create index jobs_active_published_idx on public.jobs(is_active,published_at desc);
create index activity_events_user_created_idx on public.activity_events(user_id,created_at desc);
create index user_notifications_unread_idx on public.user_notifications(user_id,created_at desc) where read_at is null;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
  ('candidate-documents','candidate-documents',false,10485760,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('candidate-avatars','candidate-avatars',false,5242880,array['image/jpeg','image/png','image/webp']),
  ('interview-media','interview-media',false,262144000,array['audio/webm','video/webm'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy candidate_storage_select on storage.objects for select to authenticated using (bucket_id in ('candidate-documents','candidate-avatars','interview-media') and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy candidate_storage_insert on storage.objects for insert to authenticated with check (bucket_id in ('candidate-documents','candidate-avatars','interview-media') and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy candidate_storage_update on storage.objects for update to authenticated using (bucket_id in ('candidate-documents','candidate-avatars','interview-media') and (storage.foldername(name))[1]=(select auth.uid())::text) with check (bucket_id in ('candidate-documents','candidate-avatars','interview-media') and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy candidate_storage_delete on storage.objects for delete to authenticated using (bucket_id in ('candidate-documents','candidate-avatars','interview-media') and (storage.foldername(name))[1]=(select auth.uid())::text);
