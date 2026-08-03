# Career Copilot

Full-stack career preparation app: profile building, resume/ATS analysis, evidence-bound resume improvement, mock interviews, jobs, and learning. Data lives in **local SQLite** and filesystem storage. Optional AI uses **NVIDIA** and **Groq** (server-side only).

**Branding:** the product name is shown as plain text (“Career Copilot”). There is **no logo image asset** in the UI.

---

## 1. Project Overview

### What it is

**Career Copilot** helps candidates prepare for applications without inventing career facts. Users upload real resumes, confirm extractions, score against real job descriptions, improve wording only where evidence supports it, and practice interviews.

### Problem it solves

| Need | How this project addresses it |
|------|--------------------------------|
| Honest ATS-style feedback | Deterministic keyword evidence + optional structured LLM scoring with a domain gate |
| Safe AI rewrite help | Sequential crew + server validators block unsupported claims |
| Local ownership | JWT auth, SQLite, and local file buckets — no hosted BaaS required |
| Works without AI keys | Manual edit, rule-based profile fill, template interview questions, deterministic ATS |

### Golden rule

> Do not invent the candidate’s career. Only use what they type, upload, confirm, or explicitly accept. **SQLite + local storage** is the system of record.

### Product surface

1. Sign up / sign in (email + password, local JWT)
2. Profile + completion checklist (server-scored)
3. Resume upload (PDF/DOCX) → extract → review → confirm
4. Job description → confirm → ATS analysis
5. In-place resume edit + optional AI improve
6. Mock interview questions (Groq or templates)
7. Jobs browse/save and learning paths (DB-backed)

---

## 2. Complete Tech Stack

### Monorepo layout

```text
career-copilot_v1/
├── package.json              # Root orchestration scripts only
├── .env / .env.example       # Single env file for API + Next
├── db/schema.sql             # SQLite schema
├── scripts/                  # setup, dev, diagnostics
│   ├── setup/                # frontend ci, backend venv, migrate DB
│   ├── dev/                  # preflight + run API/UI
│   ├── diagnostics/          # env + secrets checks
│   └── shared/load-env.mjs
├── frontend/                 # Next.js App Router application
│   ├── package.json
│   ├── public/               # jobs textures (no brand logo; fonts via next/font)
│   └── src/
│       ├── app/              # routes, API proxies, globals.css
│       ├── features/         # domain UI (auth, resume, interview, …)
│       └── shared/           # api client, routes, primitives
├── backend/                  # FastAPI package career-copilot-api
│   ├── pyproject.toml
│   ├── app/
│   │   ├── main.py
│   │   ├── api/              # router + route modules
│   │   ├── agents/           # LLM clients, crews, prompts, registry
│   │   ├── ats/              # deterministic + structured scoring service
│   │   ├── auth/
│   │   ├── core/             # config, errors
│   │   ├── db/               # SQLite client, repository, activity
│   │   ├── documents/        # uploads + parsing
│   │   ├── profiles/
│   │   └── resumes/
│   └── tests/
└── .data/                    # runtime SQLite + storage (gitignored)
```

### Languages

| Technology | Role |
|------------|------|
| **TypeScript** | Frontend (`frontend/`) |
| **Python 3.11–3.13** (prefer **3.12**) | Backend; **3.14+ not supported** |

### Frontend

| Technology | Role |
|------------|------|
| **Next.js (App Router)** | Pages, layouts, `/api/backend` and `/api/files` proxies |
| **React** | UI |
| **Tailwind CSS** | Styling |
| **Lucide React** | Icons |
| **Motion** | Light animation |
| **Three.js / React Three Fiber / Drei** | Jobs/marketing globe |
| **Source Sans 3** (`next/font`) | Site-wide UI / body |
| **Source Serif 4** (`next/font`) | Headings, brand, display |
| **Source Code Pro** (`next/font`) | Scores, badges, mono labels |

### Backend

| Technology | Role |
|------------|------|
| **FastAPI + Uvicorn** | HTTP API under `/api/v1` |
| **Pydantic v2 / pydantic-settings** | Schemas + root `.env` |
| **httpx** | NVIDIA / Groq HTTP |
| **PyJWT[crypto]** | HS256 access tokens |
| **pypdf / python-docx / reportlab** | Parse + export resumes |
| **langchain-openai** | Chat client for structured ATS scoring |
| **crewai** (optional `.[crewai]`) | Official multi-agent package for ATS scoring crews |
| **docling** (optional `.[docling]`) | Layout-aware PDF extraction |

### Data

| Technology | Role |
|------------|------|
| **SQLite** (`sqlite3`) | All durable data via `DATABASE_PATH` |
| **Local filesystem** | `LOCAL_STORAGE_DIR` buckets |
| **Custom client** `backend/app/db/client.py` | Fluent query API (not Prisma/SQLAlchemy/Drizzle) |

### AI providers

| Provider | Default model | Base URL default |
|----------|---------------|------------------|
| **NVIDIA Integrate** | `deepseek-3.2` | `https://integrate.api.nvidia.com/v1` |
| **Groq** | `llama-3.3-70b-versatile` | `https://api.groq.com/openai/v1` |

---

## 3. AI Architecture (Models & Agents)

### Models

| Model id | Provider | Config | Used for |
|----------|----------|--------|----------|
| **`deepseek-3.2`** | NVIDIA | `NVIDIA_MODEL`, `NVIDIA_API_KEY`, `NVIDIA_BASE_URL` | Resume improvement, profile-fill AI, preferred ATS brief; ATS scoring when `LLM_PROVIDER=nvidia` |
| **`llama-3.3-70b-versatile`** | Groq | `GROQ_MODEL`, `GROQ_API_KEY`, `GROQ_BASE_URL` | Interview questions; ATS brief if NVIDIA off; ATS scoring when `LLM_PROVIDER=groq` (default) |

Clients use OpenAI-compatible `POST {base}/chat/completions` with JSON object responses, retries on transient errors, and a repair pass via `repair_structured_output_v1.txt`.

**Important split:** resume improve and profile fill use **NVIDIA only** (no silent Groq fallback). Interview questions use **Groq only**. ATS brief prefers NVIDIA, then Groq, then deterministic text.

### Product agents (`backend/app/agents/registry.py`)

Status: **`GET /api/v1/agents/status`**.

| Agent id | Role | Provider | Prompt | Fallback |
|----------|------|----------|--------|----------|
| `resume_improvement` | Evidence-checked rewrites of confirmed blocks | NVIDIA | `improve_resume_v1.txt` | Manual edit + export |
| `resume_improvement_crew` | Sequential: gap → improve → validate | NVIDIA + tools | same + crew tools | Built-in sequential orchestrator; needs NVIDIA to generate |
| `profile_fill` | Resume → profile draft | NVIDIA + rules | `fill_profile_from_resume_v1.txt` | Deterministic extract only |
| `interview_questions` | Mock interview questions | **Groq** | `interview_questions_v1.txt` | Local templates |
| `ats_improvement_brief` | Explain missing keywords only | NVIDIA → Groq | `ats_improvement_v1.txt` | Deterministic paragraph |

### Resume improvement crew (`backend/app/agents/crew/`)

| Step | Agent | Tool | Notes |
|------|-------|------|-------|
| 1 | ATS Gap Analyst | `analyze_ats_gaps` | Deterministic; no invention |
| 2 | Resume Improvement Specialist | `generate_resume_suggestions` | NVIDIA only |
| 3 | Evidence Validator | `validate_suggestions` | Drops unsupported content |

Runtime: `official_crewai` if package importable, else `compatible_orchestrator`.

### ATS structured scoring crew (`backend/app/agents/ats_scoring/`)

Used by `POST /api/v1/ats/score` and the structured branch of product ATS analyses:

1. Resume Parsing Agent → `ResumeParsed`
2. Job Description Parsing Agent → `JDParsed`
3. Domain Gate Agent → ALLOW / REJECT (rule gate can force REJECT)
4. Resume Scoring Agent → parameter scores + composite

Requires CrewAI + langchain-openai. On failure, product flow falls back to **deterministic keyword coverage** in `backend/app/ats/deterministic.py`.

**Composite formula:**

```text
composite = 0.40*hard_skill_match
          + 0.25*experience_relevance
          + 0.15*education_match
          + 0.10*certifications_match
          + 0.10*seniority_alignment
```

Persisted product algorithm version label: `structured-llm-gated-v1` (with deterministic evidence always written).

---

## 4. Feature Flows (Step-by-Step)

### Authentication

**Trigger:** `/sign-in`, `/sign-up`.

1. Browser calls same-origin `/api/backend/auth/...` (Next proxies to FastAPI `/api/v1`).
2. Sign-up creates `users` + `profiles` + preference rows; password hashed.
3. JWT issued with `AUTH_SECRET` (HS256, `sub` = user id).
4. Token stored in `localStorage` (`career_copilot_access_token`) and cookie `career_copilot_session`.
5. `get_current_user` validates token and loads the user from SQLite.

**Output:** Session for workspace APIs. Email resend/reset and OAuth are stubs for local development.

### Profile completion

**Trigger:** Bootstrap / profile mutations.

1. Server loads profile-related rows.
2. `backend/app/profiles/completion.py` scores a fixed 100-point checklist (**resume upload does not count**).
3. Writes `profile_completion` + `profile_completion_details`.
4. Workspace toast shows remaining items.

| Item | Points |
|------|--------|
| Full name | 10 |
| Location | 8 |
| Current role | 10 |
| Target roles | 8 |
| Experience or 0 years fresher | 22 |
| Skills | 17 |
| Education | 10 |
| Work modes | 5 |
| Preferred locations | 5 |
| Professional link | 5 |

### Resume upload → confirm

**Trigger:** Resume analysis upload.

1. Validate size/type → store under document bucket `{user_id}/...`.
2. Extract text (`pypdf` / `python-docx`; optional Docling).
3. Section parse (`backend/app/documents/parsing/`).
4. User reviews → `POST /resume-versions/{id}/confirm`.

### Job description

**Trigger:** Paste or upload JD.

1. Create `job_descriptions` row → extract/structure → user confirm.

### ATS analysis

**Trigger:** `POST /api/v1/ats-analyses` with confirmed resume + JD.

1. Always run deterministic keyword scorer (`deterministic-keyword-coverage-v1` logic).
2. Attempt structured LLM pipeline; on success use composite (0 if gate REJECT).
3. Persist analysis + evidence rows.
4. Generate `overall_inference` brief (NVIDIA → Groq → deterministic).
5. Activity event written.

**Also:** non-persisted `POST /api/v1/ats/score`.

### In-place edit & AI improve

**Trigger:** Report edit page or improvement APIs.

1. **Manual:** edit same `resume_versions` row (`apply_mode` default `in_place`).
2. **AI:** `POST /resume-improvements` → crew gap/improve/validate → user accept → apply.
3. Export PDF/DOCX optional; re-score same version.

### Profile fill from resume

**Trigger:** Settings / from-resume preview.

1. Deterministic draft always.
2. NVIDIA extract merged with evidence filter when configured.
3. User previews → selective apply → completion recalculated.

### Mock interview

**Trigger:** Create session → start.

1. Groq generates questions if configured.
2. Else local templates (never NVIDIA).
3. Store questions/responses; complete or delete.

**Not shipped:** AI answer grading / evaluation agent.

### Jobs & learning

**Trigger:** `/jobs`, `/learning`.

DB reads/writes only; no product agent for AI job recommendation.

### Account deletion

**Trigger:** `DELETE /account`.

Removes owned rows and known storage objects for the user.

---

## 5. Implementation Rationale

### Why this monorepo shape?

- **Root** owns one `.env`, orchestration scripts, and shared `db/schema.sql`.
- **`frontend/`** is a self-contained Next app (own `package.json` / lockfile).
- **`backend/`** is a self-contained Python package (`career-copilot-api`) with tests under `backend/tests/`.
- Keeps Node and Python dependency trees isolated while `npm run setup` / `npm run dev` still start everything from the root.

### Why SQLite + local files?

- No database server for local/dev.
- Idempotent schema via `db/schema.sql` + `scripts/setup/migrate-local-db.py`.
- Isolation is **application-level** (`user_id` filters + JWT), not Postgres RLS.

### Why sequential crew for resume improve?

- Fixed pipeline contracts, not free multi-agent chat.
- Only generation needs an LLM; gap analysis and validation stay deterministic.
- Auditable task log; lower hallucination surface.

### Why dual ATS (structured + deterministic)?

- Keyword evidence is always explainable for UI and audit tables.
- Structured scores add domain gate + multi-parameter composite when providers work.
- Offline-safe fallback when CrewAI/LLM fails.

### Failure / hallucination handling

| Risk | Mitigation |
|------|------------|
| Invented experience | Evidence validators; blocked suggestions dropped |
| Profile AI freelancing | Values must appear in resume text |
| Bad model JSON | Repair prompt; then `ApiError` |
| Rate limits / 5xx | Retries + typed API errors |
| Missing keys | Manual / template / deterministic paths remain |

### Frontend networking

- Browser: `/api/backend/*` → FastAPI `/api/v1/*`.
- Files: Next file routes + backend `/files/{bucket}/{path}` with auth.
- In-flight GET dedupe only; no durable client product cache.

---

## 6. Environment Setup & Configuration

### Prerequisites

1. **Node.js** (LTS) + npm  
2. **Python 3.11–3.13** (3.12 preferred; **not 3.14+**)  
3. No separate database server  
4. Optional NVIDIA and/or Groq API keys  

### Install

```powershell
cd "D:\CDAC PROJECT\career-copilot_v1"
copy .env.example .env
# Edit .env: set AUTH_SECRET; add API keys if you want AI features

npm run setup
```

`npm run setup` runs `scripts/setup/project.mjs`, which:

1. `npm --prefix frontend ci` (install frontend from lockfile)
2. `scripts/setup/backend.mjs` (create `backend/.venv`, install API + optional CrewAI)
3. `scripts/setup/local-db.mjs` (apply schema, create storage dirs)

Override Python if needed:

```powershell
$env:CAREER_COPILOT_PYTHON = "C:\Path\To\Python312\python.exe"
$env:CAREER_COPILOT_RECREATE_VENV = "1"
npm run setup
```

### Run

```powershell
npm run dev
```

Preflight migrates/checks SQLite, then starts API + Next.

| Service | URL |
|---------|-----|
| Website | http://localhost:3000 |
| API | http://127.0.0.1:8000 |
| OpenAPI (non-production) | http://127.0.0.1:8000/docs |

Separate:

```powershell
npm run dev:frontend
npm run dev:backend
npm run db:setup
```

Production-style frontend:

```powershell
npm run build:frontend
npm --prefix frontend run start
```

API alone:

```powershell
backend\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000
```

### Scripts (root `package.json`)

| Command | Purpose |
|---------|---------|
| `npm run setup` | Full install (frontend + backend + DB) |
| `npm run dev` | Preflight + API + frontend |
| `npm run dev:frontend` / `dev:backend` | Single service |
| `npm run db:setup` | Schema + DB check |
| `npm run check:env` | Env presence (secrets not printed) |
| `npm run check:secrets` | Secret scan |
| `npm run check:boundaries` | Cross-directory import boundaries |
| `npm run lint` / `typecheck` / `build:frontend` / `check:frontend` | Frontend quality |
| `npm run test:backend` | `pytest` under `backend/tests` |

### Complete `.env.example`

Root file (values match the checked-in template / `backend/app/core/config.py`). **Never** put secrets in `NEXT_PUBLIC_*`.

```env
# One repository-wide environment file.
# Copy this file to .env. Keep real credentials only in the ignored .env file.

# Frontend and API
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000   # Browser / proxy target for API origin
PUBLIC_API_BASE_URL=http://127.0.0.1:8000        # Server-side Next → FastAPI base
FRONTEND_ORIGINS=http://localhost:3000,http://127.0.0.1:3000  # CORS allowlist
APP_NAME=Career Copilot API
APP_ENV=development                              # production disables /docs
API_V1_PREFIX=/api/v1
LOG_LEVEL=INFO

# Local persistence
DATABASE_PATH=./.data/career-copilot.sqlite
LOCAL_STORAGE_DIR=./.data/storage
AUTH_SECRET=replace-with-a-long-random-local-secret
DOCUMENT_BUCKET=candidate-documents
AVATAR_BUCKET=candidate-avatars
INTERVIEW_BUCKET=interview-media

# File limits and signed local URLs
DOCUMENT_MAX_BYTES=10485760                      # 10 MiB
AVATAR_MAX_BYTES=3145728                         # 3 MiB
INTERVIEW_MEDIA_MAX_BYTES=262144000              # 250 MiB
EXPORT_SIGNED_URL_SECONDS=300

# Provider selection for ATS structured scoring: groq or nvidia
LLM_PROVIDER=groq

# NVIDIA provider (server-only; leave empty when unused)
NVIDIA_API_KEY=
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=deepseek-3.2
NVIDIA_TIMEOUT_SECONDS=90
NVIDIA_MAX_RETRIES=2
NVIDIA_MAX_OUTPUT_TOKENS=4096
NVIDIA_TEMPERATURE=0.2
NVIDIA_PROMPT_VERSION=resume-improvement-v1

# Groq provider (server-only; leave empty when unused)
GROQ_API_KEY=
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_TIMEOUT_SECONDS=45
GROQ_MAX_RETRIES=2
GROQ_MAX_OUTPUT_TOKENS=2048
GROQ_TEMPERATURE=0.4

# Resume improvement limits
IMPROVEMENT_MAX_SECTIONS=4
IMPROVEMENT_MAX_SOURCE_CHARS=30000
IMPROVEMENT_MAX_JD_CHARS=12000

# Optional installer and local API audit controls
# CAREER_COPILOT_PYTHON=C:\Path\To\Python312\python.exe
CAREER_COPILOT_RECREATE_VENV=0
CAREER_COPILOT_AUDIT_BASE=http://127.0.0.1:18004
```

### Package identity

| Package | Version | Role |
|---------|---------|------|
| `career-copilot` (root npm) | 1.0.0 | Orchestration scripts only |
| `career-copilot` (`frontend/` npm) | 1.0.0 | Next.js app |
| `career-copilot-api` (Python) | 1.0.0 | FastAPI under `backend/app` |

### Security

- Keep `.env` gitignored; run `npm run check:secrets` before commits.
- AI keys only on the API process.
- File access requires auth and path prefix `{user_id}/`.

---

## Appendix A — Primary API map

Base: **`{API origin}/api/v1`**.

| Area | Examples |
|------|----------|
| Health | `GET /health`, `GET /health/database`, `GET /agents/status` |
| Auth | `POST /auth/sign-up`, `/auth/sign-in`, `/auth/session`, `/auth/sign-out` |
| Workspace | `GET /me/bootstrap`, `GET /me/activity` |
| Profile | `GET/PATCH /profile`, avatar, preferences, CRUD, from-resume preview/apply |
| Resumes | `/resumes`, versions, confirm, manual-edit, exports |
| Improvements | `/resume-improvements`, suggestions, apply |
| JD / ATS | `/job-descriptions`, `/ats-analyses`, `POST /ats/score` |
| Interviews | `/interviews`, start, responses, complete |
| Jobs / learning | `/jobs`, `/saved-jobs`, `/learning-paths` |
| Settings / account | `/settings`, `DELETE /account` |
| Files | `GET /files/{bucket}/{path}` |

---

## Appendix B — Explicit non-goals

| Not shipped | Reality |
|-------------|---------|
| Product logo image | Text brand only in nav/auth/footer/sidebar |
| Interview answer grading AI | Questions only |
| Embedding / semantic ATS | Keyword + optional structured scores |
| Invented resume facts | Validators + user confirm gates |
| Hosted DB with RLS | Local SQLite + app ownership |
| Email delivery for verify/reset | Local stubs |
| Profile points for resume upload | Profile fields only |

---

## Appendix C — UI pages (frontend)

| Area | Routes |
|------|--------|
| Marketing | `/` |
| Auth | `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`, `/verify-email` |
| Onboarding | `/onboarding` |
| Workspace | `/dashboard`, `/resume-analysis/*`, `/mock-interview/*`, `/learning/*`, `/jobs/*`, `/settings/*` |

Feature modules live under `frontend/src/features/*`; shared chrome in `workspace-shell.tsx` (text brand, no logo).

---

*Aligned with the current monorepo: `frontend/`, `backend/`, root scripts, no brand logo assets, NVIDIA `deepseek-3.2` + Groq `llama-3.3-70b-versatile`.*
