# Career Copilot

**Career Copilot** is an evidence-led career preparation workspace. Candidates upload real resumes and job descriptions, receive **deterministic ATS keyword coverage scores**, optionally improve the **same resume in place**, fill their profile from confirmed resume text, practice mock interviews, and manage learning/jobs/settings—all backed by **Supabase Auth + PostgreSQL + private Storage** and a **FastAPI** backend. The UI does **not** invent candidate experience or use browser local storage as system of record.

---

## Table of contents

1. [Product overview](#1-product-overview)
2. [What has been built (end-to-end)](#2-what-has-been-built-end-to-end)
3. [Tech stack & frameworks](#3-tech-stack--frameworks)
4. [Architecture](#4-architecture)
5. [Project layout](#5-project-layout)
6. [AI agents (all of them)](#6-ai-agents-all-of-them)
7. [ATS scoring formula](#7-ats-scoring-formula)
8. [Resume edit & improvement flow](#8-resume-edit--improvement-flow)
9. [Data model (Supabase)](#9-data-model-supabase)
10. [API surface](#10-api-surface)
11. [Frontend modules & routes](#11-frontend-modules--routes)
12. [Configuration (root `.env` only)](#12-configuration-root-env-only)
13. [Setup & run](#13-setup--run)
14. [Security & privacy principles](#14-security--privacy-principles)
15. [Debugging & health checks](#15-debugging--health-checks)
16. [Known non-goals / boundaries](#16-known-non-goals--boundaries)

---

## 1. Product overview

| Area | Capability |
|------|------------|
| **Auth** | Supabase email/password + OAuth hooks; session JWT for API |
| **Onboarding** | Profile completion, name prefill from auth metadata |
| **Profile** | CRUD for profile fields, skills/experience/projects/education/certs/languages/links; avatar ≤ 3 MB; fill-from-resume (rules + AI) |
| **Resumes** | Upload PDF/DOCX, extract structure, confirm extraction, library list, **PDF preview in modal** |
| **Job descriptions** | Paste text or upload file, confirm extraction |
| **ATS analysis** | Deterministic keyword coverage score, missing keywords, AI/deterministic improvement brief |
| **Resume improve** | Edit **existing** resume in place; missing-keyword chips; evidence-checked AI suggestions; export PDF/DOCX; re-score |
| **Mock interview** | Create session, generate questions (Groq), answer, complete/delete sessions |
| **Learning / jobs** | Paths and job browse/save from persisted tables only |
| **Settings** | Profile, preferences, privacy, account deletion |
| **Dashboard** | Bootstrap from live counts and latest actions |

**Design principle:** truth and evidence over generative fabrication. AI may rephrase or suggest only when grounded in confirmed resume blocks / explicit user actions.

---

## 2. What has been built (end-to-end)

This section documents major capabilities delivered in the current codebase (including recent work).

### 2.1 Core platform

- Next.js App Router frontend with workspace shell, marketing landing, auth screens, onboarding.
- FastAPI backend under `/api/v1` with CORS, request IDs, structured `ApiError` responses.
- Supabase Auth validation on protected routes; user-scoped PostgREST/Storage via JWT.
- Single root `.env` for frontend public vars and backend secrets.
- npm scripts to install JS deps, create `backend/.venv`, and run both services (`npm run dev`).

### 2.2 Documents & parsing

- Resume/JD upload validation (size, MIME, PDF/DOCX).
- Text extraction (`pypdf` / `python-docx`; optional **Docling** extra).
- Section classification into structured content (`summary`, `skills`, `experience`, `projects`, … + `unclassified_blocks`).
- Extraction review → **confirm** before ATS/improvements use a version.

### 2.3 ATS analysis

- Create analysis from confirmed resume version + confirmed JD.
- Score with algorithm `deterministic-keyword-coverage-v1` (see [§7](#7-ats-scoring-formula)).
- Persist `ats_analyses` + `ats_evidence`.
- UI report: overall score, missing keywords, overall improvement inference (no fake “matched evidence” dump).
- Delete analyses; activity events.

### 2.4 Post-ATS resume editing (Resume-Matcher-inspired, project-native)

- Route: `/resume-analysis/report/[reportId]/edit`.
- Loads **the same** resume version used for the analysis.
- Entry-level section editor + live paper preview (only real structured content).
- Missing ATS keywords as clickable chips → Skills **only if user confirms**.
- **Save in place** (`apply_mode: "in_place"`): updates same `resume_versions` row / same `resume_id`—does **not** create a hollow “new resume”.
- Optional AI suggestions → accept / edit / reject → apply **in place**.
- Export PDF/DOCX from structured content; re-run ATS on the same version.
- Version comparison API available for before/after blocks.

### 2.5 Resume library preview

- Resumes tab → **Preview** opens a **modal** with embedded PDF.
- Original PDF used when the stored file is PDF and content was not edited.
- After in-place edits, or for DOCX, preview uses exported/rendered PDF from current structured content.
- No parsed-section dump in the preview modal.

### 2.6 Profile fill from resume

- Deterministic extraction from plain text + structured sections.
- Optional NVIDIA structured extract merged with rules (`profile_fill` agent).
- Preview then apply into profile child tables with candidate confirmation.

### 2.7 Mock interview

- Session CRUD; start generates questions via **Groq** agent (template fallback if Groq fails/unavailable).
- NVIDIA is **not** used as interview fallback.
- UI surfaces whether questions came from Groq or templates.
- Responses, complete, permanent delete (cascades + media cleanup).

### 2.8 Agents registry & reliability

- Central registry: `backend/app/agents/registry.py`.
- Endpoints: `GET /api/v1/agents/status`, agent counts on `GET /api/v1/health`, capabilities on resume-improvements + bootstrap.
- Shared LLM helpers: markdown fence stripping, multi-part content, repair pass (`repair_structured_output_v1.txt`) for NVIDIA and Groq.

### 2.9 Avatars, activity, account

- Avatar upload to private bucket (3 MB limit aligned with migration).
- Activity feed with retention cleanup.
- Account deletion purge (DB + storage paths).

### 2.10 Housekeeping (repo hygiene)

- Test suites / Vitest / Playwright configs removed for a lean production tree.
- Caches (`.next`, `__pycache__`, ruff caches) cleaned; `.gitignore` covers temp artifacts.
- README + `backend/README.md` document layout for future debugging.

---

## 3. Tech stack & frameworks

### 3.1 Frontend

| Technology | Role |
|------------|------|
| **Next.js** (App Router) | SSR/CSR app, routes, layouts |
| **React** + **React DOM** | UI |
| **TypeScript** | Typed frontend |
| **Tailwind CSS** (+ PostCSS) | Styling |
| **Motion** | Page transitions / animation |
| **Lucide React** | Icons |
| **Three.js** + **@react-three/fiber** + **@react-three/drei** | Marketing 3D globe |
| **@fontsource** (Space Grotesk, IBM Plex Mono) | Typography |
| **@supabase/supabase-js** + **@supabase/ssr** | Auth session, browser/server Supabase clients |
| **ESLint** + **eslint-config-next** | Lint |
| **Node.js scripts** (`scripts/*.mjs`) | Dev orchestration, env verify, secrets check |

### 3.2 Backend

| Technology | Role |
|------------|------|
| **Python 3.11+** | Runtime |
| **FastAPI** | REST API |
| **Uvicorn** | ASGI server |
| **Pydantic v2** + **pydantic-settings** | Schemas + env settings |
| **httpx** | Outbound LLM HTTP |
| **supabase** (Python client) | PostgREST + Storage |
| **PyJWT[crypto]** | Token-related crypto support |
| **python-multipart** | File uploads |
| **pypdf** | PDF text extract |
| **python-docx** | DOCX read + write |
| **reportlab** | PDF export render |
| **Docling** (optional extra) | Layout-aware extraction if installed |

### 3.3 Data & auth platform

| Technology | Role |
|------------|------|
| **Supabase Auth** | Users, sessions, JWT |
| **PostgreSQL** (via Supabase) | All persistent application data |
| **Supabase Storage** | Private files (resumes, avatars, interview media, exports) |
| **SQL migrations** under `supabase/migrations/` | Schema, RLS, buckets, grants |

### 3.4 AI / LLM providers

| Provider | SDK style | Used for |
|----------|-----------|----------|
| **NVIDIA Integrate API** (`integrate.api.nvidia.com`) | OpenAI-compatible chat/completions | Resume improve, profile fill AI, preferred ATS brief |
| **Groq API** (`api.groq.com`) | OpenAI-compatible chat/completions | Interview questions; ATS brief if NVIDIA unavailable |

Providers are **separate** (no “use Groq when NVIDIA resume-improve fails” and no NVIDIA fallback for interviews).

### 3.5 Tooling / package management

| Tool | Role |
|------|------|
| **npm** | Frontend deps + monorepo scripts |
| **pip / setuptools** (`backend/pyproject.toml`) | Backend package `career-copilot-api` in local `.venv` |
| **Supabase CLI** (optional devDependency) | Local/remote migration workflows |

---

## 4. Architecture

```text
┌─────────────────────┐     JWT + REST      ┌──────────────────────┐
│  Next.js (browser)  │ ──────────────────► │  FastAPI /api/v1     │
│  Supabase Auth JS   │                     │  app.main            │
└─────────┬───────────┘                     └──────────┬───────────┘
          │ Auth                                        │
          ▼                                             ▼
┌─────────────────────┐                     ┌──────────────────────┐
│  Supabase Auth      │                     │  User Supabase client│
└─────────────────────┘                     │  (publishable + JWT) │
                                            └──────────┬───────────┘
                                                       │
                       ┌───────────────────────────────┼───────────────────────────────┐
                       ▼                               ▼                               ▼
              PostgreSQL (RLS)                 Storage buckets                  LLM APIs
              tables + policies                documents/avatars/media          NVIDIA / Groq
```

**Data flow rules**

1. Browser never holds long-lived service-role secrets.
2. API authenticates with `Authorization: Bearer <user_access_token>`.
3. Row access is user-scoped (`user_id` + RLS); storage paths prefix with `auth.uid()`.
4. AI calls run only on the server with server-side API keys.

---

## 5. Project layout

```text
career-copilot_v1/
├── .env                          # Untracked: all runtime config
├── package.json                  # Frontend + scripts (dev, check, build)
├── scripts/
│   ├── dev.mjs                   # Start API + Next together
│   ├── setup-backend.mjs         # Create .venv, pip install -e backend
│   ├── verify-environment.mjs    # Env presence/consistency checks
│   └── check-secrets.mjs         # Scan for leaked secrets
├── public/                       # Static assets / brand
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── (marketing)/          # Landing
│   │   ├── (auth)/               # Sign-in/up, password flows
│   │   ├── (onboarding)/         # Onboarding
│   │   ├── (workspace)/          # Authenticated product
│   │   └── auth/                 # OAuth callback / confirm routes
│   ├── components/               # Shared UI primitives, shell
│   ├── features/                 # Domain UI (resume, interview, …)
│   ├── lib/                      # api client, supabase, utils, routes
│   └── types/                    # Shared TS types
├── backend/
│   ├── pyproject.toml
│   ├── README.md
│   └── app/                      # Import root: `app.*`
│       ├── main.py
│       ├── config.py
│       ├── routes.py
│       ├── resume_improvement_routes.py
│       ├── schemas.py
│       ├── supabase_clients.py
│       ├── repository.py
│       ├── ats.py
│       ├── agents/               # AI agents + prompts + LLM clients
│       ├── parsing/              # Text + section extraction
│       └── …                     # Domain services
└── supabase/
    └── migrations/               # PostgreSQL + storage + RLS
```

Production Python modules stay under `backend/app/` with stable import paths (`app.routes`, `app.agents…`) so the project does not break when cleaning non-runtime folders.

---

## 6. AI agents (all of them)

**Registry source of truth:** `backend/app/agents/registry.py`  
**Status API:** `GET /api/v1/agents/status` (no secrets)  
**Helper prompt (not a product agent):** `repair_structured_output_v1.txt` — used when model JSON is invalid.

### 6.1 Product agents

| ID | Name | Provider | Prompt file | Primary endpoint / trigger | Purpose | Fallback |
|----|------|----------|-------------|----------------------------|---------|----------|
| `resume_improvement` | Resume improvement | **NVIDIA** (via crew) | `improve_resume_v1.txt` | `POST /resume-improvements` | Suggest rewrites of **existing** confirmed blocks; evidence-validated | Manual edit + export |
| `resume_improvement_crew` | Resume improvement crew | **CrewAI-compatible** + NVIDIA | crew tools + `improve_resume_v1.txt` | Same endpoint (orchestration layer) | Sequential: gap analyst → improver → validator | Compatible orchestrator if official package unavailable |
| `profile_fill` | Profile fill from resume | **NVIDIA** (+ rules) | `fill_profile_from_resume_v1.txt` | `POST /profile/from-resume/preview` (+ apply) | Extract profile fields from resume text/sections | Deterministic mapping always runs |
| `interview_questions` | Interview question generation | **Groq only** | `interview_questions_v1.txt` | `POST /interviews/{id}/start` | Generate practice questions for mode/role/count | Local templates (never NVIDIA) |
| `ats_improvement_brief` | ATS improvement brief | **NVIDIA → Groq → rules** | `ats_improvement_v1.txt` | Inside `POST /ats-analyses` → `summary.overall_inference` | Explain missing keywords only; no inventing experience | Deterministic missing-term paragraph |

### 6.2 CrewAI multi-agent orchestration

**Yes — multi-agent “crew” orchestration is implemented** under `backend/app/agents/crew/`.

| Crew role | Tool | What it may do |
|-----------|------|----------------|
| ATS Gap Analyst | `analyze_ats_gaps` | Read **only** supplied ATS evidence; list missing keywords already scored |
| Resume Improvement Specialist | `generate_resume_suggestions` | Call existing **NVIDIA** resume improver on confirmed blocks |
| Evidence Validator | `validate_suggestions` | Drop anything that fails evidence validation (numbers, entities, contact, etc.) |

**Process:** sequential (CrewAI-style).  
**Truth rule:** tools never invent employers, metrics, or skills. Free-form multi-agent “role-play inventing a resume” is intentionally **not** used.

**Official `crewai` package constraint:** PyPI `crewai` currently requires **Python ≥3.10 and &lt;3.14**. This machine’s backend venv is **Python 3.14.x**, so the official package **cannot install**. Career Copilot therefore uses a **CrewAI-compatible sequential orchestrator** that always runs. On Python 3.12/3.13 you may optionally install:

```powershell
cd backend
# only if python -c "import sys; print(sys.version_info < (3,14))" is True
pip install -e ".[crewai]"
```

Status fields: `GET /api/v1/agents/status` → `runtime` (`compatible_orchestrator` | `official_crewai`), `official_crewai_package`, crew agent/task list. Improvement API responses include a `crew` audit block (task statuses).

### 6.3 LLM clients

| Client | Module | Notes |
|--------|--------|-------|
| `NvidiaClient` | `agents/llm/nvidia_client.py` | `generate()` for resume suggestions; `generate_structured()` for JSON schemas; repair pass |
| `GroqClient` | `agents/llm/groq_client.py` | `generate_structured()` + repair pass |
| Shared helpers | `agents/llm/common.py` | Fence strip, content extract, error snippets |
| Crew orchestrator | `agents/crew/orchestrator.py` | Sequential multi-agent process for resume improve |

### 6.4 Truthfulness rules (agents)

- Do **not** invent employers, titles, metrics, skills, education, or contact data.
- Resume improvements must cite evidence block IDs; validator blocks unsupported numbers/entities/contact changes.
- ATS brief may only discuss provided **missing_keywords**.
- Profile AI output is merged with deterministic extract and normalized before preview/apply.
- Keyword chips add skills only when the **user** clicks (truth-gated).
- Crew tools only wrap existing validated pipelines — no unconstrained LLM “creative crew” rewriting the whole resume.

---

## 7. ATS scoring formula

**Algorithm:** `deterministic-keyword-coverage-v1` (`backend/app/ats.py`)

This is **exact keyword coverage**, not a hiring prediction and not semantic embedding fit.

### Formula

\[
\text{overall\_score} = \mathrm{round}\left(\frac{\text{matched\_count}}{\text{total\_scored\_terms}} \times 100,\ 2\right)
\]

Each term’s equal contribution:

\[
\text{score\_contribution} = \mathrm{round}\left(\frac{100}{\text{total\_scored\_terms}},\ 4\right)
\quad\text{(0 if missing)}
\]

### How terms are chosen from the JD

1. Tokenize with `[a-zA-Z][a-zA-Z0-9+#\.]*`
2. Casefold
3. Drop stop words (`experience`, `required`, `skills`, …)
4. Keep length ≥ 3 or short tech allowlist: `ai`, `bi`, `go`, `ml`, `r`, `ui`, `ux`
5. Rank by frequency, then first appearance
6. Take top **50** unique tokens → scored set

### Match rule

Normalized token from JD is **exactly present** in the resume token set (same tokenizer). No synonyms/stemming beyond casefold.

### What does *not* affect the score

- LLM brief quality  
- Section weights  
- Years of experience  
- Soft “fit” narratives  

---

## 8. Resume edit & improvement flow

```text
Upload resume → Review extraction → Confirm version
     +
Paste/upload JD → Confirm
     ↓
POST /ats-analyses → score + brief → Report UI
     ↓
Edit resume (/report/{id}/edit)
     ├─ Manual entry edits (existing sections/header)
     ├─ Add missing keywords only if true
     ├─ Save → POST .../manual-edit { apply_mode: "in_place" }
     ├─ Optional AI → POST /resume-improvements → accept/edit → apply in_place
     ├─ Export PDF/DOCX
     └─ Re-run ATS on same resume_version_id
```

**In-place semantics**

- Same `resumes.id` and same `resume_versions.id` by default.
- `structured_content` + `plain_text` updated; original upload identity retained where possible.
- Merge preserves unclassified header blocks and sections the editor did not open.
- Optional `apply_mode: "new_version"` still exists for history snapshots (opt-in).

**Inspired by [Resume-Matcher](https://github.com/srbhr/Resume-Matcher) patterns** (score → keywords → edit → AI review → export → re-check) **without cloning that monorepo** (no multi-template canvas / cover-letter product fork).

---

## 9. Data model (Supabase)

Migrations (apply in order):

| File | Purpose |
|------|---------|
| `20260729180000_initial_career_copilot.sql` | Core tables, RLS, storage buckets |
| `20260730002000_grant_api_roles.sql` | API role grants |
| `20260730020000_resume_improvements.sql` | Improvement runs, suggestions columns, `change_metadata` |
| `20260730120000_activity_events_retention.sql` | Activity retention support |
| `20260730140000_avatar_3mb_limit.sql` | Avatar bucket 3 MB |

### Main tables (groups)

| Group | Tables |
|-------|--------|
| Profile | `profiles`, `candidate_preferences`, `candidate_skills`, `candidate_experiences`, `candidate_projects`, `candidate_education`, `candidate_certifications`, `candidate_languages`, `candidate_links` |
| Resume / JD / ATS | `resumes`, `resume_versions`, `job_descriptions`, `ats_analyses`, `ats_evidence` |
| Improve / export | `resume_improvement_runs`, `resume_suggestions`, `resume_exports` |
| Interview | `interview_sessions`, `interview_questions`, `interview_responses`, `interview_reports` |
| Learning / jobs | `learning_paths`, `learning_items`, `learning_resources`, `jobs`, `job_recommendations`, `saved_jobs` |
| Settings / ops | `notification_preferences`, `privacy_preferences`, `activity_events`, `user_notifications` |

### Storage buckets (private)

| Bucket | Use |
|--------|-----|
| `candidate-documents` | Resume/JD originals, version files, exports |
| `candidate-avatars` | Profile pictures (≤ 3 MB) |
| `interview-media` | Interview audio/video if enabled |

---

## 10. API surface

Base path: **`/api/v1`** (configurable via `API_V1_PREFIX`).

### Health & agents

| Method | Path | Notes |
|--------|------|-------|
| GET | `/health` | Service ok + supabase/nvidia/groq flags + agent counts |
| GET | `/health/supabase` | Admin probe against `profiles` |
| GET | `/agents/status` | Full agent inventory |

### Session bootstrap

| Method | Path |
|--------|------|
| GET | `/me/bootstrap` |
| GET | `/me/activity` |

### Profile

| Method | Path |
|--------|------|
| GET/PATCH | `/profile` |
| POST/DELETE | `/profile/avatar` |
| PUT | `/profile/preferences` |
| POST | `/profile/skills/from-resume` |
| POST | `/profile/from-resume/preview` |
| POST | `/profile/from-resume/preview-upload` |
| POST | `/profile/from-resume/apply` |
| CRUD | `/profile/{resource}` … |

### Resumes & versions

| Method | Path |
|--------|------|
| GET/POST | `/resumes` |
| GET/PATCH/DELETE | `/resumes/{id}` |
| GET | `/resumes/{id}/preview` |
| POST | `/resumes/{id}/activate` |
| POST | `/resumes/{id}/versions` |
| GET | `/resume-versions/{id}` |
| PATCH | `/resume-versions/{id}/extraction` |
| POST | `/resume-versions/{id}/confirm` |
| POST | `/resume-versions/{id}/manual-edit` |
| POST | `/resume-versions/{id}/exports` |
| GET | `/resume-exports/{id}/download` |
| GET | `/resume-comparisons` |

### Resume improvements

| Method | Path |
|--------|------|
| GET | `/resume-improvements/capabilities` |
| POST | `/resume-improvements` |
| GET | `/resume-improvements/{run_id}` |
| GET | `/resume-improvements/{run_id}/suggestions` |
| PATCH | `/resume-suggestions/{id}` |
| POST | `/resume-improvements/{run_id}/apply` |

### Job descriptions & ATS

| Method | Path |
|--------|------|
| GET/POST | `/job-descriptions` |
| POST | `/job-descriptions/upload` |
| GET/PATCH/confirm | `/job-descriptions/{id}…` |
| GET/POST/DELETE | `/ats-analyses` … |
| GET | `/ats-analyses/{id}/evidence` |
| GET | `/ats-analyses/{id}/suggestions` |

### Interview, learning, jobs, settings

| Method | Path |
|--------|------|
| CRUD-ish | `/interviews`, `/interviews/{id}/start|responses|complete` |
| | `/learning-paths` … |
| | `/jobs`, `/saved-jobs` … |
| | `/settings`, notifications, privacy |
| DELETE | `/account` |

Interactive docs (non-production): `http://127.0.0.1:8000/docs`.

---

## 11. Frontend modules & routes

### Feature modules (`src/features/`)

| Module | Responsibility |
|--------|----------------|
| `auth` | Sign-in/up, password, verify |
| `marketing` | Landing + career globe |
| `onboarding` | First-run profile |
| `dashboard` | Bootstrap workspace home |
| `resume` | ATS hub, upload/review, report, **edit**, library preview |
| `interview` | Setup, session, report, delete |
| `settings` | Profile, prefs, privacy, account, profile-from-resume |
| `jobs` | List/detail/saved |
| `learning` | Paths / topics |

### Important workspace routes

| Path | Purpose |
|------|---------|
| `/dashboard` | Home |
| `/resume-analysis` | ATS list / resumes / new upload tabs |
| `/resume-analysis/review` | Extraction review |
| `/resume-analysis/report/[reportId]` | ATS report |
| `/resume-analysis/report/[reportId]/edit` | Edit existing resume for score |
| `/mock-interview` … `/setup` `/session/[id]` | Interview |
| `/settings/profile` … | Settings |
| `/jobs`, `/learning` | Jobs & learning |

### API client

`src/lib/api/client.ts` — attaches Supabase session JWT to `NEXT_PUBLIC_API_BASE_URL` + `/api/v1`.

---

## 12. Configuration (root `.env` only)

All runtime config is expected in the **repository root** `.env` (gitignored). Backend loads it via absolute path in `app/config.py`.

### Frontend (browser-visible)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Anon/publishable key |
| `NEXT_PUBLIC_API_BASE_URL` | FastAPI origin (e.g. `http://127.0.0.1:8000`) |

### Backend app

| Variable | Purpose |
|----------|---------|
| `APP_NAME`, `APP_ENV`, `API_V1_PREFIX`, `LOG_LEVEL` | Service metadata |
| `FRONTEND_ORIGINS` | CORS allow-list (comma-separated) |

### Supabase (server)

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Same project as public URL |
| `SUPABASE_PUBLISHABLE_KEY` | User client |
| `SUPABASE_SECRET_KEY` | Admin client (health, purge) |
| `SUPABASE_DB_URL` | Optional Postgres URL for CLI/migrations; **not** used by FastAPI query path |

### Storage

| Variable | Purpose |
|----------|---------|
| `DOCUMENT_BUCKET`, `AVATAR_BUCKET`, `INTERVIEW_BUCKET` | Bucket names |
| `DOCUMENT_MAX_BYTES`, `AVATAR_MAX_BYTES`, `INTERVIEW_MEDIA_MAX_BYTES` | Limits |

### NVIDIA

| Variable | Purpose |
|----------|---------|
| `NVIDIA_API_KEY`, `NVIDIA_BASE_URL`, `NVIDIA_MODEL` | Provider |
| `NVIDIA_TIMEOUT_SECONDS`, `NVIDIA_MAX_RETRIES`, `NVIDIA_MAX_OUTPUT_TOKENS`, `NVIDIA_TEMPERATURE` | Call policy |
| `NVIDIA_PROMPT_VERSION` | Prompt version label |
| `IMPROVEMENT_MAX_*`, `EXPORT_SIGNED_URL_SECONDS` | Safety / export TTL |

### Groq

| Variable | Purpose |
|----------|---------|
| `GROQ_API_KEY`, `GROQ_BASE_URL`, `GROQ_MODEL` | Provider |
| `GROQ_*` timeout/retries/tokens/temperature | Call policy |

**Never** put secrets in `NEXT_PUBLIC_*`. Validate without printing values: `npm run check:env`.

---

## 13. Setup & run

### Prerequisites

- Node.js (for Next.js / npm)
- **Python 3.11, 3.12, or 3.13** (project pin: **3.12** recommended).  
  **Python 3.14+ is not supported** (official `crewai` and this package require `<3.14`).
- Supabase project with migrations applied
- Optional: NVIDIA key, Groq key

The setup script (`scripts/setup-backend.mjs`) auto-selects a 3.11–3.13 interpreter (prefers 3.12), recreates `backend/.venv` if it was built with an unsupported version, and installs `backend[crewai]`.

Override interpreter if needed:

```powershell
$env:CAREER_COPILOT_PYTHON = "C:\Path\To\Python312\python.exe"
$env:CAREER_COPILOT_RECREATE_VENV = "1"
npm install
```

### Install

```powershell
npm install
```

This installs frontend packages and runs `scripts/setup-backend.mjs` to create `backend/.venv` on a suitable Python and install the API package (+ CrewAI when possible).

### Develop

```powershell
npm run dev
```

- Frontend: `http://localhost:3000`
- Backend: `http://127.0.0.1:8000`
- Docs: `http://127.0.0.1:8000/docs` (non-production)

Separate processes:

```powershell
npm run dev:frontend
npm run dev:backend
```

### Quality checks

```powershell
npm run check:secrets
npm run check:env
npm run lint
npm run typecheck
npm run build
npm run check
```

### Production-ish

```powershell
npm run build
npm run start
# API: uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000
```

---

## 14. Security & privacy principles

- **JWT-gated API** on protected routes; 503 if Supabase not configured.
- **RLS + user_id** ownership on tables; private storage folder = `auth.uid()`.
- **No server secrets in the browser.**
- **Evidence-bound AI** for resume text; user confirmation for keyword adds and profile apply.
- **Account deletion** removes owned rows and known storage objects.
- **`.env` gitignored**; secret scan script available.
- Security headers middleware: request id, `X-Content-Type-Options`, `Referrer-Policy`.

---

## 15. Debugging & health checks

| Check | How |
|-------|-----|
| API up | `GET /api/v1/health` |
| Supabase reachable | `GET /api/v1/health/supabase` |
| Agents configured | `GET /api/v1/agents/status` |
| Improve capabilities | `GET /api/v1/resume-improvements/capabilities` (auth) |
| Bootstrap payload | `GET /api/v1/me/bootstrap` (auth) |
| Env names only | `npm run check:env` |

**Logs:** Uvicorn access + structured request middleware (`request_id`, path, status, duration). Agent failures log warning codes then fall back where designed.

**Backend map:** see `backend/README.md`.

---

## 16. Known non-goals / boundaries

| Not claimed / not shipped as product defaults |
|-----------------------------------------------|
| Full clone of Resume-Matcher monorepo (templates canvas, cover letters, local multi-LLM UI) |
| Semantic / embedding ATS score (score is exact token coverage) |
| Interview **evaluation** AI (`interview_evaluation` capability is false) |
| Job recommendation engine as live AI (`job_recommendations` capability false; table/API may exist for data) |
| Using `SUPABASE_DB_URL` as the app’s query driver (HTTP Supabase client is used) |
| Hard-zero “no constants in code” (domain constants and safe defaults exist; **secrets** are not hardcoded) |

---

## Quick reference: user journeys

1. **Sign up / sign in** → Supabase Auth → workspace.  
2. **Upload resume + JD** → review → confirm → **ATS score**.  
3. **Edit resume** → in-place save → optional AI → export → **re-score**.  
4. **Profile** → fill from resume (rules + NVIDIA) → apply.  
5. **Mock interview** → Groq questions → answer → complete.  
6. **Jobs / learning / settings** → read/write persisted rows only.

---

## License / ownership

Private project package (`career-copilot` / `career-copilot-api` v1.0.0). Configure and deploy with your own Supabase project and API keys.

---

*This README reflects the codebase structure and capabilities as implemented in the Career Copilot repository: platform, ATS, in-place resume edit, agents, exports, interviews, profile fill, and operational docs for setup and debugging.*
