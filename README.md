# Career Copilot

**Version:** 1.0.0  
**Type:** Full-stack monorepo — Next.js frontend + FastAPI backend + local SQLite  
**Repo:** private career workspace for candidates

Career Copilot helps candidates manage profiles, parse resumes, score them against job descriptions with **auditable keyword evidence**, prepare for interviews, generate **YouTube learning paths** from ATS gaps, and browse **job recommendations** grounded in confirmed resume evidence.

> **Golden rule:** Do not invent the candidate’s career.  
> Only use what the user types, uploads, **confirms**, or explicitly accepts.  
> **Local SQLite + local filesystem** is the system of record. AI keys stay on the server.

---

## Table of contents

1. [What this project does](#1-what-this-project-does)
2. [What is intentionally not shipped](#2-what-is-intentionally-not-shipped)
3. [Architecture](#3-architecture)
4. [Repository layout](#4-repository-layout)
5. [Tech stack](#5-tech-stack)
6. [Models & providers](#6-models--providers)
7. [Agents](#7-agents)
8. [Feature-by-feature](#8-feature-by-feature)
9. [ATS scoring (how it works)](#9-ats-scoring-how-it-works)
10. [Document parsing](#10-document-parsing)
11. [Learning paths & YouTube](#11-learning-paths--youtube)
12. [End-to-end user journeys](#12-end-to-end-user-journeys)
13. [API map](#13-api-map)
14. [Frontend routes](#14-frontend-routes)
15. [Database & storage](#15-database--storage)
16. [Setup & environment](#16-setup--environment)
17. [Scripts & verification](#17-scripts--verification)
18. [Testing](#18-testing)
19. [Design principles](#19-design-principles)

---

## 1. What this project does

| Capability | UI | Notes |
|------------|----|--------|
| Sign up / sign in (email + password) | Yes | Local JWT auth (`AUTH_SECRET`) |
| Profile, avatar, completion checklist | Yes | Resume upload does **not** inflate completion % |
| Career preferences | Yes | Roles, locations, work modes, etc. |
| Resume upload, parse, review, confirm | Yes | PDF (Docling) / DOCX |
| Job description paste or upload + confirm | Yes | Required for ATS |
| **ATS keyword coverage score (0–100%)** | Yes | Single scoring module; exact resume quotes as evidence |
| ATS improvement brief | Yes | From missing keywords; no invented experience |
| Re-upload revised resume and re-score | Yes | Primary improvement loop after ATS |
| Profile fill from resume (preview → apply) | Yes | Draft until user applies |
| Mock interview sessions + questions | Yes | Groq or templates; **no AI grading** |
| Interview preparation from resume + JD | Yes | Evidence-grounded question packs |
| Learning paths from ATS gaps | Yes | Exact YouTube videos via Data API |
| Delete learning paths | Yes | Frontend + backend cascade delete |
| Jobs browse / save + recommendations | Yes | Local jobs + keyword match to resume |
| Account delete, privacy, notifications | Yes | Local wipe of owned data |
| Demo session (frontend offline demo) | Yes | `demo-session.ts` mocks key APIs |
| In-app post-ATS resume editor | **No** | Removed |
| Browser-side AI / YouTube keys | **No** | Server `.env` only |

---

## 2. What is intentionally not shipped

| Non-goal | Reality |
|----------|---------|
| Invented resume facts or skills | Blocked by design (evidence grounding) |
| Invented YouTube video IDs | Only YouTube Data API results or search-page fallback |
| In-app full resume editor after ATS | Removed; re-upload instead |
| AI interview scoring / hiring prediction | Questions + practice only |
| Embedding / cosine ATS | Not used |
| Hosted multi-tenant cloud DB | Local SQLite file |
| Working email verify/reset delivery | Stubs return “not configured” for local dev |
| Python 3.14+ as primary | `requires-python = ">=3.11,<3.14"` |

---

## 3. Architecture

```text
Browser (Next.js App Router)
  frontend/src/app + frontend/src/features
  Token: localStorage career_copilot_access_token
         + cookie career_copilot_session
        │
        ├─► /api/backend/*     Next.js proxy → FastAPI
        └─► /api/files/*       Next.js proxy → FastAPI file download
                │
                ▼
FastAPI  backend/app/main.py
  Prefix: /api/v1  (API_V1_PREFIX)
  Auth: JWT HS256 (AUTH_SECRET) → CurrentUser
        │
        ├─► SQLite     DATABASE_PATH (default ./.data/career-copilot.sqlite)
        │     backend/app/database/client.py  (Supabase-like query API over SQLite)
        ├─► Files      LOCAL_STORAGE_DIR
        │     buckets: candidate-documents, candidate-avatars, interview-media
        └─► Optional services (server-only keys)
              NVIDIA Integrate API  → structured LLM tasks
              Groq                  → interviews, learning planner, optional parse
              YouTube Data API v3   → exact learning-path videos
              Docling               → accurate PDF text extraction
```

### Authenticated request path

1. UI: `frontend/src/shared/api/client.ts` → `fetch` + `Authorization: Bearer …`
2. Proxy: `frontend/src/app/api/backend/[...path]/route.ts` → FastAPI origin
3. Auth: `backend/app/features/auth/service.py` validates JWT, loads `users` row
4. Handlers: `backend/app/api/router.py` (+ feature routers) enforce ownership
5. Optional AI / YouTube: `backend/app/agents/providers/`, `features/learning/youtube_api.py`
6. Errors: `backend/app/core/errors.py` (`ApiError` with stable codes)

---

## 4. Repository layout

```text
career-copilot_v1/
├── README.md                 # this file — project documentation
├── package.json              # root scripts (setup, dev, checks)
├── .env / .env.example       # single env file for UI + API
├── db/schema.sql             # SQLite schema (source of truth for tables)
├── scripts/
│   ├── setup/                # project, backend, local DB migrate
│   ├── dev/                  # preflight, frontend, backend, run
│   ├── diagnostics/          # env, secrets, e2e-smoke, DB checks
│   └── shared/               # load-env, ports
├── frontend/                 # Next.js app
│   ├── package.json
│   ├── e2e/                  # Playwright (landing)
│   ├── vitest.config.mts
│   ├── public/
│   └── src/
│       ├── app/              # routes, layouts, proxies, globals.css
│       ├── features/         # domain UI (auth, resume, interview, …)
│       ├── components/       # shared UI pieces (e.g. marketing globe)
│       └── shared/           # api client, config, theme, primitives
└── backend/                  # career-copilot-api (FastAPI)
    ├── pyproject.toml
    ├── tests/                # pytest (ATS, parsing, interview, learning, …)
    └── app/
        ├── main.py
        ├── core/             # config, constants, errors
        ├── api/              # router.py, schemas.py
        ├── database/         # SQLite client, repository, activity
        ├── agents/           # registry, prompts/, providers/
        └── features/
            ├── auth/
            ├── profile/
            ├── document_parsing/   # Docling + section segregation
            ├── resume_management/
            ├── resume_improvement/ # API/agents (no editor UI)
            ├── ats/                # ats_score.py = single scoring file
            ├── interview/
            ├── learning/           # YouTube crew + Data API
            └── career_matching.py  # job recommendation scoring helpers
```

---

## 5. Tech stack

| Layer | Technology | Location |
|-------|------------|----------|
| UI | Next.js (App Router), React, TypeScript | `frontend/` |
| Styling | CSS variables + Tailwind postcss | `frontend/src/app/globals.css` |
| Motion / 3D (marketing & jobs) | motion, three, @react-three/*, cobe | landing, globe |
| Icons | lucide-react | UI |
| API | FastAPI, Uvicorn, Pydantic v2 | `backend/` |
| Auth | PyJWT (HS256), local password hash | `features/auth` |
| DB | SQLite (custom query client) | `database/client.py` |
| Docs | pypdf, python-docx, **Docling** (PDF accuracy) | `document_parsing` |
| Export | reportlab, python-docx | resume exports |
| HTTP / LLM | httpx, OpenAI-compatible chat clients | NVIDIA, Groq |
| YouTube | YouTube Data API v3 | `learning/youtube_api.py` |
| Tests | pytest (backend), Vitest + Playwright (frontend) | `backend/tests`, `frontend` |

---

## 6. Models & providers

Configured in root `.env` (see `.env.example`).

| Provider | Typical model | Used for |
|----------|---------------|----------|
| **NVIDIA** Integrate API | `deepseek-3.2` (configurable) | Resume improvement, profile fill, section extract (primary), ATS brief |
| **Groq** | `llama-3.3-70b-versatile` | Interview questions, learning planner, ATS brief fallback, section extract on NVIDIA 429 |
| **Groq resume parser** | `openai/gpt-oss-120b` (+ fallback model) | Optional structured resume parsing settings |
| **YouTube Data API v3** | N/A (search) | Exact video IDs for learning paths |
| **Docling** | local library | PDF (and optional DOCX) text extraction |

`LLM_PROVIDER` selects default preference where applicable; individual agents may pin NVIDIA or Groq.

**Never** put secrets under `NEXT_PUBLIC_*`.

---

## 7. Agents

Registry: `backend/app/agents/registry.py`  
Status endpoint: `GET /api/v1/agents/status`

| ID | Name | Provider | Prompt | Fallback |
|----|------|----------|--------|----------|
| `resume_improvement` | Resume improvement | NVIDIA | `improve_resume_v1.txt` | Manual/export when not configured |
| `resume_improvement_crew` | Crew: gap → improve → validate | NVIDIA | improve + tools | Compatible orchestrator if CrewAI package missing |
| `profile_fill` | Profile from resume | NVIDIA | `fill_profile_from_resume_v1.txt` | Deterministic mapping |
| `interview_questions` | Mock interview questions | Groq | `interview_questions_v1.txt` | Local templates |
| `ats_improvement_brief` | ATS brief | NVIDIA or Groq | `ats_improvement_v1.txt` | Deterministic missing-keyword brief |
| `learning_youtube_crew` | Learning path YouTube crew | Groq + YouTube API | `learning_youtube_path_v1.txt` | Deterministic plan; search URL if API down |
| `document_section_extract` | Section segregation | NVIDIA or Groq | `document_section_extract_v1.txt` | Structural layout parser |

Prompts live in `backend/app/agents/prompts/`.

---

## 8. Feature-by-feature

### Auth
- **What:** Email/password sign-up, sign-in, session, sign-out; password update when signed in.
- **How:** JWT in `localStorage` + session cookie; FastAPI dependency `get_current_user`.
- **Files:** `features/auth/*`, `frontend/src/features/auth/*`, auth app routes.

### Profile & settings
- **What:** Profile fields, avatar, skills/experience/education/… CRUD, preferences, notifications, privacy, account delete.
- **How:** Tables under `candidate_*`, `profiles`, preference tables; completion recalculated from real rows.
- **Files:** `features/profile/*`, `frontend/src/features/settings/*`, `profile/*`.

### Document parsing (resumes & JDs)
- **What:** Extract text and segregate into **sections** for review/confirm.
- **How:** See [§10 Document parsing](#10-document-parsing).
- **UI:** Simple section list only (no source-block / “source evidence” clutter).

### Resume library & ATS analysis
- **What:** Upload resume versions, confirm extraction, create JD, run ATS, view report, delete analyses.
- **How:** Confirmed resume + JD → `score_resume` in `ats_score.py` → persist analysis + evidence rows.
- **Files:** `features/resume/components/resume-flow.tsx`, `features/ats/ats_score.py`, router ATS endpoints.

### Interview
- **What:** Create sessions, start (generate questions), answer, complete, delete; preparation pack from resume+JD.
- **How:** Groq structured questions or templates; preparation uses question bank + optional Groq.
- **Files:** `features/interview/*`, `frontend/src/features/interview/*`.

### Learning paths
- **What:** Generate path from **completed ATS** gaps; open exact YouTube videos; track progress; **delete path**.
- **How:** See [§11 Learning paths & YouTube](#11-learning-paths--youtube).
- **Files:** `features/learning/*`, `frontend/src/features/learning/components/learning.tsx`.

### Jobs
- **What:** List/save jobs; generate recommendations vs confirmed active resume evidence.
- **How:** `career_matching.score_job` / `candidate_skill_evidence`; stored in `job_recommendations`.
- **Files:** `features/career_matching.py`, `frontend/src/features/jobs/*`.

### Dashboard & workspace
- **What:** Bootstrap counts, latest ATS, recent activity, navigation shell.
- **Files:** `features/dashboard/*`, `features/workspace/*`.

### Marketing landing
- **What:** Product story, globe/illustrative roles, journey sections, a11y-minded nav.
- **Files:** `features/marketing/*`, Playwright e2e under `frontend/e2e/`.

---

## 9. ATS scoring (how it works)

**Single file to read and explain:**  
`backend/app/features/ats/ats_score.py`

(`deterministic.py` only re-exports this module for compatibility.)

### One-sentence explanation

We extract requirement phrases from the JD, look for each phrase (or a known alias) as a **whole word** in the resume text, quote the **exact resume line** when found, and score weighted coverage as a **percentage 0–100**.

### Algorithm

| Step | Function | Behavior |
|------|----------|----------|
| 1 | `_candidate_terms` | JD → list of (term, required\|preferred); required weight 2, preferred weight 1 |
| 2 | `_resume_lines` | Resume plain text and/or confirmed `structured_content.sections` → lines |
| 3 | `_find_match` | Whole-word match of term/aliases; strength strong / partial / missing |
| 4 | `score_resume` | strong = full credit, partial = half, missing = 0 → `%` of total weight |

### Evidence rules

- **Matched:** `resume_evidence_text` is an exact quote from the resume.  
- **Missing:** evidence is `null` — never invented.  
- Aliases (e.g. JS → JavaScript) only expand **search**; stored quote is still resume text.  
- Algorithm version: `evidence-keyword-coverage-v3`.

### What it is not

Not a hiring prediction, not an LLM composite score, not cross-candidate ranking.

### API usage

`POST /api/v1/ats-analyses` requires confirmed resume version + confirmed JD, runs `score_resume`, stores `ats_analyses` + `ats_evidence`, optional improvement brief.

---

## 10. Document parsing

**Goal:** Accurate text + clean **sections** for review (no source-block UI).

### Pipeline

1. **Text extract** — `document_parsing/parsing/text_extract.py`  
   - **PDF:** **Docling only** (layout-aware). Install:  
     `backend\.venv\Scripts\python.exe -m pip install "docling>=2.0,<3"`  
     or `pip install -e "backend/.[docling]"`  
   - **DOCX:** Docling preferred; native `python-docx` if Docling missing/fails.  
2. **Section segregation** — `parse_document_bytes` in `document_parsing/pipeline.py`  
   - LLM line-number assignment when NVIDIA/Groq configured (`document_section_extract_v1.txt`)  
   - Structural layout fallback when no LLM  
3. **Stored payload** (simple):  
   `{ schema_version, sections, warnings, extraction_method }`  
   No `source_blocks` / evidence-block maps in the product payload.

### Confirm flow

User reviews sections → `POST .../confirm` on resume version or JD → extraction_status `confirmed` → eligible for ATS.

---

## 11. Learning paths & YouTube

### Generation

`POST /api/v1/learning-paths/generate`

1. Load latest (or selected) **completed** ATS analysis + evidence  
2. **Gap analyst:** `not_found` / `partial_match` requirements only  
3. **Planner:** one study step per gap (Groq or deterministic) — search queries only, no video IDs  
4. **Validator + YouTube API:**  
   - `YOUTUBE_API_KEY` → YouTube Data API v3 search  
   - Store **exact** `https://www.youtube.com/watch?v=…` from API results  
   - If API unavailable: **search results URL only** (never fake watch IDs)  

### Delete

`DELETE /api/v1/learning-paths/{path_id}`  
UI: Delete on list cards and path detail page. Cascades items + resources in SQLite.

### Frontend

`/learning`, `/learning/[pathId]` — open videos, mark progress, delete path.

---

## 12. End-to-end user journeys

### A. ATS loop

1. Sign up → onboarding / profile  
2. Upload resume → review sections → confirm  
3. Paste/upload JD → confirm  
4. Run ATS → view % score + matches  
5. Re-upload improved resume → re-confirm → re-run ATS  

### B. Learning loop

1. Complete at least one ATS analysis  
2. Learning → Generate YouTube path from ATS  
3. Open path → watch exact videos → mark complete  
4. Delete path when no longer needed  

### C. Interview loop

1. Optional preparation (resume + JD)  
2. Create mock session → start → answer → complete  
3. Delete session if desired  

### D. Jobs loop

1. Confirm resume  
2. Generate job recommendations  
3. Save / unsave jobs  

---

## 13. API map

Base: **`/api/v1`** (unless `API_V1_PREFIX` overrides).

### Auth & health
| Method | Path |
|--------|------|
| POST | `/auth/sign-up`, `/auth/sign-in`, `/auth/session`, `/auth/sign-out` |
| POST | `/auth/resend`, `/auth/reset-password`, `/auth/update-password` |
| GET | `/health`, `/health/database`, `/agents/status` |
| GET | `/files/{bucket}/{path}` |

### Me / profile
| Method | Path |
|--------|------|
| GET | `/me/bootstrap`, `/me/activity` |
| GET/PATCH | `/profile` |
| POST/DELETE | `/profile/avatar` |
| PUT | `/profile/preferences` |
| POST | `/profile/skills/from-resume`, `/profile/from-resume/preview`, `/preview-upload`, `/apply` |
| GET/POST/PATCH/DELETE | `/profile/{resource}` … |

### Resumes & JDs
| Method | Path |
|--------|------|
| CRUD-ish | `/resumes`, `/resumes/{id}`, versions, confirm, activate, preview |
| CRUD-ish | `/job-descriptions`, upload, metadata, extraction, confirm |

### ATS
| Method | Path |
|--------|------|
| GET/POST/DELETE | `/ats-analyses` … |
| GET | `/ats-analyses/{id}/evidence`, `/suggestions` |

### Interview
| Method | Path |
|--------|------|
| POST | `/interview-preparation` |
| GET/POST/DELETE | `/interviews` … |
| POST | `.../start`, `.../responses`, `.../complete` |

### Learning
| Method | Path |
|--------|------|
| GET/POST/DELETE | `/learning-paths` … |
| POST | `/learning-paths/generate` |
| PATCH | `/learning-paths/{id}/items/{item_id}` |

### Jobs & settings
| Method | Path |
|--------|------|
| GET | `/jobs`, `/jobs/{id}` |
| GET/POST | `/job-recommendations`, `/job-recommendations/generate` |
| GET/POST/PATCH/DELETE | `/saved-jobs` … |
| GET/PUT | `/settings`, notifications, privacy |
| DELETE | `/account` |

Resume improvement routes are mounted under the same API router (`resume_improvement/routes.py`) for capabilities, runs, suggestions, apply, export.

---

## 14. Frontend routes

| Route | Purpose |
|-------|---------|
| `/` | Marketing landing |
| `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`, `/verify-email` | Auth |
| `/onboarding` | First-time profile |
| `/dashboard` | Workspace home |
| `/resume-analysis`, `/new`, `/review`, `/report/[id]` | Resume + ATS (no `/edit`) |
| `/mock-interview`, `/setup`, `/preparation`, `/session/[id]`, `/report/[id]` | Interviews |
| `/learning`, `/learning/[pathId]` | Learning paths |
| `/jobs`, `/jobs/saved`, `/jobs/[jobId]` | Jobs |
| `/settings/profile`, `/account`, `/preferences`, `/privacy` | Settings |
| `/api/backend/[...path]`, `/api/files/...` | Proxies |

Shared route constants: `frontend/src/shared/routes.ts`.

---

## 15. Database & storage

- **Schema:** `db/schema.sql`  
- **Engine:** SQLite file at `DATABASE_PATH`  
- **Client:** `backend/app/database/client.py` — table/select/eq/insert/update/delete style API, JSON columns, nested attach for selected joins  

### Main table groups

| Group | Tables |
|-------|--------|
| Identity | `users`, `profiles` |
| Profile content | `candidate_preferences`, `candidate_skills`, `candidate_experiences`, `candidate_projects`, `candidate_education`, … |
| Documents | `resumes`, `resume_versions`, `job_descriptions` |
| ATS | `ats_analyses`, `ats_evidence` |
| Improvements | `resume_improvement_runs`, `resume_suggestions`, `resume_exports` |
| Interview | `interview_sessions`, `interview_questions`, `interview_responses`, `interview_reports` |
| Learning | `learning_paths`, `learning_items`, `learning_resources` |
| Jobs | `jobs`, `job_recommendations`, `saved_jobs` |
| Settings / activity | `notification_preferences`, `privacy_preferences`, `activity_events`, … |

**Files:** under `LOCAL_STORAGE_DIR` buckets (`DOCUMENT_BUCKET`, `AVATAR_BUCKET`, `INTERVIEW_BUCKET`).

---

## 16. Setup & environment

### Prerequisites

- Node.js 20+ recommended  
- Python **3.11–3.13**  
- Windows-friendly scripts use `backend\.venv\Scripts\python.exe`

### Install

```bash
# From repo root
cp .env.example .env   # or copy manually on Windows
# Edit .env: AUTH_SECRET, optional API keys, YOUTUBE_API_KEY, etc.

npm run setup
# installs frontend deps, creates backend venv, installs package,
# prepares local DB from db/schema.sql
```

### Docling (required for accurate PDF resume parsing)

```bash
backend\.venv\Scripts\python.exe -m pip install "docling>=2.0,<3"
# or
backend\.venv\Scripts\python.exe -m pip install -e "backend/.[docling]"
```

### Run

```bash
npm run dev
# frontend ~ http://127.0.0.1:3000
# backend  ~ http://127.0.0.1:8000
# OpenAPI  ~ http://127.0.0.1:8000/docs
```

Or separately: `npm run dev:frontend` / `npm run dev:backend`.

### Important env vars (see `.env.example`)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_API_BASE_URL` / `PUBLIC_API_BASE_URL` | API origin |
| `FRONTEND_ORIGINS` | CORS |
| `DATABASE_PATH`, `LOCAL_STORAGE_DIR` | Local persistence |
| `AUTH_SECRET` | JWT signing |
| `NVIDIA_*` | NVIDIA LLM |
| `GROQ_*` / `GROQ_RESUME_PARSER_*` | Groq LLM / parser |
| `YOUTUBE_API_KEY`, `YOUTUBE_*` | Exact learning videos |
| `DOCUMENT_*`, `AVATAR_*`, `INTERVIEW_*` buckets & size limits |

---

## 17. Scripts & verification

| Script | Purpose |
|--------|---------|
| `npm run setup` | Full project install |
| `npm run dev` | Preflight + frontend + backend |
| `npm run check:env` | Required env presence (no secret dump) |
| `npm run check:secrets` | Scan for committed credential patterns |
| `npm run check:boundaries` | Import boundary checks |
| `npm run lint` / `typecheck` / `build:frontend` | Frontend quality |
| `npm run check:frontend` | lint + typecheck + test + build |
| `npm run test:backend` | `pytest backend/tests` |
| `scripts/diagnostics/e2e-smoke.py` | API workflow smoke |
| `frontend` `npm run test` | Vitest |
| `frontend` `npm run e2e` / `e2e:landing` | Playwright |

---

## 18. Testing

| Area | Location |
|------|----------|
| ATS keyword scoring | `backend/tests/ats_scoring/` |
| Document parsing / sections | `backend/tests/document_parsing/` |
| Interview preparation | `backend/tests/interview/` |
| Learning YouTube crew | `backend/tests/learning/` |
| Avatars | `backend/tests/test_avatar_storage.py` |
| Resume fixtures | `backend/tests/fixtures/resumes/` |
| Frontend unit | `frontend/src/**/__tests__`, Vitest |
| Landing e2e | `frontend/e2e/landing.spec.ts` |

```bash
npm run test:backend
cd frontend && npm run test
```

---

## 19. Design principles

1. **Evidence over invention** — resume/JD text and confirmations are the source of truth.  
2. **Local ownership** — candidate data lives in local SQLite + files.  
3. **Server-side secrets** — NVIDIA, Groq, YouTube keys never in the browser.  
4. **Explainable ATS** — one scoring file (`ats_score.py`), percentage coverage, exact quotes.  
5. **Simple parse UI** — sections only; Docling for PDF accuracy.  
6. **YouTube without hallucination** — video IDs only from YouTube API (or search page fallback).  
7. **Delete what you create** — resumes, ATS, interviews, learning paths, account.  

---

## Quick reference: “where do I look?”

| Question | Answer |
|----------|--------|
| How is ATS scored? | `backend/app/features/ats/ats_score.py` |
| How are PDFs parsed? | `document_parsing/parsing/text_extract.py` (Docling) + `pipeline.py` |
| How are learning videos chosen? | `learning/youtube_api.py` + crew in `learning/agents/crew/` |
| Where are routes? | `backend/app/api/router.py`, `frontend/src/app/` |
| Where is schema? | `db/schema.sql` |
| Where is env template? | `.env.example` |
| Agent inventory? | `GET /api/v1/agents/status` or `agents/registry.py` |

---

*This README matches the current codebase: local SQLite career workspace, Docling-based PDF extraction, keyword ATS scoring in a single module, YouTube Data API learning paths, mock interviews, profile/jobs/settings, and no in-app post-ATS resume editor. Prefer `/health` and `/agents/status` at runtime over assumptions about which keys are configured.*
