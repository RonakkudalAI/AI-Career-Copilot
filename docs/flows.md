# Request and data flows

Each flow lists **why**, **how**, and **where** (file citations). Paths are relative to the repo root.

> Visual overview: unified Mermaid diagrams in **[diagrams.md](./diagrams.md)**.

---

## 0. Browser → API (every authenticated call)

```text
UI component
  → shared/api/client.ts :: apiRequest(path, init)
       │  if demo cookie → features/auth/demo-session.ts (no network)
       │  else getSession from features/auth/api/client.ts
       ▼
  fetch( resolveApiBase() + path )
       │  base usually "/api/backend"
       │  Authorization: Bearer <JWT>
       │  credentials: include
       ▼
  frontend/vite.config.mjs proxy
       rewrite /api/backend → /api/v1 on PUBLIC_API_BASE_URL
       ▼
  backend/app/main.py middleware
       X-Request-ID, CORS, logging
       ▼
  route handler in api/router.py (or feature router)
       Depends(get_current_user) → features/auth/service.py
       ▼
  database_client(settings) → database/client.py
       Firestore Admin / Storage
```

| Step | File |
|------|------|
| API helper | `frontend/src/shared/api/client.ts` |
| Base URL / tokens | `frontend/src/shared/config.ts` |
| Proxy | `frontend/vite.config.mjs` |
| Auth dependency | `backend/app/features/auth/service.py` |
| Errors | `backend/app/core/errors.py` |

---

## 1. Sign-up / sign-in

### Why

Create an isolated candidate identity; issue a long-lived app JWT for subsequent ownership checks.

### How

```text
SignUpScreen / SignInScreen
  features/auth/components/auth-screen.tsx
    → createClient().auth.signUp | signInWithPassword
         features/auth/api/client.ts
           POST /auth/sign-up | /auth/sign-in
           saveToken → localStorage + cookie
```

Backend sign-up (`api/router.py`):

1. Normalize email; validate length (`MIN_PASSWORD_LENGTH` in `core/constants.py`).  
2. Reject duplicate email (409).  
3. Hash password with **scrypt** (`_password_hash`).  
4. `_create_user_records`: insert `users` + `profiles` + preference rows; rollback children on failure.  
5. `create_access_token` (`features/auth/service.py`).  

Sign-in: lookup email → `_password_matches` → same token payload.

### Where

| Concern | File |
|---------|------|
| UI | `frontend/src/features/auth/components/auth-screen.tsx` |
| Browser auth client | `frontend/src/features/auth/api/client.ts` |
| Routes | `backend/app/api/router.py` (`/auth/*`) |
| JWT | `backend/app/features/auth/service.py` |
| Password crypto | `backend/app/api/router.py` (`_password_hash`, `_password_matches`) |

### Google (optional)

```text
features/auth/firebase.ts  (Firebase Web SDK)
  → id_token
  → POST /auth/firebase
  → server verifies Firebase token, upserts user, issues app JWT
```

---

## 2. Route protection (frontend)

```text
App.tsx :: ProtectedRoute
  - demo session? allow
  - else require localStorage access token
  - missing → Navigate to /sign-in?next=…
```

| File | Role |
|------|------|
| `frontend/src/App.tsx` | Guard + route table |
| `frontend/src/features/auth/safe-path.ts` | Safe redirect path |

**Note:** UI guards are convenience only. Server always re-validates JWT and ownership.

---

## 3. Resume upload → parse → review → confirm

### Why

Convert a PDF/DOCX into **reviewable** plain text + sections without inventing content. ATS must not run on unconfirmed extraction.

### How

```text
1. UI multipart POST /resumes
   frontend/src/features/resume/components/resume-flow.tsx
        │
2. api/router.py :: create_resume
   - insert resumes row
   - read file bytes
   - _upload_resume_version(…)
        │
3. Validate mime/size  (document_parsing/service.py :: validate_document)
   Upload bytes to Storage  (database/client.py storage)
        │
4. parse_document_bytes  (document_parsing/pipeline.py)
        │  asyncio.to_thread(extract_text)  ← keep event loop free
        │
5. extract_text  (parsing/text_extract.py)
   PDF:  PyMuPDF → pdfplumber → pypdf (≥200 chars quality gate)
   DOCX: python-docx (≥80 chars quality gate)
        │
6. extract_sections_enriched  (parsing/llm_sections.py)
   - Prefer LLM line-number → section kind mapping
   - Reconstruct body from source lines only
   - Else structural heuristics (parsing/sections.py)
        │
7. Persist resume_versions
   extraction_status = review_required
   plain_text + structured_content
        │
8. UI review / PATCH extraction
   POST /resume-versions/{id}/confirm
   extraction_status = confirmed
```

### Where

| Step | File |
|------|------|
| Upload route | `backend/app/api/router.py` (`POST /resumes`) |
| Parse entry | `backend/app/features/document_parsing/pipeline.py` |
| Text extract | `…/parsing/text_extract.py` |
| Fast PDF blocks | `…/extractors/pdf.py` |
| Sections LLM | `…/parsing/llm_sections.py` |
| Sections heuristic | `…/parsing/sections.py` |
| Helpers | `…/service.py` |
| Confirm | `api/router.py` (`POST /resume-versions/{id}/confirm`) |
| UI | `frontend/src/features/resume/components/resume-flow.tsx` |

---

## 4. Job description create → confirm

### Why

JD text is the **source of requirements** for ATS. Same confirm gate as resumes.

### How

```text
POST /job-descriptions          (JSON raw text)
POST /job-descriptions/upload   (file → parse_document_bytes)
  → review_required
PATCH extraction / metadata
POST /job-descriptions/{id}/confirm
  → confirmed
```

| File | Role |
|------|------|
| Routes | `backend/app/api/router.py` |
| Parse reuse | `document_parsing/pipeline.py` |
| Schema | `api/schemas.py` (`JobDescriptionTextCreate`, …) |

---

## 5. ATS analysis (product path)

### Why

Produce an **explainable** coverage score with exact resume quotes for each JD term.

### How

```text
POST /ats-analyses { resume_version_id, job_description_id }
  api/router.py :: create_ats
        │
  owned_row resume_versions + job_descriptions
  require extraction_status == confirmed  (else 409)
        │
  ats_source_fingerprint(plain_text, structured, raw_text, confirm times)
  if prior completed analysis with same fingerprint → return prior
        │
  score_resume(resume_text, jd_text, structured_sections)
  features/ats/ats_score.py
        │  extract JD terms (required/preferred weights)
        │  match resume lines (strong/partial/missing)
        │  overall_score = weighted contributions
        │
  insert ats_analyses (processing → completed)
  insert ats_evidence rows (exact quote or null)
        │
  optional generate_ats_improvement_brief
  features/ats/agents/improvement_brief.py
        │  uses missing/matched lists only
        │
  write_activity
  return analysis
```

Stateless twin (no DB write): `POST /ats/score` in `features/ats/routes.py` — same `score_resume`.

### Where

| Concern | File |
|---------|------|
| Persist path | `backend/app/api/router.py` (`create_ats`) |
| Formula | `backend/app/features/ats/ats_score.py` |
| Brief | `backend/app/features/ats/agents/improvement_brief.py` |
| Stateless | `backend/app/features/ats/routes.py` |
| UI report | `frontend/src/features/resume/components/resume-flow.tsx` |

### What is **not** on this path

Optional composite LLM ATS under `features/ats/agent/` + `features/ats/scoring/` is **library/tests only**. Product comments in `create_ats` force deterministic keyword coverage.

---

## 6. Profile fill from resume

### Why

Bootstrap profile fields from confirmed resume text, with a **preview → apply** human gate.

### How

```text
POST /profile/from-resume/preview
  OR preview-upload
    → features/profile/agent/pipeline.py
         NVIDIA structured extract + deterministic merge
    → return draft (not written yet)

User reviews
POST /profile/from-resume/apply
    → features/profile/importer.py :: insert_validated_batch
    → repository.recalculate_completion
```

| File | Role |
|------|------|
| Routes | `api/router.py` |
| Pipeline | `features/profile/agent/pipeline.py` |
| Deterministic | `features/profile/agent/deterministic.py` |
| Apply | `features/profile/importer.py` |
| Completion | `features/profile/completion.py` |

---

## 7. Learning path from ATS

### Why

Turn **missing/partial** ATS keywords into free YouTube study steps without inventing video IDs.

### How

```text
POST /learning-paths/generate
  require completed ATS analysis
  load ats_evidence rows
        │
  features/learning/service.py
    → run_learning_youtube_crew
       features/learning/agents/crew/orchestrator.py
          1) tool_extract_ats_gaps      (tools.py)  deterministic
          2) tool_plan_youtube_lessons  Groq or deterministic queries
          3) tool_validate_and_materialize
               YouTube Data API (youtube_api.py)
               or search-page URL fallback
        │
  persist learning_paths + learning_items + learning_resources
```

| File | Role |
|------|------|
| Route | `api/router.py` |
| Service | `features/learning/service.py` |
| Crew | `features/learning/agents/crew/orchestrator.py` |
| Tools | `features/learning/agents/crew/tools.py` |
| YouTube HTTP | `features/learning/youtube_api.py` |
| Version | `features/learning/youtube_catalog.py` |
| UI | `frontend/src/features/learning/components/learning.tsx` |

---

## 8. Mock interview

### Why

Practice with structured questions grounded in role/mode; store answers without AI hiring scores.

### How

```text
POST /interview-preparation   (optional)
  features/interview/preparation.py

POST /interviews
POST /interviews/{id}/start
  features/interview/agent/question_generator.py  (Groq)
  OR features/interview/question_bank.py          (templates)

POST .../responses
POST .../complete
  (no answer grading agent)
```

| File | Role |
|------|------|
| Routes | `api/router.py` |
| Prep | `features/interview/preparation.py` |
| LLM questions | `features/interview/agent/question_generator.py` |
| Templates | `features/interview/question_bank.py` |
| UI | `frontend/src/features/interview/components/*` |

---

## 9. Job recommendations

### Why

Rank local jobs using **confirmed resume evidence**, not free-form invented skills.

### How

```text
POST /job-recommendations/generate
  load active resume + confirmed version
  candidate_skill_evidence(...)   career_matching.py
    skills from resume sections + plain text
    profile skills only if also grounded in resume text
  for each job: score_job(...)
    requirements up to 80 pts + title hits up to 20
  store job_recommendations ranked
```

Optional catalog fill: `POST /jobs/external/sync` → `features/adzuna_api.py`.

| File | Role |
|------|------|
| Match | `features/career_matching.py` |
| Adzuna | `features/adzuna_api.py` |
| Routes | `api/router.py` |
| UI | `frontend/src/features/jobs/components/jobs.tsx` |

---

## 10. Resume improvement (API / crew)

### Why

Suggest rewrites that stay **evidence-checked** against source text hashes.

### How

```text
POST /resume-improvements
  features/resume_improvement/routes.py
  → resume_management/improvements.py
  → agents/crew: gap → improve → validate
PATCH /resume-suggestions/{id}   accept/reject/edit
POST .../apply
POST /resume-versions/{id}/exports
```

| File | Role |
|------|------|
| HTTP | `features/resume_improvement/routes.py` |
| Domain | `features/resume_management/*` |
| Crew | `features/resume_improvement/agents/crew/*` |
| Evidence | `features/resume_management/evidence.py` |

There is **no** full in-app post-ATS resume editor UI; primary product loop is re-upload.

---

## 11. Account deletion

```text
DELETE /account
  body: { confirmation_phrase: "DELETE MY ACCOUNT", email? }
  features/auth/account_deletion.py
    collect_user_storage_paths
    purge_user_storage
    delete USER_OWNED_TABLES then user/profile
```

| File | Role |
|------|------|
| Route | `api/router.py` |
| Logic | `features/auth/account_deletion.py` |
| UI | `frontend/src/features/settings/components/settings.tsx` |

---

## 12. Demo mode (frontend only)

```text
cookie career_copilot_demo=1
  shared/config.ts · features/auth/demo-session.ts
  apiRequest short-circuits → in-memory mocks
  FastAPI never called
```

---

## Cross-cutting: activity feed

Many mutations call:

```text
database/repository.py :: write_activity(...)
dashboard reads list_recent_activity / prune_activity_events
```

UI: `frontend/src/features/dashboard/components/dashboard.tsx` via `GET /me/bootstrap` and `/me/activity`.

---

## Cross-cutting: agent status

```text
GET /agents/status  → agents/registry.py :: list_agents / agents_status
GET /health         → includes agent/provider readiness fields
```

Use these at runtime instead of assuming keys are configured.
