# API reference

Base path: **`/api/v1`** (env `API_V1_PREFIX`).  
Browser (local Vite): **`/api/backend/...`** rewrites to `/api/v1/...`.  
Files in browser: **`/api/files/...`** → `/api/v1/files/...`.

OpenAPI (non-production): `http://127.0.0.1:8000/docs` (~70+ paths).  
Implementation: `backend/app/api/router.py`, `backend/app/api/routers/auth.py`, feature routers (`ats/routes`, `resume_improvement/routes`).

---

## Authentication

### Credentials

| Mechanism | Detail |
|-----------|--------|
| Header | `Authorization: Bearer <JWT>` (preferred) |
| Cookie | `career_copilot_session=<JWT>` |
| Algorithm | HS256 (`core/constants.py`) |
| Secret | `AUTH_SECRET` |
| Claims | `sub` (user id), `email`, `iat`, `exp` |
| Dep | `features/auth/service.py` → `get_current_user` |

### Auth endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/auth/sign-up` | No | Create user + profile graph; return token |
| POST | `/auth/sign-in` | No | Email/password; return token |
| POST | `/auth/session` | Yes | Current user payload |
| POST | `/auth/sign-out` | No | Clear session cookie (204) |
| POST | `/auth/firebase` | No* | Exchange Firebase ID token → app JWT |
| POST | `/auth/update-password` | Yes | Re-hash password |
| POST | `/auth/resend` | No | Stub (email not configured) |
| POST | `/auth/reset-password` | No | Stub (email not configured) |

\*Firebase endpoint validates a Firebase ID token instead of app JWT.

### Error shape

From `core/errors.py`:

```json
{
  "error": {
    "code": "authentication_required",
    "message": "Authentication is required.",
    "details": null,
    "request_id": "uuid"
  }
}
```

Common auth codes: `authentication_required`, `invalid_authorization`, `token_expired`, `invalid_access_token`, `invalid_user_identity`, `invalid_credentials`.

Every response includes `X-Request-ID` (middleware in `main.py`).

---

## Health and agents

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/health` | No | App + provider summary |
| GET | `/health/database` | No | Firestore probe |
| GET | `/agents/status` | No | Agent registry capabilities |

Agent definitions: `backend/app/agents/registry.py`.

---

## Files

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/files/{bucket}/{path}` | Yes | Path must start with `{user_id}/`; streams Supabase Storage |

Logical buckets: `DOCUMENT_BUCKET` / `AVATAR_BUCKET` prefixes inside `SUPABASE_STORAGE_BUCKET`.

---

## Me / profile

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/me/bootstrap` | Dashboard aggregate payload |
| GET | `/me/activity` | Recent activity events |
| GET / PATCH | `/profile` | Profile core fields |
| POST / DELETE | `/profile/avatar` | Avatar upload/remove |
| PUT | `/profile/preferences` | Career preferences |
| POST | `/profile/skills/from-resume` | Skill extraction helper |
| POST | `/profile/from-resume/preview` | Draft fill (no write) |
| POST | `/profile/from-resume/preview-upload` | Draft from uploaded file |
| POST | `/profile/from-resume/apply` | Persist validated draft |
| GET/POST | `/profile/{resource}` | List/create child rows |
| PATCH/DELETE | `/profile/{resource}/{record_id}` | Update/delete child |

`resource` ∈ skills, experiences, projects, education, certifications, languages, links  
(`CANDIDATE_TABLES` in `database/repository.py`).

Schemas: `api/schemas.py` (`ProfilePatch`, `PreferencesUpdate`, …).

---

## Resumes and versions

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/resumes` | List |
| POST | `/resumes` | Multipart upload + parse |
| GET/PATCH/DELETE | `/resumes/{id}` | CRUD |
| GET | `/resumes/{id}/preview` | Preview payload |
| POST | `/resumes/{id}/activate` | Mark active |
| POST | `/resumes/{id}/versions` | New version upload |
| GET | `/resume-versions/{id}` | Version detail |
| PATCH | `/resume-versions/{id}/extraction` | Edit sections before confirm |
| POST | `/resume-versions/{id}/confirm` | Confirm gate |

Confirm-required codes later: `resume_not_confirmed` (409) on ATS.

---

## Job descriptions

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/job-descriptions` | List |
| POST | `/job-descriptions` | Create from text |
| POST | `/job-descriptions/upload` | Create from file |
| GET | `/job-descriptions/{id}` | Detail |
| PATCH | `/job-descriptions/{id}/metadata` | Metadata |
| PATCH | `/job-descriptions/{id}/extraction` | Edit extraction |
| POST | `/job-descriptions/{id}/confirm` | Confirm gate |

---

## ATS

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/ats-analyses` | List analyses |
| POST | `/ats-analyses` | Score + persist + evidence |
| GET | `/ats-analyses/{id}` | Detail |
| DELETE | `/ats-analyses/{id}` | Delete |
| GET | `/ats-analyses/{id}/evidence` | Evidence rows |
| GET | `/ats-analyses/{id}/suggestions` | Improvement-oriented list |
| POST | `/ats/score` | Same formula, **no** DB write |

Algorithm: `evidence-keyword-coverage-v3`.  
See [features/ats-scoring.md](./features/ats-scoring.md).

Notable errors: `resume_not_confirmed`, `job_description_not_confirmed`, `ats_input_insufficient`.

---

## Resume improvement and exports

Mounted from `features/resume_improvement/routes.py`:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/resume-improvements/capabilities` | Provider readiness |
| POST | `/resume-improvements` | Start run |
| GET | `/resume-improvements/{run_id}` | Run status |
| GET | `/resume-improvements/{run_id}/suggestions` | Suggestions |
| PATCH | `/resume-suggestions/{id}` | Accept/reject/edit |
| POST | `/resume-improvements/{run_id}/apply` | Apply accepted |
| GET | `/resume-comparisons` | Comparisons |
| POST | `/resume-versions/{id}/exports` | Create export |
| GET | `/resume-exports/{id}/download` | Download export |

---

## Interview

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/interview-preparation` | Evidence-grounded prep pack |
| GET | `/interviews` | List sessions |
| POST | `/interviews` | Create session |
| GET/DELETE | `/interviews/{id}` | Detail / delete |
| POST | `/interviews/{id}/start` | Generate questions |
| POST | `/interviews/{id}/responses` | Store answer |
| POST | `/interviews/{id}/complete` | Complete session |

No endpoint grades answer quality for hiring.

---

## Learning

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/learning-paths` | List |
| POST | `/learning-paths` | Manual create |
| POST | `/learning-paths/generate` | From ATS gaps |
| GET/DELETE | `/learning-paths/{id}` | Detail / delete |
| PATCH | `/learning-paths/{id}/items/{item_id}` | Progress |

---

## Jobs and settings

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/jobs` | Browse catalog |
| GET | `/jobs/{id}` | Detail |
| POST | `/jobs/external/sync` | Adzuna sync (keys required) |
| GET | `/job-recommendations` | List |
| POST | `/job-recommendations/generate` | Compute matches |
| GET/POST/PATCH/DELETE | `/saved-jobs…` | Bookmarks |
| GET | `/settings` | Combined settings |
| PUT | `/settings/notifications` | Notifications |
| PUT | `/settings/privacy` | Privacy |
| DELETE | `/account` | Wipe account (`DELETE MY ACCOUNT`) |

---

## Rate limits and pagination

| Area | Behavior |
|------|----------|
| LLM | Process-level RPM via `LLM_RPM_LIMIT` + `agents/providers/rate_limit.py` |
| List endpoints | User-owned rows; newest-first via in-process recency sort when timestamps may be missing; not cursor-paginated everywhere |
| ATS terms | Cap 80 JD terms in scorer |
| Improvement | `IMPROVEMENT_MAX_SECTIONS`, source/JD char caps |

---

## Related docs

- [Flows](./flows.md) for call chains  
- [Features](./features/) for algorithms  
- [Operations](./operations.md) for local OpenAPI  
