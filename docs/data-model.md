# Data model

System of record:

| Store | Role |
|-------|------|
| **Cloud Firestore** | Structured candidate data |
| **Supabase Storage** | Binary objects (resumes, avatars, exports) |

Access path: **FastAPI only** (Admin SDK for Firestore; service role for Supabase).  
Browser rules deny direct Firestore access (`firebase/firestore.rules`).

Adapter: `backend/app/database/client.py` (allow-listed table names + storage facade).

---

## Ownership model

Almost every candidate row includes:

| Field | Meaning |
|-------|---------|
| `user_id` | Owner UUID (string in Firestore) |
| `id` | Record UUID (except some preference docs keyed by `user_id`) |

Helpers in `backend/app/database/repository.py`:

- `owned_row` / `owned_rows` — ownership filters  
- `sort_rows_by_recency` — newest-first when `created_at` may be missing  

**Why:** Never trust a client-supplied id without an ownership filter.

---

## Collection groups

### Identity

| Collection | Key fields | Created by |
|------------|------------|------------|
| `users` | `id`, `email`, `password_hash`, `full_name`, optional `firebase_uid` | Sign-up, Firebase exchange |
| `profiles` | `id` (= user id), completion fields, avatar paths | Signup + profile patches |

### Preferences

| Collection | Notes |
|------------|--------|
| `candidate_preferences` | Target roles, locations, work modes, etc. |
| `notification_preferences` | Notification toggles |
| `privacy_preferences` | Privacy toggles |

### Profile content (`CANDIDATE_TABLES`)

| API resource | Collection |
|--------------|------------|
| `skills` | `candidate_skills` |
| `experiences` | `candidate_experiences` |
| `projects` | `candidate_projects` |
| `education` | `candidate_education` |
| `certifications` | `candidate_certifications` |
| `languages` | `candidate_languages` |
| `links` | `candidate_links` |

### Documents

| Collection | Purpose |
|------------|---------|
| `resumes` | Parent (`title`, `is_active`, soft `deleted_at`, `created_at`) |
| `resume_versions` | File version: text, structured content, extraction status, `storage_path` |
| `job_descriptions` | JD text/file, metadata, extraction status |

#### Extraction status

```text
pending → processing → review_required → confirmed
                              ↘ failed
```

Only **`confirmed`** content may enter ATS, learning generation, and recommendation evidence paths.

| Field | Meaning |
|-------|---------|
| `plain_text` / `raw_text` | Source text for matching |
| `structured_content` | `{ schema_version, sections, warnings, extraction_method }` |
| `extraction_status` | Lifecycle above |
| `candidate_confirmed_at` | Confirm timestamp (ATS fingerprint) |
| `storage_path` | Object key under document prefix |
| `created_at` | ISO timestamp (always set on new writes) |

### ATS

| Collection | Purpose |
|------------|---------|
| `ats_analyses` | Score run: status, overall score, breakdown, summary, algorithm version, timestamps |
| `ats_evidence` | One row per JD term: match status, exact quote or null |

Algorithm: `evidence-keyword-coverage-v3`.

**List/detail enrichment:** API attaches `resume` and `job_description` objects (filename, title, company, version) from linked ids so history can show what was used even if the parent resume was soft-deleted later.

**Idempotency:** `POST /ats-analyses` fingerprints source text + confirm times. Unchanged fingerprint returns the existing completed analysis (enriched).

### Resume improvement

| Collection | Purpose |
|------------|---------|
| `resume_improvement_runs` | Job metadata |
| `resume_suggestions` | Accept/reject/edit suggestions |
| `resume_exports` | Generated export files |

### Interview

| Collection | Purpose |
|------------|---------|
| `interview_sessions` | Mode, role, difficulty, camera/mic flags, status |
| `interview_questions` | Generated questions + source_context |
| `interview_responses` | Typed text / transcript fields |
| `interview_reports` | Completion artifacts (no AI scores) |

### Learning

| Collection | Purpose |
|------------|---------|
| `learning_paths` | Path metadata, progress, source analysis id |
| `learning_items` | Steps |
| `learning_resources` | YouTube watch or search URLs |

Algorithm: `ats-youtube-api-v1`.

### Jobs

| Collection | Purpose |
|------------|---------|
| `jobs` | Local catalog (optional Adzuna fill) |
| `job_recommendations` | Ranked matches |
| `saved_jobs` | User bookmarks |

Match algorithm: `evidence-keyword-match-v1`.

### Activity

| Collection | Purpose |
|------------|---------|
| `activity_events` | Dashboard recent activity (pruned; `created_at` on write) |

---

## Object storage layout

Product engine: **Supabase Storage** bucket `SUPABASE_STORAGE_BUCKET`.

Logical prefixes (env):

| Env | Typical value | Contents |
|-----|---------------|----------|
| `DOCUMENT_BUCKET` | `candidate-documents` | Resumes, JDs, exports |
| `AVATAR_BUCKET` | `candidate-avatars` | Profile images |

```text
{SUPABASE_STORAGE_BUCKET}/
  {DOCUMENT_BUCKET}/{user_id}/resumes/...
  {DOCUMENT_BUCKET}/{user_id}/job-descriptions/...
  {AVATAR_BUCKET}/{user_id}/avatars/...
```

Browser download:

```text
GET /api/v1/files/{bucket}/{path}
  Authorization: Bearer <JWT>
  path must start with {user_id}/
```

Local Vite maps `/api/files/*` → that route.

`APP_ENV=test` uses in-memory object storage (no network).

---

## Account deletion cascade

Defined in `features/auth/account_deletion.py` as `USER_OWNED_TABLES` (children first), then `profiles` / `users`.

Phrase required: **`DELETE MY ACCOUNT`**.

Also:

1. Collect storage paths from resume versions, exports, JDs, avatars.  
2. Purge objects from configured object storage.  
3. Delete Firestore rows.  

---

## Related

- [Architecture](./architecture.md)  
- [Flows](./flows.md)  
- [Operations](./operations.md)  
