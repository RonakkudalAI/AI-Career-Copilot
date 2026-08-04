# Career Copilot

**Version:** 1.0.0
**Type:** Full-stack monorepo — Next.js UI + FastAPI API + local SQLite

Career Copilot is a **private career workspace**. Candidates own their data locally, score resumes against job descriptions with **auditable evidence**, fill profiles from resumes, practice mock interviews, and generate learning/job recommendations from **owned evidence only**.

> **Golden rule:** Do not invent the candidate’s career.
> Only use what the user types, uploads, **confirms**, or explicitly accepts.
> **SQLite + local filesystem storage** is the system of record.

---

## Table of contents

1. [What this project does](#1-what-this-project-does)
2. [What is intentionally not shipped](#2-what-is-intentionally-not-shipped)
3. [Architecture (how it works)](#3-architecture-how-it-works)
4. [Repository layout](#4-repository-layout)
5. [Tech stack](#5-tech-stack)
6. [Models](#6-models)
7. [Agents](#7-agents)
8. [Feature-by-feature (what / why / how / files)](#8-feature-by-feature-what--why--how--files)
9. [End-to-end user journeys](#9-end-to-end-user-journeys)
10. [API map](#10-api-map)
11. [Frontend routes](#11-frontend-routes)
12. [Database & storage](#12-database--storage)
13. [Setup & environment](#13-setup--environment)
14. [Scripts & verification](#14-scripts--verification)
15. [Design choices & alternatives](#15-design-choices--alternatives)
16. [Testing](#16-testing)
17. [Folder ownership rules](#17-folder-ownership-rules)

---

## 1. What this project does

| Capability | Available in UI | Notes |
|------------|-----------------|--------|
| Sign up / sign in (email + password, local JWT) | Yes | Auth stubs for email delivery |
| Profile + completion checklist | Yes | Resume upload does **not** count toward % |
| Career preferences (dropdown multi-selects) | Yes | Saved via `PUT /profile/preferences` |
| Resume upload, parse, review, confirm | Yes | PDF/DOCX |
| Job description paste/upload, confirm | Yes | Required for ATS |
| ATS analysis (keywords + optional structured score + brief) | Yes | Report only; **no in-app resume editor** |
| Re-upload revised resume and re-score | Yes | Primary way to improve after ATS |
| Profile fill from resume (preview → apply) | Yes | Draft only until user applies |
| Mock interview questions | Yes | Groq or templates; **no AI grading** |
| Learning paths (list + generate from ATS gaps) | Yes | Evidence-grounded |
| Jobs browse / save + recommendations | Yes | Local jobs + keyword match |
| Account delete, privacy, notifications | Yes | Local wipe of owned data |
| In-app post-ATS resume editor | **No** | Removed from product |
| Resume AI improve UI | **No** | API/agents may still exist; **no UI** |
| Embedding / cosine ATS | **No** | Not used |

---

## 2. What is intentionally not shipped

| Non-goal | Reality in code |
|----------|-----------------|
| Brand logo image | Text brand only (“Career Copilot”) |
| In-app edit resume after ATS | Removed; report CTAs point to re-upload / new analysis |
| AI interview answer grading | Questions only |
| Browser-side AI keys | Keys only in root `.env` / FastAPI |
| Embeddings for ATS | Phrase/token rules + optional structured LLM score |
| Hosted multi-tenant DB | Local SQLite file |
| Working email verify/reset delivery | Local stubs return “not configured” |
| Python 3.14 | `requires-python = ">=3.11,<3.14"` |

---

## 3. Architecture (how it works)

```text
Browser (Next.js)
  frontend/src/app + frontend/src/features
  Token: localStorage career_copilot_access_token
         + cookie career_copilot_session
        │
        │  Browser → /api/backend/*  (Next proxy)
        │  Files   → /api/files/*    (Next proxy)
        ▼
FastAPI  backend/app/main.py
  Public prefix: /api/v1
  JWT HS256 (AUTH_SECRET) → CurrentUser
        │
        ├─► SQLite   DATABASE_PATH (default ./.data/career-copilot.sqlite)
        │     backend/app/database/client.py
        ├─► Files    LOCAL_STORAGE_DIR (documents / avatars / interview-media)
        └─► Optional LLMs (server-only)
              NVIDIA  → deepseek-3.2
              Groq    → llama-3.3-70b-versatile
```

### Typical authenticated request

1. UI: `frontend/src/shared/api/client.ts` → `fetch("/api/backend/...")` + `Authorization: Bearer …`
2. Proxy: `frontend/src/app/api/backend/[...path]/route.ts` → FastAPI
3. Auth: `backend/app/features/auth/service.py` validates JWT, loads user from `users`
4. Data: handlers in `backend/app/api/router.py` (+ feature routers) use `client_for` / ownership filters
5. Optional AI: providers under `backend/app/agents/providers/`
6. Errors: `backend/app/core/errors.py` (`ApiError` with stable codes)

---

## 4. Repository layout

```text
career-copilot_v1/
├── README.md                    # single project documentation entry
├── package.json                 # root orchestration scripts only
├── .env / .env.example
├── db/schema.sql                # SQLite schema (do not delete)
├── scripts/                     # setup, dev, diagnostics
├── frontend/                    # Next.js app
│   ├── package.json
│   ├── e2e/                     # Playwright landing checks
│   ├── public/jobs/             # globe texture (no brand logo)
│   └── src/
│       ├── app/                 # routes, layouts, proxies, globals.css
│       ├── features/            # domain UI modules
│       └── shared/              # api client, config, theme, primitives
└── backend/                     # career-copilot-api
    ├── pyproject.toml
    ├── tests/                   # pytest (ATS, interview, avatars, …)
    └── app/
        ├── main.py
        ├── core/                # config, constants, errors
        ├── api/                 # router.py, schemas.py (compat composition)
        ├── database/            # SQLite client, repository, activity
        ├── agents/              # registry, prompts, providers
        └── features/
            ├── auth/
            ├── profile/
            ├── document_parsing/
            ├── resume_management/
            ├── resume_improvement/   # API/agents only; no edit UI
            ├── ats/
            ├── interview/            # interview agent + preparation
            └── career_matching.py    # learning path + job recs
```

---

## 5. Tech stack

| Layer | Technology | Where |
|-------|------------|--------|
| UI | Next.js App Router, React, TypeScript | `frontend/` |
| Styling | Tailwind CSS, `globals.css` | `frontend/src/app/globals.css` |
| Icons / motion | Lucide, Motion | frontend deps |
| Globe | Three.js, React Three Fiber, Drei | `features/jobs/components/career-globe.tsx` |
| Fonts | Source Sans 3, Source Serif 4, Source Code Pro (`next/font`) | `frontend/src/app/layout.tsx` |
| API | FastAPI, Uvicorn | `backend/app/main.py` |
| Validation | Pydantic v2, pydantic-settings | `core/config.py`, `api/schemas.py` |
| HTTP to LLMs | httpx | `agents/providers/*` |
| Auth | PyJWT HS256 | `features/auth/service.py` |
| Parse/export | pypdf, python-docx, reportlab | `features/document_parsing/`, `resume_management/exports.py` |
| ATS structured LLM | langchain-openai + optional crewai | `features/ats/agent/` |
| DB | SQLite via custom fluent client | `database/client.py` |
| Schema | `db/schema.sql` | applied by setup/preflight |

---

## 6. Models

| Model id | Provider | Env keys | Used for |
|----------|----------|----------|----------|
| **`deepseek-3.2`** | NVIDIA Integrate `https://integrate.api.nvidia.com/v1` | `NVIDIA_API_KEY`, `NVIDIA_MODEL`, `NVIDIA_BASE_URL` | Resume-improvement API, profile-fill AI, preferred ATS brief; ATS structured scoring if `LLM_PROVIDER=nvidia` |
| **`llama-3.3-70b-versatile`** | Groq `https://api.groq.com/openai/v1` | `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_BASE_URL` | Interview questions; ATS brief if NVIDIA off; default structured ATS when `LLM_PROVIDER=groq` |

**Clients:**
- `backend/app/agents/providers/nvidia_client.py`
- `backend/app/agents/providers/groq_client.py`
- Shared JSON helpers: `agents/providers/common.py`
- JSON repair prompt: `agents/prompts/repair_structured_output_v1.txt`

**Provider rules (as coded):**

| Task | Provider |
|------|----------|
| Resume improve (API) | NVIDIA only |
| Profile fill AI | NVIDIA only (+ deterministic always) |
| Interview questions | Groq only (+ templates) |
| ATS brief | NVIDIA → Groq → deterministic text |
| Structured ATS crew LLM | `LLM_PROVIDER` = `groq` \| `nvidia` (default **groq**) |

**Not used:** embedding models, vector DBs, cosine similarity for ATS.

---

## 7. Agents

**Inventory:** `backend/app/agents/registry.py`
**Live status:** `GET /api/v1/agents/status`

### Product agents (5)

| id | Purpose | Provider | Prompt | Implementation | Product UI |
|----|---------|----------|--------|----------------|------------|
| `resume_improvement` | Evidence-checked rewrite suggestions | NVIDIA | `improve_resume_v1.txt` | `resume_management/improvements.py`, NVIDIA client | **No UI** (API only) |
| `resume_improvement_crew` | Sequential gap → improve → validate | NVIDIA + tools | improve + tools | `resume_improvement/agents/crew/*` | **No UI** (API only) |
| `profile_fill` | Profile draft from resume | NVIDIA + rules | `fill_profile_from_resume_v1.txt` | `profile/agent/pipeline.py` | Yes (settings preview/apply) |
| `interview_questions` | Mock interview questions | Groq | `interview_questions_v1.txt` | `features/interview/agent/question_generator.py` | Yes |
| `ats_improvement_brief` | Prose brief from ATS evidence | NVIDIA or Groq | `ats_improvement_v1.txt` | `ats/agents/improvement_brief.py` | Yes (on ATS report) |

### Resume improvement crew roles (API path only)

**File:** `backend/app/features/resume_improvement/agents/crew/orchestrator.py`

| Role | Tool | Behavior |
|------|------|----------|
| ATS Gap Analyst | `analyze_ats_gaps` | Deterministic from supplied ATS evidence |
| Resume Improvement Specialist | `generate_resume_suggestions` | NVIDIA only |
| Evidence Validator | `validate_suggestions` | Server-side `validation.py` |

### ATS structured scoring crew

**Files:** `features/ats/agent/agents.py`, `crew.py`, `scoring/service.py`

| Role | Job |
|------|-----|
| Resume Parsing Agent | → `ResumeParsed` |
| Job Description Parsing Agent | → `JDParsed` |
| Domain Gate Agent | ALLOW / REJECT |
| Resume Scoring Agent | Parameter scores + composite |

**Composite (structured path):**

```text
0.40*hard_skill_match + 0.25*experience_relevance
+ 0.15*education_match + 0.10*certifications_match
+ 0.10*seniority_alignment
```

Product analyses store algorithm version label: **`structured-llm-gated-v1`** (`api/router.py`).
If this crew fails, ATS still completes with deterministic phrase coverage.

### Safety / anti-hallucination (what the code actually does)

| Mechanism | Location |
|-----------|----------|
| Confirm resume/JD before ATS | `POST .../confirm`; ATS checks `extraction_status` |
| Deterministic phrase/alias matching | `ats/deterministic.py` (`deterministic-phrase-coverage-v2`) |
| Brief constrained to scored gaps | `ats/agents/improvement_brief.py` + prompt |
| Profile AI filtered against resume text | `profile/agent/pipeline.py` |
| Resume suggestion validators | `resume_management/validation.py` |
| Learning/job recs from owned evidence + known URLs | `features/career_matching.py` |
| No invented jobs in matcher | Scores only rows in local `jobs` table |

---

## 8. Feature-by-feature (what / why / how / files)

### 8.1 Authentication

| | |
|--|--|
| **What** | Register, sign in, session, sign out, password update |
| **Why** | Multi-user local ownership without external Auth SaaS |
| **How** | Password hash on `users`; JWT with `sub` = user id; browser stores token + cookie |
| **Backend** | `features/auth/service.py`; routes `/auth/*` in `api/router.py` |
| **Frontend** | `features/auth/components/auth-screen.tsx`, `features/auth/api/client.ts` |
| **Limits** | `/auth/resend`, `/auth/reset-password` return not-configured messages; OAuth stubbed |

### 8.2 Profile & completion

| | |
|--|--|
| **What** | Profile fields, skills, experience, education, links; 0–100 completion |
| **Why** | Show what is still empty without requiring a resume |
| **How** | Checklist in `features/profile/completion.py`; recalculated via repository helpers |
| **Frontend** | `features/settings/components/settings.tsx`, `features/profile/*` |
| **Weights** | name 10, location 8, role 10, target roles 8, experience/0 yrs 22, skills 17, education 10, work modes 5, preferred locations 5, link 5 |

### 8.3 Career preferences

| | |
|--|--|
| **What** | Target roles, industries, locations, work modes, employment types, salary, etc. |
| **How** | Multi-select **dropdowns + removable tags** (`MultiOptionGroup` in settings); `PUT /profile/preferences` |
| **Frontend** | `settings.tsx` |

### 8.4 Resume upload, parse, confirm

| | |
|--|--|
| **What** | Upload PDF/DOCX → extract text/sections → user review → confirm |
| **Why** | ATS must use confirmed text, not a raw unreviewed parse |
| **How** | Extract (`document_parsing/parsing/text_extract.py`), sections (`sections.py`), store under document bucket; `extraction_status` until confirm |
| **Frontend** | `features/resume/components/resume-flow.tsx` |
| **API** | `/resumes`, `/resumes/{id}/versions`, `/resume-versions/{id}/extraction`, `/confirm` |

### 8.5 Job descriptions

| | |
|--|--|
| **What** | Paste or upload JD → review → confirm |
| **API** | `/job-descriptions`, upload, extraction patch, confirm |
| **Frontend** | Resume analysis “new” flow in `resume-flow.tsx` |

### 8.6 ATS analysis

| | |
|--|--|
| **What** | Score confirmed resume vs confirmed JD; show gaps, optional structured breakdown, improvement inference |
| **Why** | Honest, auditable feedback without claiming hiring outcomes |
| **How** | 1) Always `score_resume` in `ats/deterministic.py` (**`deterministic-phrase-coverage-v2`**: phrases, aliases, required/preferred, section-aware evidence) 2) Try structured `score_resume_jd` 3) Persist `ats_analyses` + `ats_evidence` 4) `generate_ats_improvement_brief` |
| **API** | `POST /ats-analyses`, evidence, suggestions list; also `POST /ats/score` |
| **Frontend** | Report page via `resume-flow.tsx` — **view only** (no edit page) |
| **After ATS** | User re-uploads a revised resume and runs a new analysis |

### 8.7 Resume improvement (API only — no product editor)

| | |
|--|--|
| **What** | Backend can still run improve crew and export routes |
| **UI** | **Removed.** No `/resume-analysis/report/.../edit`, no `resume-edit.tsx` |
| **API** | `features/resume_improvement/routes.py`: capabilities, create run, suggestions, apply, exports |
| **Manual edit** | `POST .../manual-edit` **removed**; `manual_editing_available: false` |

### 8.8 Profile fill from resume

| | |
|--|--|
| **What** | Preview draft fields from a resume; apply selected pieces |
| **How** | Deterministic extract + optional NVIDIA + evidence filter; never auto-writes without apply |
| **Backend** | `profile/agent/*` |
| **API** | `/profile/from-resume/preview`, `preview-upload`, `apply` |

### 8.9 Mock interview

| | |
|--|--|
| **What** | Create session → start (generate questions) → answer → complete/delete |
| **How** | `generate_interview_questions` (Groq structured JSON or local templates) |
| **Backend** | Routes in `api/router.py`; agent `features/interview/agent/`; prompt `interview_questions_v1.txt` |
| **Frontend** | `features/interview/components/interview-flow.tsx` |
| **Not included** | AI scoring of answers |

### 8.10 Learning paths

| | |
|--|--|
| **What** | List paths; generate path from completed ATS missing requirements; track item progress |
| **How** | `POST /learning-paths/generate` uses ATS evidence + `build_learning_items` in `career_matching.py` (known doc URLs only — does not invent random links) |
| **Frontend** | `features/learning/` |

### 8.11 Jobs & recommendations

| | |
|--|--|
| **What** | Browse jobs, save jobs, generate recommendations vs resume/ATS evidence |
| **How** | `score_job` / `candidate_skill_evidence` in `career_matching.py` (`evidence-keyword-match-v1`); only scores existing `jobs` rows |
| **API** | `/jobs`, `/saved-jobs`, `/job-recommendations`, `POST /job-recommendations/generate` |
| **Frontend** | `features/jobs/` (+ globe) |

### 8.12 Dashboard, workspace, settings, account

| | |
|--|--|
| **Bootstrap** | `GET /me/bootstrap` — shell, completion, activity hooks |
| **Shell** | `features/workspace/components/workspace-shell.tsx` |
| **Dashboard** | `features/dashboard/` |
| **Settings** | profile / account / preferences / privacy |
| **Delete account** | `DELETE /account` → `features/auth/account_deletion.py` |

---

## 9. End-to-end user journeys

### A) First run

```text
Sign up  →  JWT stored
  → Settings / onboarding fill profile
  → Completion % updates (no resume required)
  → Optional: profile from resume (preview → apply selected fields)
```

### B) ATS (primary analysis loop)

```text
Upload resume PDF/DOCX
  → parse + section extract
  → review extraction
  → confirm version

Add job description (text or file)
  → confirm JD

POST /ats-analyses
  → deterministic phrase coverage (always)
  → optional structured LLM score (try)
  → evidence rows + improvement brief
  → UI report (score, gaps, inference)

To improve coverage:
  revise resume offline → re-upload → re-confirm → run new analysis
```

### C) Interview practice

```text
Create session → start
  → Groq questions or templates
  → typed answers → complete or delete
```

### D) Learning from ATS gaps

```text
Complete ATS analysis
  → POST /learning-paths/generate
  → items + resources from known gap terms
  → mark items complete in UI
```

### E) Jobs

```text
Browse /jobs (DB)
  → optional generate recommendations from evidence
  → save / update saved status
```

---

## 10. API map

**Base:** `{origin}/api/v1`
**App entry:** `backend/app/main.py`
**Main router:** `backend/app/api/router.py`
**ATS score router:** `backend/app/features/ats/routes.py` (`POST /ats/score`)
**Improve router (API only):** `backend/app/features/resume_improvement/routes.py`
**Docs:** `http://127.0.0.1:8000/docs` when `APP_ENV != production`

| Area | Paths |
|------|--------|
| Health | `GET /health`, `/health/database`, `/agents/status` |
| Auth | `/auth/sign-up`, `/sign-in`, `/session`, `/sign-out`, … |
| Me | `/me/bootstrap`, `/me/activity` |
| Profile | `/profile`, avatar, preferences, resources, from-resume |
| Resumes | `/resumes`, versions, confirm, preview, activate |
| JD / ATS | `/job-descriptions`, `/ats-analyses`, evidence |
| Improve API | `/resume-improvements/*`, exports (no edit UI) |
| Interviews | `/interviews`, start, responses, complete |
| Learning | `/learning-paths`, generate, item patch |
| Jobs | `/jobs`, `/saved-jobs`, `/job-recommendations` |
| Settings | `/settings/*`, `DELETE /account` |
| Files | `GET /files/{bucket}/{path}` |

---

## 11. Frontend routes

| Route area | Feature module |
|------------|----------------|
| `/` | `features/marketing` |
| `/sign-in`, `/sign-up`, … | `features/auth` |
| `/onboarding` | `features/onboarding` |
| `/dashboard` | `features/dashboard` |
| `/resume-analysis`, `/new`, `/review`, `/report/[id]` | `features/resume` (**no `/edit`**) |
| `/mock-interview/*` | `features/interview` |
| `/learning/*` | `features/learning` |
| `/jobs/*` | `features/jobs` |
| `/settings/*` | `features/settings` |

**Shared:** `shared/api/client.ts`, `shared/ui/primitives.tsx`, `shared/routes.ts`
**Typography:** Source Sans 3 (UI), Source Serif 4 (headings/brand), Source Code Pro (mono) in `app/layout.tsx` + `globals.css`.

---

## 12. Database & storage

| Item | Detail |
|------|--------|
| Schema | `db/schema.sql` |
| Engine | SQLite (`database/client.py`) |
| Default DB path | `./.data/career-copilot.sqlite` |
| Files | `LOCAL_STORAGE_DIR` + bucket names from env |
| Isolation | Application `user_id` filters + JWT (not Postgres RLS) |

Main table groups: `users`/`profiles`, candidate_* profile tables, `resumes`/`resume_versions`, `job_descriptions`, `ats_analyses`/`ats_evidence`, improvement tables, interview_*, learning_*, `jobs`/`saved_jobs`/`job_recommendations`, activity & prefs.

---

## 13. Setup & environment

### Prerequisites

- Node.js (LTS) + npm
- Python **3.11–3.13** (prefer 3.12; **not 3.14+**)
- No separate database server
- Optional NVIDIA and/or Groq API keys

### Run

```powershell
cd "D:\CDAC PROJECT\career-copilot_v1"
copy .env.example .env
# Set AUTH_SECRET; add API keys if you want AI paths

npm run setup
npm run dev
```

| Service | URL |
|---------|-----|
| Website | http://localhost:3000 |
| API | http://127.0.0.1:8000 |
| OpenAPI | http://127.0.0.1:8000/docs |

```powershell
npm run dev:frontend
npm run dev:backend
npm run db:setup
```

### `.env.example` (all keys used)

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
PUBLIC_API_BASE_URL=http://127.0.0.1:8000
FRONTEND_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
APP_NAME=Career Copilot API
APP_ENV=development
API_V1_PREFIX=/api/v1
LOG_LEVEL=INFO

DATABASE_PATH=./.data/career-copilot.sqlite
LOCAL_STORAGE_DIR=./.data/storage
AUTH_SECRET=replace-with-a-long-random-local-secret
DOCUMENT_BUCKET=candidate-documents
AVATAR_BUCKET=candidate-avatars
INTERVIEW_BUCKET=interview-media

DOCUMENT_MAX_BYTES=10485760
AVATAR_MAX_BYTES=3145728
INTERVIEW_MEDIA_MAX_BYTES=262144000
EXPORT_SIGNED_URL_SECONDS=300

LLM_PROVIDER=groq

NVIDIA_API_KEY=
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=deepseek-3.2
NVIDIA_TIMEOUT_SECONDS=90
NVIDIA_MAX_RETRIES=2
NVIDIA_MAX_OUTPUT_TOKENS=4096
NVIDIA_TEMPERATURE=0.2
NVIDIA_PROMPT_VERSION=resume-improvement-v1

GROQ_API_KEY=
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_TIMEOUT_SECONDS=45
GROQ_MAX_RETRIES=2
GROQ_MAX_OUTPUT_TOKENS=2048
GROQ_TEMPERATURE=0.4

IMPROVEMENT_MAX_SECTIONS=4
IMPROVEMENT_MAX_SOURCE_CHARS=30000
IMPROVEMENT_MAX_JD_CHARS=12000

# CAREER_COPILOT_PYTHON=C:\Path\To\Python312\python.exe
CAREER_COPILOT_RECREATE_VENV=0
CAREER_COPILOT_AUDIT_BASE=http://127.0.0.1:18004
```

Loaded by `backend/app/core/config.py` and `scripts/shared/load-env.mjs`.

Optional:

```powershell
cd backend
.\.venv\Scripts\activate
pip install -e ".[docling]"
pip install -e ".[crewai]"
```

---

## 14. Scripts & verification

| Command | Purpose |
|---------|---------|
| `npm run setup` | Frontend install + backend venv + schema |
| `npm run dev` | Preflight + API + Next |
| `npm run check:env` | Env presence |
| `npm run check:secrets` | Secret scan |
| `npm run check:boundaries` | Import boundaries |
| `npm run lint` / `typecheck` / `build:frontend` | Frontend quality |
| `npm run check:frontend` | lint + typecheck + vitest + production build |
| `npm run test:backend` | `backend/tests` (pytest) |
| `npm --prefix frontend test` | Vitest unit tests (jsdom) |
| `npm --prefix frontend run e2e` | Playwright E2E (requires server or webServer) |
| `npm --prefix frontend run validate:landing` | Chromium smoke for landing acceptance |

Runtime checks:

```text
GET /api/v1/health
GET /api/v1/agents/status
GET /api/v1/health/database
```

---

## 15. Design choices & alternatives

| Choice | Why | Alternative if redesigning |
|--------|-----|----------------------------|
| Local SQLite | Zero DB ops for local/demo | Postgres + ORM |
| JWT local auth | Offline multi-user | Clerk / Auth0 / Supabase Auth |
| Phrase coverage ATS | Explainable, alias-aware, offline | Pure LLM score only; embeddings (not for audit keyword truth) |
| Dual ATS (rules + optional structured) | Works when CrewAI/LLM fails | Single path only |
| No in-app resume editor | Product scope reduced; re-upload loop | Restore edit UI + manual-edit API |
| NVIDIA vs Groq split | Task isolation | Single provider |
| Evidence-only learning/jobs | No invented resources/jobs | Free-form LLM recommendations |
| Text brand + classic fonts | Clear, professional UI | Logo asset + other typefaces |

---

## 16. Testing

| Suite | Command | Scope |
|-------|---------|--------|
| Backend unit | `npm run test:backend` | ATS scoring, interview prep, avatar storage (`backend/tests/`) |
| Frontend unit | `npm --prefix frontend test` | Theme, globe lifecycle, ticker, parallax, landing a11y, globe fallbacks |
| Frontend quality gate | `npm run check:frontend` | ESLint + `tsc` + Vitest + `next build` |
| Landing E2E | `npm --prefix frontend run e2e:landing` | Multi-viewport, theme, labels, mobile nav |
| Env / secrets / boundaries | `npm run check:env`, `check:secrets`, `check:boundaries` | Config integrity |

**Notes**

- Vitest only collects `frontend/src/**/*.{test,spec}.{ts,tsx}` (Playwright lives under `frontend/e2e/`).
- Demo mode is a **client cookie** path (`career_copilot_demo=1`) with offline fixtures in `frontend/src/features/auth/demo-session.ts` — not production data.
- Local SQLite + uploads under `.data/` are **gitignored** and must not be committed.

---

## 17. Folder ownership rules

Restructuring keeps public URLs, FastAPI paths, contracts, auth, and storage configuration stable.

| Area | Owns | Must not own |
|------|------|--------------|
| `frontend/src/app` | Routes, layouts, proxies, global CSS | Domain business UI (prefer `features/`) |
| `frontend/src/features/*` | Domain UI modules (auth, resume, jobs, …) | Direct server secrets |
| `frontend/src/shared` | API client, config/theme, routes, primitives | Feature-specific screens |
| `backend/app/api` | Shared schemas + large compatibility router | Feature-private persistence details (prefer features) |
| `backend/app/features/*` | Feature logic, agents, validation | Cross-cutting config (use `core/`) |
| `backend/app/agents` | Providers, prompt files, registry | Feature product UI |
| `backend/app/database` | SQLite client, ownership helpers, activity | Provider HTTP |
| `scripts/` | Setup, dev orchestration, diagnostics | Application runtime imports |
| Root `.env` | Deploy/runtime secrets & ports | Committed secrets (use `.env.example` only) |

**Adding a feature:** smallest package under `backend/app/features` + UI under `frontend/src/features`; register routes without changing public paths; add focused tests first.
**Limitation:** `backend/app/api/router.py` remains the large cross-feature composition surface; future splits should be feature-by-feature with route-manifest comparison.

---

## Package identity

| Package | Version | Role |
|---------|---------|------|
| `career-copilot` (root npm) | 1.0.0 | Orchestration scripts |
| `career-copilot` (`frontend/`) | 1.0.0 | Next.js UI |
| `career-copilot-api` (Python) | 1.0.0 | FastAPI backend |

---

## Quick start

```powershell
copy .env.example .env
npm run setup
npm run dev
```

1. Open http://localhost:3000 and sign up
2. Complete profile (optional: fill from resume)
3. Upload & confirm resume + JD
4. Run ATS and read the report
5. Re-upload if you change the resume; re-score
6. Practice interview; generate learning path; browse jobs

**Agents live inventory:** `GET http://127.0.0.1:8000/api/v1/agents/status`

---

*This README is written from the current codebase only: feature packages under `backend/app/features`, no in-app resume editor, ATS phrase coverage v2 + structured LLM gate, career matching for learning/jobs, NVIDIA `deepseek-3.2`, Groq `llama-3.3-70b-versatile`, Source Sans/Serif/Code typography. Prefer `/agents/status` and `/health` at runtime over assumptions about API keys.*
