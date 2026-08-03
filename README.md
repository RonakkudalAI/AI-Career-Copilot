# Career Copilot

**Version:** 1.0.0  
**Type:** Full-stack monorepo (Next.js frontend + FastAPI backend + local SQLite)

Career Copilot is a **private career workspace** that helps candidates build profiles, score resumes against job descriptions with **auditable evidence**, improve wording without inventing experience, practice mock interviews, and track jobs/learning — all with **local ownership** of data and **server-side AI only**.

---

## Table of contents

1. [What we are doing](#1-what-we-are-doing)
2. [Why we are doing it this way](#2-why-we-are-doing-it-this-way)
3. [How we are doing it (architecture)](#3-how-we-are-doing-it-architecture)
4. [Repository layout & key files](#4-repository-layout--key-files)
5. [Complete tech stack](#5-complete-tech-stack)
6. [AI models](#6-ai-models)
7. [Agents (purpose, files, alternatives)](#7-agents-purpose-files-alternatives)
8. [Features (what / why / how / files)](#8-features-what--why--how--files)
9. [Data flow end-to-end](#9-data-flow-end-to-end)
10. [API map](#10-api-map)
11. [Frontend routes & UI](#11-frontend-routes--ui)
12. [Database & storage](#12-database--storage)
13. [Environment & setup](#13-environment--setup)
14. [Scripts & verification](#14-scripts--verification)
15. [Design decisions & alternatives](#15-design-decisions--alternatives)
16. [Explicit non-goals](#16-explicit-non-goals)
17. [Package identity](#17-package-identity)

---

## 1. What we are doing

### Product goals

| Goal | Outcome for the user |
|------|----------------------|
| **Own career data** | Sign-up, profile, resumes, ATS runs, interviews live in **local SQLite + filesystem** |
| **Honest ATS feedback** | Keyword coverage evidence + optional structured LLM score; not a black-box “hireability” number |
| **Safe resume help** | AI may rewrite **existing** confirmed blocks; validators block invented employers/metrics |
| **Interview practice** | Generate questions (Groq or templates); store answers; no grading AI shipped |
| **Graceful degradation** | Core flows work **without** LLM keys (manual edit, deterministic ATS, template questions) |
| **Server-only secrets** | NVIDIA/Groq keys never reach the browser |

### Golden rule

> **Do not invent the candidate’s career.**  
> Work only from what the user types, uploads, confirms, or explicitly accepts.  
> **SQLite + local storage** is the system of record — not browser localStorage for durable product truth.

### Branding & UI

- Product name is **text-only** (“Career Copilot”) — **no logo image assets**.
- Site-wide premium classic type (`next/font`):
  - **Source Sans 3** — body / UI / forms → `frontend/src/app/layout.tsx`, `globals.css`
  - **Source Serif 4** — headings / brand
  - **Source Code Pro** — scores, badges, mono labels

---

## 2. Why we are doing it this way

| Decision | Why |
|----------|-----|
| **Local SQLite** | Zero DB server for dev/demo; simple file backup; full control |
| **Application ownership filters** (not Postgres RLS) | SQLite has no RLS; every query scopes by `user_id` + JWT |
| **Deterministic keyword ATS (always)** | Explainable matched/missing terms; same input → same evidence; works offline |
| **Optional structured LLM ATS** | Domain gate + multi-parameter composite when CrewAI/provider available |
| **No embeddings / cosine ATS** | Opaque for “keyword honesty”; wrong tool for auditable missing-term lists |
| **NVIDIA for resume/profile** | Strong structured JSON for rewrites and extracts |
| **Groq for interview questions only** | Fast generation; deliberately **not** a silent fallback for resume improve |
| **Sequential crew (gap → improve → validate)** | Fixed contracts; less hallucination than free multi-agent chat |
| **User confirm before ATS / improve** | Bad PDF extract must not auto-score as truth |
| **Next.js proxy `/api/backend`** | Same-origin browser calls; simpler cookies/CORS |
| **Feature-oriented folders** | Clear ownership of ATS, profile, resume, interview code |

More layout detail: `docs/architecture.md`.

---

## 3. How we are doing it (architecture)

```text
┌─────────────────────────────────────────────────────────────┐
│  Browser (Next.js App Router)                               │
│  frontend/src/app  +  frontend/src/features                 │
│  Auth token: localStorage + cookie career_copilot_session   │
└───────────────────────────┬─────────────────────────────────┘
                            │  /api/backend/*  (proxy)
                            │  /api/files/*    (file proxy)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  FastAPI  backend/app/main.py                               │
│  Prefix: /api/v1                                            │
│  JWT (AUTH_SECRET, HS256) → CurrentUser                     │
└───────┬─────────────────────┬───────────────────────────────┘
        │                     │
        ▼                     ▼
  SQLite (.data/)      LOCAL_STORAGE_DIR buckets
  database/client.py   documents / avatars / interview-media
        │
        ▼ (optional, server-only)
  NVIDIA Integrate API   |   Groq OpenAI-compatible API
  deepseek-3.2           |   llama-3.3-70b-versatile
```

### Request path (typical authenticated call)

1. UI → `frontend/src/shared/api/client.ts` → `fetch("/api/backend/...")` + `Authorization: Bearer …`
2. `frontend/src/app/api/backend/[...path]/route.ts` forwards to FastAPI
3. `backend/app/features/auth/service.py` + `get_current_user` validate JWT
4. `backend/app/database/client.py` runs user-scoped queries
5. Feature code may call agents under `backend/app/agents` / `backend/app/features/*/agent*`
6. JSON response; stable errors via `backend/app/core/errors.py` (`ApiError`)

---

## 4. Repository layout & key files

```text
career-copilot_v1/
├── README.md                          ← this file
├── package.json                       ← root orchestration scripts only
├── .env / .env.example                ← single env for frontend + API
├── db/schema.sql                      ← SQLite schema (idempotent)
├── docs/architecture.md               ← feature-oriented layout notes
├── scripts/
│   ├── setup/project.mjs              ← npm run setup
│   ├── setup/backend.mjs              ← Python venv + package install
│   ├── setup/local-db.mjs / migrate-local-db.py
│   ├── dev/preflight.mjs, run.mjs, frontend.mjs, backend.mjs
│   ├── diagnostics/verify-environment.mjs, check-secrets.mjs
│   └── verify-boundaries.mjs
├── frontend/                          ← Next.js application
│   ├── package.json
│   ├── public/jobs/                   ← textures (no brand logo)
│   └── src/
│       ├── app/                       ← routes, layouts, proxies, globals.css
│       ├── features/                  ← domain UI
│       └── shared/                    ← api client, routes, primitives
├── backend/                           ← Python package career-copilot-api
│   ├── pyproject.toml
│   ├── tests/
│   └── app/
│       ├── main.py                    ← FastAPI app + middleware
│       ├── core/config.py, errors.py
│       ├── api/router.py, schemas.py  ← primary HTTP surface
│       ├── database/                  ← SQLite client, repository, activity
│       ├── agents/                    ← registry, prompts, providers
│       └── features/                  ← auth, profile, resume, ats, …
└── .data/                             ← runtime DB + storage (gitignored)
```

### Backend module map

| Concern | Path |
|---------|------|
| App entry | `backend/app/main.py` |
| Settings | `backend/app/core/config.py` |
| Errors | `backend/app/core/errors.py` |
| HTTP routes (most features) | `backend/app/api/router.py` |
| Schemas | `backend/app/api/schemas.py` |
| SQLite client | `backend/app/database/client.py` |
| Ownership / completion / activity | `backend/app/database/repository.py`, `activity.py` |
| Agent inventory | `backend/app/agents/registry.py` |
| LLM clients | `backend/app/agents/providers/nvidia_client.py`, `groq_client.py`, `common.py` |
| Prompts | `backend/app/agents/prompts/*.txt` |
| Auth | `backend/app/features/auth/` |
| Profile + fill | `backend/app/features/profile/` |
| Document parse | `backend/app/features/document_parsing/` |
| Resume evidence / export / validation | `backend/app/features/resume_management/` |
| Resume improve crew + routes | `backend/app/features/resume_improvement/` |
| ATS | `backend/app/features/ats/` |
| Interview questions | `backend/app/features/mock_interview/agent/` |

### Frontend module map

| Concern | Path |
|---------|------|
| Fonts + root shell | `frontend/src/app/layout.tsx`, `globals.css` |
| Marketing | `frontend/src/features/marketing/components/landing.tsx` |
| Auth UI | `frontend/src/features/auth/` |
| Workspace chrome | `frontend/src/features/workspace/components/workspace-shell.tsx` |
| Dashboard | `frontend/src/features/dashboard/` |
| Resume / ATS UI | `frontend/src/features/resume/` |
| Interview UI | `frontend/src/features/interview/` |
| Jobs / globe | `frontend/src/features/jobs/` |
| Learning | `frontend/src/features/learning/` |
| Settings / preferences | `frontend/src/features/settings/components/settings.tsx` |
| Profile toast | `frontend/src/features/profile/` |
| API client | `frontend/src/shared/api/client.ts` |
| Backend proxy | `frontend/src/app/api/backend/[...path]/route.ts` |
| File proxy | `frontend/src/app/api/files/[bucket]/[...path]/route.ts` |

---

## 5. Complete tech stack

### Languages & runtimes

| Tech | Role | Alternatives (if redesigning) |
|------|------|-------------------------------|
| **TypeScript / Node** | Frontend + scripts | JS only (worse DX) |
| **Python 3.11–3.13** (prefer 3.12) | API; **not 3.14+** | Go/Rust rewrite (out of scope) |

### Frontend

| Tech | Role | Alternatives |
|------|------|--------------|
| **Next.js App Router** | Pages, layouts, route handlers | Remix, plain React SPA |
| **React** | UI | Vue, Svelte |
| **Tailwind CSS** | Styling | CSS Modules only |
| **Lucide React** | Icons | Heroicons |
| **Motion** | Light animation | Framer Motion legacy, CSS |
| **Three.js / R3F / Drei** | Career globe | 2D map only |
| **Source Sans 3 / Serif 4 / Code Pro** | Typography via `next/font` | Inter, Geist, Satoshi, commercial faces |

### Backend

| Tech | Role | Alternatives |
|------|------|--------------|
| **FastAPI + Uvicorn** | HTTP API | Django, Flask, NestJS |
| **Pydantic v2 / pydantic-settings** | Validation + `.env` | attrs, dataclasses |
| **httpx** | Async LLM HTTP | aiohttp, requests |
| **PyJWT** | HS256 sessions | session cookies server-side only, Auth0 |
| **pypdf / python-docx / reportlab** | Parse + export | Docling, LibreOffice |
| **langchain-openai** | Chat client for ATS structured scoring | Direct OpenAI SDK, litellm |
| **crewai** (optional) | Official multi-agent package | LangGraph, AutoGen, pure custom |

### Data

| Tech | Role | Alternatives |
|------|------|--------------|
| **SQLite** (`sqlite3`) | Durable app data | PostgreSQL, Supabase |
| **Local filesystem** | Documents/avatars/media | S3, MinIO |
| **Custom fluent client** | `table().select().eq()…` | SQLAlchemy, Prisma, Drizzle |

### AI providers

| Provider | Default model | Used for |
|----------|---------------|----------|
| **NVIDIA Integrate** | `deepseek-3.2` | Resume improve, profile fill AI, preferred ATS brief; ATS scoring if `LLM_PROVIDER=nvidia` |
| **Groq** | `llama-3.3-70b-versatile` | Interview questions; ATS brief if NVIDIA off; default ATS structured scorer |

---

## 6. AI models

### Models in use (exact identifiers from config)

| Model id | Provider | Config keys | Primary use | Why this project uses it |
|----------|----------|-------------|-------------|---------------------------|
| **`deepseek-3.2`** | NVIDIA Integrate (`https://integrate.api.nvidia.com/v1`) | `NVIDIA_API_KEY`, `NVIDIA_MODEL`, `NVIDIA_BASE_URL` | Structured JSON: resume rewrites, profile extract, ATS brief (preferred), optional ATS scoring | OpenAI-compatible chat + JSON mode; strong structured output for evidence-bound tasks |
| **`llama-3.3-70b-versatile`** | Groq (`https://api.groq.com/openai/v1`) | `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_BASE_URL` | Interview questions; ATS brief fallback; default structured ATS via `LLM_PROVIDER=groq` | Fast JSON generation; low latency for interactive interview start |

### Call policy (both clients)

| Behavior | Where |
|----------|--------|
| `POST {base}/chat/completions` | `nvidia_client.py`, `groq_client.py` |
| `response_format: json_object` | same |
| Retries on 408/429/5xx | same |
| One **repair pass** | `repair_structured_output_v1.txt` |
| Low temperature | NVIDIA ~0.2, Groq ~0.4 (config) |

### Provider selection rules

| Feature | Provider rule |
|---------|----------------|
| Resume improve | **NVIDIA only** (no Groq fallback) |
| Profile fill AI | **NVIDIA only** (+ deterministic always) |
| Interview questions | **Groq only** (+ templates) |
| ATS improvement brief | NVIDIA → else Groq → else deterministic paragraph |
| Structured ATS crew LLM | `LLM_PROVIDER` = `groq` or `nvidia` (default **groq**) |

### Model alternatives (if you swap)

| Current | Possible alternatives | Trade-off |
|---------|----------------------|-----------|
| `deepseek-3.2` on NVIDIA | Other NVIDIA catalog models; OpenAI `gpt-4o`; Anthropic Claude | Cost, latency, prompt retuning |
| `llama-3.3-70b-versatile` on Groq | Other Groq models; same OpenAI-compat endpoint | Quality vs speed |
| Dual providers | Single provider for everything | Simpler ops; less isolation of interview vs rewrite |

**Not used:** embedding models, vector DBs, cosine similarity for ATS.

---

## 7. Agents (purpose, files, alternatives)

### Product agents (registry)

**Inventory file:** `backend/app/agents/registry.py`  
**Live status:** `GET /api/v1/agents/status`

| # | Agent id | Recognizable name | Purpose | Provider | Prompt file | Key implementation files | Fallback | Alternatives |
|---|----------|-------------------|---------|----------|-------------|--------------------------|----------|--------------|
| 1 | `resume_improvement` | **Rewrite** | Suggest rewrites of confirmed resume blocks | NVIDIA | `agents/prompts/improve_resume_v1.txt` | `agents/providers/nvidia_client.py`, `features/resume_management/improvements.py` | Manual edit + export | Single-shot LLM without crew; human editor only |
| 2 | `resume_improvement_crew` | **Coach** | Sequential pipeline: gaps → rewrite → validate | NVIDIA + tools | improve prompt + tools | `features/resume_improvement/agents/crew/orchestrator.py`, `tools.py` | Compatible orchestrator if CrewAI missing | LangGraph pipeline; pure function pipeline |
| 3 | `profile_fill` | **Profiler** | Draft profile fields from resume | NVIDIA + rules | `fill_profile_from_resume_v1.txt` | `features/profile/agent/pipeline.py`, `deterministic.py` | Deterministic extract only | Rules-only forever; form-only profile |
| 4 | `interview_questions` | **Interviewer** | Generate mock questions | **Groq** | `interview_questions_v1.txt` | `features/mock_interview/agent/question_generator.py` | Local templates | Static banks; NVIDIA (not wired by design) |
| 5 | `ats_improvement_brief` | **Advisor** | Explain missing keywords / next steps | NVIDIA or Groq | `ats_improvement_v1.txt` | `features/ats/agents/improvement_brief.py` | Deterministic paragraph | Fully structured UI without prose |

### Coach sub-roles (resume improve crew)

**File:** `backend/app/features/resume_improvement/agents/crew/orchestrator.py`

| Sub-role | Nickname | Tool | File | Purpose |
|----------|----------|------|------|---------|
| ATS Gap Analyst | **Scout** | `analyze_ats_gaps` | `crew/tools.py` | Missing keywords from ATS evidence only (no LLM invent) |
| Resume Improvement Specialist | **Editor** | `generate_resume_suggestions` | calls NVIDIA | Propose rewrites of real blocks |
| Evidence Validator | **Guardian** | `validate_suggestions` | + `resume_management/validation.py` | Drop unsafe suggestions |

Process: **sequential**. Runtime: `official_crewai` if installed, else `compatible_orchestrator` (`crew/compat.py`).

### ATS structured scoring crew (not in the 5 product agents)

**Files:** `backend/app/features/ats/agent/agents.py`, `crew.py`, `prompts.py`, `scoring/service.py`

| Role | Nickname | Purpose |
|------|----------|---------|
| Resume Parsing Agent | **Parser** | Resume → `ResumeParsed` JSON |
| Job Description Parsing Agent | **JD Reader** | JD → `JDParsed` |
| Domain Gate Agent | **Gatekeeper** | ALLOW/REJECT before scoring (rules can force REJECT) |
| Resume Scoring Agent | **Scorer** | Parameter scores → composite |

Requires **CrewAI + langchain-openai**. On failure, product ATS **keeps** deterministic keyword score.

**Composite formula:**

```text
composite = 0.40*hard_skill_match
          + 0.25*experience_relevance
          + 0.15*education_match
          + 0.10*certifications_match
          + 0.10*seniority_alignment
```

Persisted product algorithm label often: `structured-llm-gated-v1` (see `api/router.py`).

### Hallucination controls (how agents stay safe)

| Control | Where |
|---------|--------|
| Evidence-bound prompts | `agents/prompts/*.txt` |
| JSON schema validation | Pydantic models in `api/schemas.py` / feature schemas |
| Repair pass | `repair_structured_output_v1.txt` |
| Server validator (entities, numbers, contact, meaning shift) | `features/resume_management/validation.py` |
| Profile evidence filter (value must appear in resume text) | `features/profile/agent/pipeline.py` |
| ATS brief constrained to missing keywords | `features/ats/agents/improvement_brief.py` |
| User confirm on extracts | resume/JD confirm endpoints in `api/router.py` |

---

## 8. Features (what / why / how / files)

### 8.1 Authentication & session

| | |
|--|--|
| **What** | Email/password sign-up and sign-in; JWT session |
| **Why** | Local multi-user without hosted Auth SaaS |
| **How** | Hash password → store `users` → issue HS256 JWT (`sub` = user id) → browser stores token + cookie |
| **Backend** | `features/auth/service.py`, routes in `api/router.py` (`/auth/*`) |
| **Frontend** | `features/auth/components/auth-screen.tsx`, `features/auth/api/client.ts` |
| **Notes** | Resend/reset email are **stubs** for local dev; OAuth stubbed |
| **Alternatives** | Supabase Auth, Clerk, Auth0, session cookies only |

### 8.2 Profile & completion

| | |
|--|--|
| **What** | Profile fields, skills, experience, education, links, preferences; 0–100 completion |
| **Why** | Clear “what’s missing”; resume upload does **not** count toward % |
| **How** | Checklist weights in pure functions; recalculate on mutations; toast in workspace |
| **Backend** | `features/profile/completion.py`, `database/repository.py`, profile routes in `api/router.py` |
| **Frontend** | `features/settings/components/settings.tsx`, `features/profile/*` |
| **Checklist** | Name 10, location 8, current role 10, target roles 8, experience/0 years 22, skills 17, education 10, work modes 5, locations 5, link 5 |
| **Alternatives** | Client-only %, LinkedIn import as sole source |

### 8.3 Career preferences UI

| | |
|--|--|
| **What** | Target roles, industries, locations, work modes, employment types, salary, etc. |
| **Why** | Persist job-search prefs; feed completion |
| **How** | Multi-select **dropdowns + removable tags** (not crowded checkbox grids); `PUT /profile/preferences` |
| **Frontend** | `features/settings/components/settings.tsx` (`MultiOptionGroup`, `SelectWithOther`) |
| **Alternatives** | Free-text only; multi-select combobox library |

### 8.4 Document upload & parsing

| | |
|--|--|
| **What** | PDF/DOCX → plain text → sections → user review → confirm |
| **Why** | Scoring/improve must use **confirmed** structure |
| **How** | `pypdf` / `python-docx` (+ optional Docling); section heuristics; storage under user path |
| **Backend** | `features/document_parsing/parsing/text_extract.py`, `sections.py`, `service.py` |
| **Frontend** | `features/resume/components/resume-flow.tsx` |
| **Alternatives** | Always-on Docling; cloud OCR; LLM-only parse with grounding |

### 8.5 Job descriptions

| | |
|--|--|
| **What** | Paste or upload JD → extract → confirm |
| **Why** | ATS needs a stable JD text source |
| **How** | Same parse/confirm pattern as resumes |
| **Backend** | JD routes in `api/router.py` |
| **Frontend** | Resume analysis “new” flow |

### 8.6 ATS analysis

| | |
|--|--|
| **What** | Score resume vs JD; missing keywords; optional structured composite; improvement inference |
| **Why** | Actionable, honest gap list for edits and AI improve |
| **How** | 1) Always `score_resume` deterministic keywords 2) Try structured `score_resume_jd` 3) Persist analysis + evidence 4) Generate brief |
| **Deterministic** | `features/ats/deterministic.py` — token match, top keywords, evidence lines |
| **Structured** | `features/ats/agent/*`, `features/ats/scoring/*` |
| **Brief** | `features/ats/agents/improvement_brief.py` |
| **Routes** | `POST /ats-analyses`, `GET .../evidence`, `POST /ats/score` |
| **Frontend** | `features/resume/components/resume-flow.tsx` |
| **Why deterministic keywords?** | Auditable, offline-safe, stable; real ATS filters often keyword-like |
| **Why not embeddings?** | Cosine ≠ “this JD token is on the resume”; harder to explain/audit |
| **Alternatives** | Phrase/synonym matcher (future); pure LLM score; third-party ATS APIs |

### 8.7 In-place resume edit & AI improve

| | |
|--|--|
| **What** | Edit the **same** resume version after ATS; optional AI suggestions |
| **Why** | Avoid “empty new resume” UX; ground rewrites in evidence |
| **How** | Manual: `POST .../manual-edit` (`in_place` default). AI: Coach crew → suggestions → user accept → apply. Export PDF/DOCX. |
| **Backend** | `resume_management/improvements.py`, `validation.py`, `evidence.py`, `exports.py`; routes `resume_improvement/routes.py` |
| **Frontend** | `resume-edit.tsx`, report edit pages under `app/(workspace)/resume-analysis/` |
| **Alternatives** | Always new version; unvalidated free rewrite |

### 8.8 Profile fill from resume

| | |
|--|--|
| **What** | Preview draft profile from resume; user applies selected fields |
| **Why** | Faster onboarding without auto-overwriting truth |
| **How** | Deterministic draft + optional NVIDIA extract + evidence filter → preview → apply |
| **Backend** | `features/profile/agent/*` |
| **Frontend** | Settings profile section |
| **Alternatives** | Auto-save; LinkedIn OAuth import |

### 8.9 Mock interview

| | |
|--|--|
| **What** | Create session → start → answer → complete/delete |
| **Why** | Practice without live human interviewer |
| **How** | Groq structured questions or templates; store Q&A |
| **Backend** | Interview routes in `api/router.py`; `mock_interview/agent/question_generator.py` |
| **Frontend** | `features/interview/components/interview-flow.tsx` |
| **Not shipped** | AI answer grading / evaluation agent |
| **Alternatives** | Fixed question banks only; voice agents |

### 8.10 Jobs & learning

| | |
|--|--|
| **What** | Browse/save jobs; learning paths/topics |
| **Why** | Workspace completeness; data-backed lists |
| **How** | CRUD-style endpoints; UI lists; globe visualization for jobs |
| **Backend** | Handlers in `api/router.py` |
| **Frontend** | `features/jobs/`, `features/learning/` |
| **Note** | No product AI job recommender agent in registry |
| **Alternatives** | External job APIs; embedding rank (optional future search) |

### 8.11 Settings, privacy, account deletion

| | |
|--|--|
| **What** | Notifications, privacy prefs, delete account |
| **Why** | Control retention and wipe local data |
| **How** | Pref rows; deletion collects owned files + rows |
| **Backend** | Settings routes; `features/auth/account_deletion.py` |
| **Frontend** | `settings.tsx` account/privacy tabs |

### 8.12 Dashboard & workspace shell

| | |
|--|--|
| **What** | Home metrics, activity, profile completion toast, sidebar |
| **Why** | Orientation after login |
| **How** | `GET /me/bootstrap`, activity feed; shell listens for profile update events |
| **Backend** | `api/router.py` bootstrap/activity |
| **Frontend** | `workspace-shell.tsx`, `dashboard.tsx`, profile toast |

---

## 9. Data flow end-to-end

### Typical ATS + improve journey

```text
User signs up
  → auth (service.py + router)
  → profile rows created

User uploads resume PDF
  → document_parsing (text + sections)
  → resume_versions (review_required)
  → user confirms

User adds JD
  → confirm JD

User runs ATS
  → deterministic.score_resume (always)
  → score_resume_jd structured crew (try)
  → ats_analyses + ats_evidence
  → improvement_brief (Advisor)
  → UI report

User edits / AI improves
  → Scout gaps from evidence
  → Editor NVIDIA rewrites
  → Guardian validation
  → apply in place
  → optional export + re-score
```

### What is **not** in the flow

- No chunking → embeddings → cosine for ATS  
- No browser-side AI keys  
- No auto-invented career history  

---

## 10. API map

**Base:** `{API origin}/api/v1`  
**Composition:** `backend/app/main.py` includes `api/router.py` + ATS scoring router  
**Docs:** `http://127.0.0.1:8000/docs` when `APP_ENV != production`

| Area | Examples |
|------|----------|
| Health | `GET /health`, `GET /health/database`, `GET /agents/status` |
| Auth | `POST /auth/sign-up`, `/sign-in`, `/session`, `/sign-out`, … |
| Workspace | `GET /me/bootstrap`, `GET /me/activity` |
| Profile | `GET/PATCH /profile`, avatar, preferences, CRUD resources, from-resume |
| Resumes | `/resumes`, versions, confirm, preview, activate |
| Improvements | `/resume-improvements`, suggestions, apply, manual-edit, exports |
| JD / ATS | `/job-descriptions`, `/ats-analyses`, evidence, `POST /ats/score` |
| Interviews | `/interviews`, start, responses, complete |
| Jobs / learning | `/jobs`, `/saved-jobs`, `/learning-paths` |
| Settings / account | `/settings/*`, `DELETE /account` |
| Files | `GET /files/{bucket}/{path}` |

---

## 11. Frontend routes & UI

| Area | Routes | Feature code |
|------|--------|--------------|
| Marketing | `/` | `features/marketing` |
| Auth | `/sign-in`, `/sign-up`, `/forgot-password`, … | `features/auth` |
| Onboarding | `/onboarding` | `features/onboarding` |
| Dashboard | `/dashboard` | `features/dashboard` |
| Resume / ATS | `/resume-analysis/*` | `features/resume` |
| Interview | `/mock-interview/*` | `features/interview` |
| Jobs | `/jobs/*` | `features/jobs` |
| Learning | `/learning/*` | `features/learning` |
| Settings | `/settings/*` | `features/settings` |

**Shared UI:** `frontend/src/shared/ui/primitives.tsx`  
**Global styles / type:** `frontend/src/app/globals.css`

---

## 12. Database & storage

### Schema

- **File:** `db/schema.sql`  
- **Apply:** `scripts/setup/migrate-local-db.py` (via `npm run setup` / preflight)

### Major tables (conceptual)

| Group | Tables |
|-------|--------|
| Identity | `users`, `profiles` |
| Profile data | skills, experiences, education, projects, certifications, languages, links, preferences |
| Resume / JD / ATS | `resumes`, `resume_versions`, `job_descriptions`, `ats_analyses`, `ats_evidence` |
| Improve | `resume_improvement_runs`, `resume_suggestions`, `resume_exports` |
| Interview | sessions, questions, responses, reports |
| Jobs / learning | `jobs`, `saved_jobs`, learning_* |
| Ops | activity_events, notification/privacy prefs |

### Storage buckets (env)

| Bucket env | Typical contents |
|------------|------------------|
| `DOCUMENT_BUCKET` | Resumes, JDs, exports |
| `AVATAR_BUCKET` | Profile pictures (≤ 3 MB default) |
| `INTERVIEW_BUCKET` | Interview media |

Paths are user-prefixed (`{user_id}/...`) and served only with auth.

### Database alternatives

| Current | Alternatives | Why we stay SQLite |
|---------|--------------|--------------------|
| SQLite file | Postgres + SQLAlchemy | Simpler local install; single file |
| Fluent client | ORM | Less migration surface for this app size |

---

## 13. Environment & setup

### Prerequisites

1. **Node.js** (LTS) + npm  
2. **Python 3.11–3.13** (3.12 preferred; **not 3.14+**)  
3. No separate database server  
4. Optional: `NVIDIA_API_KEY`, `GROQ_API_KEY`

### Install & run

```powershell
cd "D:\CDAC PROJECT\career-copilot_v1"
copy .env.example .env
# Edit AUTH_SECRET and optional API keys

npm run setup
npm run dev
```

| Service | URL |
|---------|-----|
| Website | http://localhost:3000 |
| API | http://127.0.0.1:8000 |
| OpenAPI | http://127.0.0.1:8000/docs |

Separate services: `npm run dev:frontend`, `npm run dev:backend`.

Python override:

```powershell
$env:CAREER_COPILOT_PYTHON = "C:\Path\To\Python312\python.exe"
$env:CAREER_COPILOT_RECREATE_VENV = "1"
npm run setup
```

### Complete `.env.example` (annotated)

```env
# Frontend / API
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000   # Browser / proxy target
PUBLIC_API_BASE_URL=http://127.0.0.1:8000        # Server-side Next → API
FRONTEND_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
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

# Limits
DOCUMENT_MAX_BYTES=10485760
AVATAR_MAX_BYTES=3145728
INTERVIEW_MEDIA_MAX_BYTES=262144000
EXPORT_SIGNED_URL_SECONDS=300

# ATS structured scoring provider: groq | nvidia
LLM_PROVIDER=groq

# NVIDIA (server-only)
NVIDIA_API_KEY=
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=deepseek-3.2
NVIDIA_TIMEOUT_SECONDS=90
NVIDIA_MAX_RETRIES=2
NVIDIA_MAX_OUTPUT_TOKENS=4096
NVIDIA_TEMPERATURE=0.2
NVIDIA_PROMPT_VERSION=resume-improvement-v1

# Groq (server-only)
GROQ_API_KEY=
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_TIMEOUT_SECONDS=45
GROQ_MAX_RETRIES=2
GROQ_MAX_OUTPUT_TOKENS=2048
GROQ_TEMPERATURE=0.4

# Resume improvement caps
IMPROVEMENT_MAX_SECTIONS=4
IMPROVEMENT_MAX_SOURCE_CHARS=30000
IMPROVEMENT_MAX_JD_CHARS=12000

# Installer / audit
# CAREER_COPILOT_PYTHON=C:\Path\To\Python312\python.exe
CAREER_COPILOT_RECREATE_VENV=0
CAREER_COPILOT_AUDIT_BASE=http://127.0.0.1:18004
```

Loaded by `backend/app/core/config.py` and `scripts/shared/load-env.mjs`.

---

## 14. Scripts & verification

| Command | Purpose | Entry |
|---------|---------|--------|
| `npm run setup` | Frontend ci + backend venv + DB | `scripts/setup/project.mjs` |
| `npm run dev` | Preflight + API + Next | `scripts/dev/*` |
| `npm run db:setup` | Schema + DB check | preflight |
| `npm run check:env` | Env presence | `diagnostics/verify-environment.mjs` |
| `npm run check:secrets` | Secret scan | `diagnostics/check-secrets.mjs` |
| `npm run check:boundaries` | Import boundaries | `scripts/verify-boundaries.mjs` |
| `npm run lint` / `typecheck` / `build:frontend` | Frontend quality | `scripts/run-frontend.mjs` |
| `npm run test:backend` | pytest | `backend/tests` |

**Agent readiness at runtime:**

```text
GET /api/v1/health
GET /api/v1/agents/status
```

Optional backend extras:

```powershell
cd backend
.\.venv\Scripts\activate
pip install -e ".[docling]"
pip install -e ".[crewai]"
```

---

## 15. Design decisions & alternatives

| Area | We use | Why | Credible alternatives |
|------|--------|-----|------------------------|
| Auth | Local JWT + password hash | Offline, simple | Auth0, Clerk, Supabase Auth |
| DB | SQLite + custom client | Zero ops | Postgres + SQLAlchemy/Prisma |
| ATS core | Deterministic keywords | Explainable evidence | Phrase/synonym rules; commercial ATS API |
| ATS optional | Structured CrewAI score | Multi-parameter + gate | Pure LLM JSON without CrewAI |
| Semantic ATS | **Not used** | Honesty / audit | Embeddings + cosine (search use cases only) |
| Resume AI | Sequential crew + validator | Less hallucination | Single prompt; human-only |
| Profile fill | Rules + NVIDIA merge | Always a draft | Forms only |
| Interview | Groq or templates | Fast + offline | Static banks only |
| Fonts | Source Sans/Serif/Code | Classic premium UI | Inter, Geist, commercial brands |
| Branding | Text name | No logo asset | SVG mark if product needs it |
| State | Server DB | Truthful multi-device path | localStorage as sole store (**rejected**) |

### Improving ATS further (recommended direction, not all implemented)

1. Multi-word phrases + synonym map (still deterministic)  
2. Section-aware evidence on every hit  
3. Richer brief context + post-validate LLM prose  
4. Required vs preferred weighting  
5. Stronger parsing (Docling + headers)  

See product discussions: precision without switching the core score to embeddings.

---

## 16. Explicit non-goals

| Not a goal | Reality |
|------------|---------|
| Logo image brand kit | Text-only brand |
| Embedding / cosine ATS | Keyword + optional structured score |
| AI interview grading | Questions only |
| Invented resume experience | Validators + confirm gates |
| Browser AI keys | Server-only |
| Hosted multi-tenant cloud DB | Local SQLite |
| Email delivery in local auth | Stubs |
| Profile points for resume upload | Checklist is profile fields only |
| Python 3.14 support | Pin `>=3.11,<3.14` |

---

## 17. Package identity

| Package | Version | Role |
|---------|---------|------|
| `career-copilot` (root npm) | 1.0.0 | Orchestration scripts |
| `career-copilot` (`frontend/` npm) | 1.0.0 | Next.js UI |
| `career-copilot-api` (Python) | 1.0.0 | FastAPI under `backend/app` |

---

## Quick start (minimal)

```powershell
copy .env.example .env
npm run setup
npm run dev
```

Open http://localhost:3000 → sign up → complete profile → upload resume → confirm → add JD → run ATS → edit/improve → practice interview.

**Live agent inventory:** `GET http://127.0.0.1:8000/api/v1/agents/status`

---

*This README is aligned with the current monorepo: feature packages under `backend/app/features`, providers under `backend/app/agents`, Next app under `frontend/`, local SQLite, NVIDIA `deepseek-3.2`, Groq `llama-3.3-70b-versatile`, Source Sans/Serif/Code typography, and no brand logo assets. Additional architecture notes: `docs/architecture.md`.*
