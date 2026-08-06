# Data model

System of record: **Firebase Cloud Firestore** (structured data) + **Firebase Storage** (files).  
Access path: **FastAPI Admin SDK only**. Browser rules deny direct reads/writes (`firebase/firestore.rules`).

Adapter: `backend/app/database/client.py` (allow-listed table names).

---

## Ownership model

Almost every candidate row includes:

| Field | Meaning |
|-------|---------|
| `user_id` | Owner UUID (string in Firestore) |
| `id` | Record UUID (except some preference docs keyed by `user_id`) |

Helpers in `backend/app/database/repository.py`:

- `owned_row(client, table, id, user)` — 404 `record_not_found` if missing or not owned  
- `owned_rows(client, table, user)` — list for current user  

**Why:** Never trust a client-supplied id without ownership filter.

---

## Collection groups

### Identity

| Collection | Key fields (conceptual) | Created by |
|------------|-------------------------|------------|
| `users` | `id`, `email`, `password_hash`, `full_name` | `POST /auth/sign-up`, Firebase exchange |
| `profiles` | `id` (= user id), `full_name`, location, role, completion fields | Signup + profile patches |

### Preferences

| Collection | Notes |
|------------|--------|
| `candidate_preferences` | Target roles, locations, work modes, salary, etc. |
| `notification_preferences` | Notification toggles |
| `privacy_preferences` | Privacy toggles |

### Profile content (`CANDIDATE_TABLES`)

Mapped in `repository.py`:

| API resource | Collection |
|--------------|------------|
| `skills` | `candidate_skills` |
| `experiences` | `candidate_experiences` |
| `projects` | `candidate_projects` |
| `education` | `candidate_education` |
| `certifications` | `candidate_certifications` |
| `languages` | `candidate_languages` |
| `links` | `candidate_links` |

CRUD: `GET/POST/PATCH/DELETE /profile/{resource}` in `api/router.py`.

### Documents

| Collection | Purpose |
|------------|---------|
| `resumes` | Resume parent (title, `is_active`, soft delete) |
| `resume_versions` | File version: plain text, structured content, extraction status, storage path |
| `job_descriptions` | JD text/file, metadata, extraction status |

#### Extraction status lifecycle

```text
pending → processing → review_required → confirmed
                              ↘ failed
```

Only **`confirmed`** resume versions and JDs may enter ATS, learning generation, and recommendation evidence paths.

Typical fields on a version/JD:

| Field | Meaning |
|-------|---------|
| `plain_text` / `raw_text` | Source text used for matching |
| `structured_content` | `{ schema_version, sections, warnings, extraction_method }` |
| `extraction_status` | Lifecycle above |
| `candidate_confirmed_at` | Confirm timestamp (used in ATS fingerprint) |
| `storage_path` | Object path under document bucket |

### ATS

| Collection | Purpose |
|------------|---------|
| `ats_analyses` | Score run: overall score, breakdown, summary, algorithm version, status |
| `ats_evidence` | One row per JD term: match status, exact quote or null, contribution |

Algorithm version (product): `evidence-keyword-coverage-v3` (`features/ats/ats_score.py`).

**Idempotency / freshness:**  
`POST /ats-analyses` fingerprints source text + confirm timestamps. Same resume/JD ids with **unchanged** fingerprint returns existing completed analysis; content changes force re-score.

### Resume improvement

| Collection | Purpose |
|------------|---------|
| `resume_improvement_runs` | Improvement job metadata |
| `resume_suggestions` | Accept/reject/edit suggestions |
| `resume_exports` | Generated export files |

### Interview

| Collection | Purpose |
|------------|---------|
| `interview_sessions` | Mode, role, difficulty, status |
| `interview_questions` | Generated questions |
| `interview_responses` | Candidate answers / media paths |
| `interview_reports` | Session completion artifacts |

No AI “score” fields for grading answers as a hiring decision.

### Learning

| Collection | Purpose |
|------------|---------|
| `learning_paths` | Path metadata, progress, source analysis id |
| `learning_items` | Steps (gaps / lessons) |
| `learning_resources` | YouTube URLs (watch or search) |

Algorithm version: `ats-youtube-api-v1` (`features/learning/youtube_catalog.py`).

### Jobs

| Collection | Purpose |
|------------|---------|
| `jobs` | Local job catalog (optionally filled by Adzuna sync) |
| `job_recommendations` | Ranked matches for user |
| `saved_jobs` | User bookmarks |

Match algorithm: `evidence-keyword-match-v1` (`features/career_matching.py`).

### Activity / notifications

| Collection | Purpose |
|------------|---------|
| `activity_events` | Dashboard recent activity (pruned) |
| `user_notifications` | In-app notifications (if used) |

---

## Account deletion cascade

Defined in `features/auth/account_deletion.py` as `USER_OWNED_TABLES` (children first), then `profiles` / `users`.

Phrase required: **`DELETE MY ACCOUNT`**.

Also:

1. Collect storage paths from resume versions, exports, JDs, avatars.  
2. Purge Firebase Storage objects.  
3. Delete Firestore rows.  

---

## File storage

Logical buckets (env) become **prefixes** inside `FIREBASE_STORAGE_BUCKET`:

| Env | Default prefix | Use |
|-----|----------------|-----|
| `DOCUMENT_BUCKET` | `candidate-documents` | Resumes, JDs, exports |
| `AVATAR_BUCKET` | `candidate-avatars` | Profile pictures |

Path shape:

```text
{logical_bucket}/{user_id}/...
```

Download API:

```text
GET /api/v1/files/{bucket}/{path}
```

Must be authenticated; path must start with the current user’s id (`api/router.py`).

Size limits (settings defaults):

| Setting | Default |
|---------|---------|
| `document_max_bytes` | 10 MiB |
| `avatar_max_bytes` | 3 MiB |
| `interview_media_max_bytes` | 0 (disabled when 0) |

---

## Structured resume payload shape

After parse (`document_parsing/pipeline.py`):

```json
{
  "schema_version": "resume-extraction-v1",
  "sections": {
    "skills": ["…"],
    "experience": ["…"],
    "education": ["…"]
  },
  "warnings": [],
  "extraction_method": "…"
}
```

Product payloads intentionally omit raw `source_blocks` UI fields; section body text is reconstructed from source lines.

---

## Related docs

- [Features — document parsing](./features/document-parsing.md)  
- [Features — ATS](./features/ats-scoring.md)  
- [Architecture](./architecture.md)  
