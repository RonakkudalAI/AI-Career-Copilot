-- Local SQLite schema for Career Copilot
-- Authentication is stored in users. Files are stored under LOCAL_STORAGE_DIR.

create table if not exists users (
  id TEXT primary key,
  email text not null unique,
  full_name text,
  password_hash text not null,
  created_at TEXT not null default CURRENT_TIMESTAMP,
  updated_at TEXT not null default CURRENT_TIMESTAMP
);

create table if not exists profiles (
  id TEXT primary key references users(id) on delete cascade,
  full_name text not null default '', avatar_path text, headline text, bio text, phone text, location text,
  "current_role" text, years_experience REAL, career_level text, career_goal text,
  onboarding_step INTEGER not null default 1 check (onboarding_step between 1 and 6),
  onboarding_completed boolean not null default false,
  profile_completion INTEGER not null default 0 check (profile_completion between 0 and 100),
  profile_completion_details TEXT not null default '{}',
  created_at TEXT not null default CURRENT_TIMESTAMP, updated_at TEXT not null default CURRENT_TIMESTAMP,
  check (years_experience is null or years_experience >= 0)
);

create table if not exists candidate_preferences (
  user_id TEXT primary key references users(id) on delete cascade,
  target_roles TEXT not null default '{}', preferred_industries TEXT not null default '{}', preferred_locations TEXT not null default '{}',
  work_modes TEXT not null default '{}', employment_types TEXT not null default '{}', notice_period_days integer,
  willing_to_relocate boolean not null default false, work_authorization text, salary_min REAL, salary_max REAL,
  salary_currency text, created_at TEXT not null default CURRENT_TIMESTAMP, updated_at TEXT not null default CURRENT_TIMESTAMP,
  check (notice_period_days is null or notice_period_days >= 0), check (salary_min is null or salary_min >= 0),
  check (salary_max is null or salary_max >= 0), check (salary_min is null or salary_max is null or salary_min <= salary_max)
);

create table if not exists candidate_skills (
  id TEXT primary key default '', user_id TEXT not null references users(id) on delete cascade,
  name text not null, normalized_name text not null, category text, proficiency text,
  years_experience REAL check (years_experience is null or years_experience >= 0), source text not null default 'candidate',
  created_at TEXT not null default CURRENT_TIMESTAMP, updated_at TEXT not null default CURRENT_TIMESTAMP, unique(user_id, normalized_name)
);
create table if not exists candidate_experiences (
  id TEXT primary key default '', user_id TEXT not null references users(id) on delete cascade,
  company_name text not null, role_title text not null, employment_type text, location text, start_date date, end_date date,
  is_current boolean not null default false, summary text, display_order integer not null default 0,
  created_at TEXT not null default CURRENT_TIMESTAMP, updated_at TEXT not null default CURRENT_TIMESTAMP,
  check (end_date is null or start_date is null or end_date >= start_date), check (not is_current or end_date is null)
);
create table if not exists candidate_projects (
  id TEXT primary key default '', user_id TEXT not null references users(id) on delete cascade,
  title text not null, role text, description text, start_date date, end_date date, project_url text, repository_url text,
  skills TEXT not null default '{}', display_order integer not null default 0,
  created_at TEXT not null default CURRENT_TIMESTAMP, updated_at TEXT not null default CURRENT_TIMESTAMP,
  check (end_date is null or start_date is null or end_date >= start_date)
);
create table if not exists candidate_education (
  id TEXT primary key default '', user_id TEXT not null references users(id) on delete cascade,
  institution text not null, degree text, field_of_study text, location text, start_date date, end_date date, grade text,
  description text, display_order integer not null default 0, created_at TEXT not null default CURRENT_TIMESTAMP, updated_at TEXT not null default CURRENT_TIMESTAMP,
  check (end_date is null or start_date is null or end_date >= start_date)
);
create table if not exists candidate_certifications (
  id TEXT primary key default '', user_id TEXT not null references users(id) on delete cascade,
  name text not null, issuer text, issue_date date, expiry_date date, credential_id text, credential_url text,
  does_not_expire boolean not null default false, created_at TEXT not null default CURRENT_TIMESTAMP, updated_at TEXT not null default CURRENT_TIMESTAMP,
  check (expiry_date is null or issue_date is null or expiry_date >= issue_date), check (not does_not_expire or expiry_date is null)
);
create table if not exists candidate_languages (
  id TEXT primary key default '', user_id TEXT not null references users(id) on delete cascade,
  language text not null, normalized_language text not null, proficiency text, display_order integer not null default 0,
  created_at TEXT not null default CURRENT_TIMESTAMP, updated_at TEXT not null default CURRENT_TIMESTAMP, unique(user_id, normalized_language)
);
create table if not exists candidate_links (
  id TEXT primary key default '', user_id TEXT not null references users(id) on delete cascade,
  link_type text not null check (link_type in ('linkedin','github','portfolio','website','other')), label text, url text not null,
  display_order integer not null default 0, created_at TEXT not null default CURRENT_TIMESTAMP, updated_at TEXT not null default CURRENT_TIMESTAMP
);

create table if not exists resumes (
  id TEXT primary key default '', user_id TEXT not null references users(id) on delete cascade,
  title text not null, is_active boolean not null default false, created_at TEXT not null default CURRENT_TIMESTAMP,
  updated_at TEXT not null default CURRENT_TIMESTAMP, deleted_at TEXT, unique(id, user_id)
);
create unique index if not exists one_active_resume_per_user on resumes(user_id) where is_active and deleted_at is null;
create table if not exists resume_versions (
  id TEXT primary key default '', resume_id TEXT not null, user_id TEXT not null references users(id) on delete cascade,
  version_number integer not null check (version_number > 0), source_type text not null check (source_type in ('uploaded','edited','exported')),
  original_filename text not null, storage_path text not null, mime_type text not null check (mime_type in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes INTEGER not null check (size_bytes > 0), sha256 text not null, plain_text text, structured_content TEXT not null default '{}',
  extraction_status text not null default 'pending' check (extraction_status in ('pending','processing','review_required','confirmed','failed')),
  extraction_warnings TEXT not null default '[]', extraction_confidence TEXT not null default '{}',
  candidate_confirmed_at TEXT, created_from_version_id TEXT references resume_versions(id), improvement_run_id TEXT,
  change_metadata TEXT not null default '{}', created_at TEXT not null default CURRENT_TIMESTAMP,
  unique(resume_id, version_number), unique(id, user_id), foreign key(resume_id,user_id) references resumes(id,user_id) on delete cascade
);
create table if not exists job_descriptions (
  id TEXT primary key default '', user_id TEXT not null references users(id) on delete cascade,
  input_type text not null check (input_type in ('text','pdf','docx')), title text not null, company text, role_title text,
  original_filename text, storage_path text, mime_type text, size_bytes INTEGER, sha256 text, raw_text text,
  structured_content TEXT not null default '{}',
  extraction_status text not null default 'pending' check (extraction_status in ('pending','processing','review_required','confirmed','failed')),
  extraction_warnings TEXT not null default '[]', extraction_confidence TEXT not null default '{}',
  candidate_confirmed_at TEXT, created_at TEXT not null default CURRENT_TIMESTAMP, updated_at TEXT not null default CURRENT_TIMESTAMP, unique(id,user_id),
  check ((input_type='text' and raw_text is not null and storage_path is null) or (input_type in ('pdf','docx') and storage_path is not null and size_bytes > 0))
);

create table if not exists ats_analyses (
  id TEXT primary key default '', user_id TEXT not null references users(id) on delete cascade,
  resume_version_id TEXT not null, job_description_id TEXT not null,
  status text not null default 'draft' check (status in ('draft','queued','processing','completed','failed')),
  algorithm_version text, overall_score REAL check (overall_score is null or overall_score between 0 and 100),
  score_breakdown TEXT, summary TEXT, error_code text, error_message text, created_at TEXT not null default CURRENT_TIMESTAMP,
  started_at TEXT, completed_at TEXT, unique(id,user_id),
  foreign key(resume_version_id,user_id) references resume_versions(id,user_id),
  foreign key(job_description_id,user_id) references job_descriptions(id,user_id)
);
create table if not exists ats_evidence (
  id TEXT primary key default '', user_id TEXT not null references users(id) on delete cascade, analysis_id TEXT not null,
  category text, requirement_text text not null, requirement_type text, resume_evidence_text text, resume_section text,
  resume_source_reference TEXT, job_description_source_reference TEXT,
  match_status text not null check (match_status in ('strong_match','partial_match','not_found','unverified','not_applicable')),
  score_contribution REAL, rule_id text, explanation text, created_at TEXT not null default CURRENT_TIMESTAMP,
  foreign key(analysis_id,user_id) references ats_analyses(id,user_id) on delete cascade
);
create table if not exists resume_suggestions (
  id TEXT primary key default '', user_id TEXT not null references users(id) on delete cascade,
  analysis_id TEXT not null, resume_version_id TEXT not null, section_key text not null, original_text text, suggested_text text not null,
  reason text, supporting_evidence_ids TEXT not null default '{}', decision text not null default 'pending' check (decision in ('pending','accepted','rejected','edited')),
  candidate_text text, source_block_id text, source_text_hash text, suggestion_type text,
  evidence_references TEXT not null default '[]', validation_status text,
  validation_issues TEXT not null default '[]', run_id TEXT,
  created_at TEXT not null default CURRENT_TIMESTAMP, decided_at TEXT,
  foreign key(analysis_id,user_id) references ats_analyses(id,user_id) on delete cascade,
  foreign key(resume_version_id,user_id) references resume_versions(id,user_id)
);
create table if not exists resume_exports (
  id TEXT primary key default '', user_id TEXT not null references users(id) on delete cascade,
  resume_version_id TEXT not null, export_format text not null check (export_format in ('pdf','docx')), storage_path text not null, filename text,
  created_at TEXT not null default CURRENT_TIMESTAMP, foreign key(resume_version_id,user_id) references resume_versions(id,user_id)
);

create table if not exists interview_sessions (
  id TEXT primary key default '', user_id TEXT not null references users(id) on delete cascade,
  resume_version_id TEXT, job_description_id TEXT, mode text not null check (mode in ('resume','resume_and_jd','role','topic','company','behavioural','technical','hr','mixed')),
  target_role text, target_company text, topic text, difficulty text, question_count integer check (question_count > 0),
  duration_minutes integer check (duration_minutes > 0), camera_enabled boolean not null default false, microphone_enabled boolean not null default false,
  recording_consent boolean not null default false, status text not null default 'draft' check (status in ('draft','ready','in_progress','completed','cancelled','failed')),
  started_at TEXT, completed_at TEXT, created_at TEXT not null default CURRENT_TIMESTAMP, updated_at TEXT not null default CURRENT_TIMESTAMP, unique(id,user_id),
  foreign key(resume_version_id,user_id) references resume_versions(id,user_id), foreign key(job_description_id,user_id) references job_descriptions(id,user_id)
);
create table if not exists interview_questions (
  id TEXT primary key default '', user_id TEXT not null references users(id) on delete cascade, session_id TEXT not null,
  position integer not null check (position > 0), question text not null, question_type text, source_context TEXT,
  created_at TEXT not null default CURRENT_TIMESTAMP, unique(session_id,position), unique(id,user_id),
  foreign key(session_id,user_id) references interview_sessions(id,user_id) on delete cascade
);
create table if not exists interview_responses (
  id TEXT primary key default '', user_id TEXT not null references users(id) on delete cascade,
  session_id TEXT not null, question_id TEXT not null, typed_response text, transcript text, audio_path text, video_path text,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0), created_at TEXT not null default CURRENT_TIMESTAMP,
  foreign key(session_id,user_id) references interview_sessions(id,user_id) on delete cascade,
  foreign key(question_id,user_id) references interview_questions(id,user_id) on delete cascade
);
create table if not exists interview_reports (
  id TEXT primary key default '', user_id TEXT not null references users(id) on delete cascade, session_id TEXT not null,
  evaluator_version text, overall_score REAL check (overall_score is null or overall_score between 0 and 100),
  technical_score REAL check (technical_score is null or technical_score between 0 and 100),
  communication_score REAL check (communication_score is null or communication_score between 0 and 100),
  visual_score REAL check (visual_score is null or visual_score between 0 and 100),
  technical_metrics TEXT, communication_metrics TEXT, visual_metrics TEXT, feedback TEXT,
  created_at TEXT not null default CURRENT_TIMESTAMP, foreign key(session_id,user_id) references interview_sessions(id,user_id) on delete cascade
);

create table if not exists learning_paths (
  id TEXT primary key default '', user_id TEXT not null references users(id) on delete cascade,
  title text not null, description text, source_type text not null check (source_type in ('ats_analysis','interview_report','candidate_selected')),
  source_id TEXT, status text not null default 'active' check (status in ('active','completed','archived')),
  progress_percentage INTEGER not null default 0 check (progress_percentage between 0 and 100),
  created_at TEXT not null default CURRENT_TIMESTAMP, updated_at TEXT not null default CURRENT_TIMESTAMP, unique(id,user_id)
);
create table if not exists learning_items (
  id TEXT primary key default '', user_id TEXT not null references users(id) on delete cascade, learning_path_id TEXT not null,
  position integer not null check (position > 0), title text not null, objective text, item_type text, difficulty text,
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes >= 0), status text not null default 'pending' check (status in ('pending','in_progress','completed')),
  completed_at TEXT, metadata TEXT not null default '{}', created_at TEXT not null default CURRENT_TIMESTAMP, updated_at TEXT not null default CURRENT_TIMESTAMP, unique(id,user_id),
  foreign key(learning_path_id,user_id) references learning_paths(id,user_id) on delete cascade
);
create table if not exists learning_resources (
  id TEXT primary key default '', user_id TEXT not null references users(id) on delete cascade, learning_item_id TEXT not null,
  title text not null, resource_type text, provider text, url text, reason_recommended text, metadata TEXT not null default '{}',
  created_at TEXT not null default CURRENT_TIMESTAMP, foreign key(learning_item_id,user_id) references learning_items(id,user_id) on delete cascade
);

create table if not exists jobs (
  id TEXT primary key default '', external_source text, external_id text, title text not null, company text not null,
  location text, work_mode text, employment_type text, experience_min REAL, experience_max REAL, salary_min REAL, salary_max REAL,
  salary_currency text, description text not null, requirements TEXT not null default '[]', application_url text,
  published_at TEXT, expires_at TEXT, is_active boolean not null default true,
  latitude real, longitude real, created_at TEXT not null default CURRENT_TIMESTAMP, updated_at TEXT not null default CURRENT_TIMESTAMP,
  unique(external_source,external_id), check (experience_min is null or experience_min >= 0), check (experience_max is null or experience_max >= experience_min)
);
create table if not exists job_recommendations (
  id TEXT primary key default '', user_id TEXT not null references users(id) on delete cascade,
  job_id TEXT not null references jobs(id) on delete cascade, resume_version_id TEXT not null,
  match_score REAL check (match_score between 0 and 100), match_breakdown TEXT, evidence TEXT, algorithm_version text,
  generated_at TEXT not null default CURRENT_TIMESTAMP, foreign key(resume_version_id,user_id) references resume_versions(id,user_id), unique(user_id,job_id,resume_version_id)
);
create table if not exists saved_jobs (
  user_id TEXT not null references users(id) on delete cascade, job_id TEXT not null references jobs(id) on delete cascade,
  status text not null default 'saved' check (status in ('saved','applied','interviewing','offer','rejected','withdrawn')),
  notes text, saved_at TEXT not null default CURRENT_TIMESTAMP, updated_at TEXT not null default CURRENT_TIMESTAMP, primary key(user_id,job_id)
);

create table if not exists notification_preferences (
  user_id TEXT primary key references users(id) on delete cascade, job_alerts boolean not null default false,
  learning_reminders boolean not null default true, interview_reminders boolean not null default true, product_updates boolean not null default false,
  email_frequency text not null default 'weekly' check (email_frequency in ('never','daily','weekly')),
  created_at TEXT not null default CURRENT_TIMESTAMP, updated_at TEXT not null default CURRENT_TIMESTAMP
);
create table if not exists privacy_preferences (
  user_id TEXT primary key references users(id) on delete cascade, camera_permission text not null default 'ask' check (camera_permission in ('ask','allowed','disabled')),
  microphone_permission text not null default 'ask' check (microphone_permission in ('ask','allowed','disabled')),
  recording_retention_days integer not null default 0 check (recording_retention_days between 0 and 365),
  resume_processing_consent boolean not null default false, job_recommendation_consent boolean not null default false,
  profile_visibility text not null default 'private' check (profile_visibility in ('private','limited')),
  created_at TEXT not null default CURRENT_TIMESTAMP, updated_at TEXT not null default CURRENT_TIMESTAMP
);
create table if not exists activity_events (
  id TEXT primary key default '', user_id TEXT not null references users(id) on delete cascade,
  event_type text not null, entity_type text, entity_id TEXT, summary text not null, metadata TEXT not null default '{}',
  created_at TEXT not null default CURRENT_TIMESTAMP
);
create table if not exists user_notifications (
  id TEXT primary key default '', user_id TEXT not null references users(id) on delete cascade,
  notification_type text not null, title text not null, message text not null, action_route text, read_at TEXT,
  created_at TEXT not null default CURRENT_TIMESTAMP
);


create index if not exists ats_analyses_status_idx on ats_analyses(status);
create index if not exists interview_sessions_status_idx on interview_sessions(status);
create index if not exists jobs_active_published_idx on jobs(is_active,published_at desc);
create index if not exists activity_events_user_created_idx on activity_events(user_id,created_at desc);
create index if not exists user_notifications_unread_idx on user_notifications(user_id,created_at desc) where read_at is null;

-- Candidate pages filter every collection by user_id. Keep these reads indexed.
create index if not exists candidate_skills_user_idx on candidate_skills(user_id);
create index if not exists candidate_experiences_user_order_idx on candidate_experiences(user_id,display_order,created_at desc);
create index if not exists candidate_projects_user_order_idx on candidate_projects(user_id,display_order,created_at desc);
create index if not exists candidate_education_user_order_idx on candidate_education(user_id,display_order,created_at desc);
create index if not exists candidate_certifications_user_idx on candidate_certifications(user_id,created_at desc);
create index if not exists candidate_languages_user_order_idx on candidate_languages(user_id,display_order,created_at desc);
create index if not exists candidate_links_user_order_idx on candidate_links(user_id,display_order,created_at desc);
create index if not exists resumes_user_active_idx on resumes(user_id,is_active,deleted_at,created_at desc);
create index if not exists resume_versions_user_created_idx on resume_versions(user_id,created_at desc);
create index if not exists job_descriptions_user_created_idx on job_descriptions(user_id,created_at desc);
create index if not exists ats_analyses_user_status_created_idx on ats_analyses(user_id,status,created_at desc);
create index if not exists interview_sessions_user_status_created_idx on interview_sessions(user_id,status,created_at desc);
create index if not exists learning_paths_user_status_created_idx on learning_paths(user_id,status,created_at desc);
create index if not exists saved_jobs_user_status_updated_idx on saved_jobs(user_id,status,updated_at desc);
create index if not exists ats_evidence_analysis_idx on ats_evidence(analysis_id,user_id);


create table if not exists resume_improvement_runs (
  id TEXT primary key default '',
  user_id TEXT not null references users(id) on delete cascade,
  resume_version_id TEXT not null,
  job_description_id TEXT,
  ats_analysis_id TEXT,
  status text not null default 'pending' check (status in ('pending','generating','validating','completed','failed','cancelled')),
  provider text not null,
  model text not null,
  prompt_version text not null,
  requested_sections TEXT not null,
  validation_summary TEXT not null default '{}',
  error_code text,
  created_at TEXT not null default CURRENT_TIMESTAMP,
  completed_at TEXT,
  unique(id,user_id),
  foreign key(resume_version_id,user_id) references resume_versions(id,user_id),
  foreign key(job_description_id,user_id) references job_descriptions(id,user_id),
  foreign key(ats_analysis_id,user_id) references ats_analyses(id,user_id)
);

create index if not exists resume_improvement_runs_user_created_idx
  on resume_improvement_runs(user_id,created_at desc);
create index if not exists resume_improvement_runs_version_idx
  on resume_improvement_runs(resume_version_id);
create index if not exists resume_improvement_runs_status_idx
  on resume_improvement_runs(status);
create index if not exists resume_suggestions_run_idx
  on resume_suggestions(run_id);
create index if not exists resume_exports_version_idx
  on resume_exports(resume_version_id);




