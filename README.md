<!-- prettier-ignore -->
<div align="center">

<img src="./frontend/public/icon.svg" alt="Career Copilot" height="72" />

# Career Copilot

**Private career workspace for candidates** — evidence-grounded resume analysis, ATS scoring, interview practice, YouTube learning paths, and job matching.

[Overview](#overview) · [Features](#features) · [Architecture](#architecture) · [Getting started](#getting-started) · [How it works](#how-it-works) · [Documentation](#documentation) · [Configuration](#configuration) · [API](#api-map) · [Testing](#testing)

![Version](https://img.shields.io/badge/version-1.0.0-0f3b82?style=flat-square)
![Node](https://img.shields.io/badge/Node.js-20%2B-3c873a?style=flat-square)
![Python](https://img.shields.io/badge/Python-3.11–3.13-3776ab?style=flat-square)
![Stack](https://img.shields.io/badge/Vite%20%2B%20FastAPI%20%2B%20Firestore-111827?style=flat-square)

</div>

---

## Overview

Career Copilot is a full-stack monorepo that helps candidates manage a professional profile, parse and confirm resumes, score them against job descriptions with **auditable keyword evidence**, prepare for interviews, build **YouTube learning paths** from ATS gaps, and browse **job recommendations** grounded in confirmed resume content.

> [!IMPORTANT]
> **Golden rule — do not invent the candidate’s career.**  
> The product only uses what the user types, uploads, **confirms**, or explicitly accepts.  
> **Cloud Firestore + Firebase Storage** are the system of record. LLM keys, YouTube keys, and Firebase Admin credentials stay on the server.

| Layer | Stack |
|-------|--------|
| Frontend | Vite, React 19, TypeScript, Tailwind CSS 4, React Router 7 |
| Backend | FastAPI, Pydantic v2, Uvicorn |
| Data | Firebase Cloud Firestore + Firebase Storage |
| Document AI | pypdf (PDF; optional PyMuPDF/pdfplumber), python-docx (DOCX), optional Groq/NVIDIA section segregation |
| LLM providers | Groq and NVIDIA Integrate API (server-only, with deterministic fallbacks) |
| Jobs (optional) | Adzuna API sync |
| Learning (optional) | YouTube Data API v3 |

---

## Features

| Capability | Description |
|------------|-------------|
| **Auth** | Email/password with scrypt hashes + HS256 JWT; optional Firebase Google sign-in exchange |
| **Profile workspace** | Profile, avatar, skills, experience, education, preferences, deterministic completion checklist (0–100) |
| **Resume pipeline** | Upload PDF/DOCX → layout-aware extract → section review → user confirm |
| **Job descriptions** | Paste or upload JD → review → confirm (required before ATS) |
| **ATS score (0–100%)** | Product path is **deterministic keyword coverage** (`evidence-keyword-coverage-v3`) with exact resume quotes |
| **ATS improvement brief** | LLM or deterministic brief from missing keywords only — never invents experience |
| **Profile fill from resume** | Preview draft → user apply; NVIDIA + deterministic merge |
| **Mock interviews** | Question packs + practice sessions; **no AI grading of answers** |
| **Interview preparation** | Evidence-grounded packs from confirmed resume + JD |
| **Learning paths** | ATS gaps → planner → exact YouTube videos (or search-page fallback) |
| **Jobs** | Local catalog + recommendations scored against confirmed resume evidence; optional Adzuna sync |
| **Account deletion** | Confirmation phrase + cascade of owned data and storage purge |
| **Demo mode** | Offline frontend mock via cookie `career_copilot_demo=1` (no FastAPI calls) |

### Intentionally not shipped

| Non-goal | Reality |
|----------|---------|
| Invented skills / experience | Blocked by evidence grounding and confirm gates |
| Invented YouTube video IDs | Only YouTube Data API results, or a search-page URL fallback |
| In-app full resume editor after ATS | Removed; re-upload a revised file instead |
| AI interview scoring / hiring prediction | Questions and practice only |
| Embedding / cosine-similarity ATS | Not used on the product scoring path |
| Browser-side AI or YouTube keys | Server `.env` only |

---

## Architecture

```text
Browser (Vite + React)
  frontend/src/App.tsx  ·  frontend/src/features/*
  Token: localStorage career_copilot_access_token
         cookie     career_copilot_session  (same JWT)
        │
        ├─► /api/backend/*   Vite BFF proxy → FastAPI /api/v1/*
        └─► /api/files/*     Vite BFF proxy → FastAPI file download
                │
                ▼
FastAPI  backend/app/main.py
  Prefix: API_V1_PREFIX (default /api/v1)
  Auth:   JWT HS256 (AUTH_SECRET) → CurrentUser
  CORS:   FRONTEND_ORIGINS + credentials
        │
        ├─► Firestore   FIREBASE_PROJECT_ID + service-account credentials
        │     backend/app/database/client.py
        ├─► Storage     FIREBASE_STORAGE_BUCKET
        │     candidate-documents · candidate-avatars
        └─► Optional server services
              NVIDIA Integrate API  → structured LLM tasks
              Groq                  → interviews, learning, ATS brief, parser
              YouTube Data API v3   → exact learning-path videos
              pypdf / PyMuPDF / pdfplumber → fast PDF text extraction
              Adzuna                → optional external job sync
```

### Request path

1. UI calls `apiRequest()` in `frontend/src/shared/api/client.ts`.
2. Browser base is `/api/backend` in local dev (same-origin BFF; avoids browser CORS).
3. Vite proxies `/api/backend/*` and `/api/files/*` to `{PUBLIC_API_BASE_URL}{API_V1_PREFIX}`.
4. Requests send `Authorization: Bearer <JWT>` and cookies (`credentials: "include"`).
5. FastAPI `get_current_user` validates JWT (header preferred, else session cookie).
6. Handlers enforce **user ownership** of every row.
7. Errors use `ApiError` with stable codes and `X-Request-ID` on every response.

> [!NOTE]
> Direct browser access to Firestore is **denied** (`firebase/firestore.rules`). All product data goes through the FastAPI Admin SDK path.

---

## Repository layout

```text
career-copilot/
├── README.md
├── package.json                 # root scripts (setup, dev, checks)
├── .env.example                 # single env template for UI + API
├── firebase/
│   ├── firestore.rules          # deny-all client access
│   └── storage.rules
├── scripts/
│   ├── setup/                   # project, backend, Firebase checks
│   ├── dev/                     # preflight, frontend, backend, run
│   ├── diagnostics/             # env, secrets, e2e-smoke, DB probes
│   └── shared/                  # load-env, ports, venv helpers
├── frontend/                    # Vite React app
│   ├── e2e/                     # Playwright
│   ├── public/icon.svg
│   └── src/
│       ├── features/            # auth, dashboard, resume, interview, …
│       ├── components/ui/       # shared primitives
│       └── shared/              # api client, config, theme, routes
└── backend/                     # career-copilot-api
    ├── pyproject.toml
    ├── tests/
    └── app/
        ├── main.py
        ├── core/                # config, constants, errors
        ├── api/                 # router, schemas
        ├── database/            # Firestore client, repository, activity
        ├── agents/              # registry, prompts, providers
        └── features/
            ├── auth/
            ├── profile/
            ├── document_parsing/
            ├── resume_management/
            ├── resume_improvement/
            ├── ats/             # product scorer + optional library
            ├── interview/
            ├── learning/
            └── career_matching.py
```

---

## Getting started

### Prerequisites

- **Node.js 20+**
- **Python 3.11–3.13** (repo pin: `3.12`; `requires-python = ">=3.11,<3.14"`)
- A Firebase project with **Cloud Firestore** and **Storage**
- Firebase service-account JSON for the Admin SDK (never commit this file)

### 1. Clone and configure environment

```bash
git clone <your-repo-url> career-copilot
cd career-copilot
cp .env.example .env   # Windows: copy .env.example .env
```

Edit `.env` and set at least:

| Variable | Purpose |
|----------|---------|
| `AUTH_SECRET` | Long random secret for HS256 JWT signing |
| `FIREBASE_PROJECT_ID` | Firebase project id |
| `FIREBASE_CREDENTIALS_PATH` | Path to service-account JSON (e.g. `./secrets/firebase-service-account.json`) |
| `FIREBASE_STORAGE_BUCKET` | Usually `{project-id}.appspot.com` |
| `VITE_FIREBASE_*` | Web app config (for Google sign-in UI, if used) |

Optional for full AI/learning features:

- `GROQ_API_KEY` + `GROQ_MODEL` — interviews, ATS brief fallback, learning planner, resume parser  
- `NVIDIA_API_KEY` + `NVIDIA_MODEL` — profile fill, resume improvement  
- `YOUTUBE_API_KEY` — exact video IDs in learning paths  
- `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` — external job sync  

> [!TIP]
> Generate a strong auth secret:  
> `python -c "import secrets; print(secrets.token_urlsafe(48))"`

### 2. Install

```bash
npm run setup
```

This installs frontend dependencies, creates `backend/.venv`, installs the API package, and verifies the configured Firestore connection.

PDF text uses **pypdf** by default (optional faster backends via `pip install -e "backend/.[pdf-extras]"` for PyMuPDF and pdfplumber).

Optional official CrewAI package (Python &lt; 3.14):

```bash
backend\.venv\Scripts\python.exe -m pip install -e "backend/.[crewai]"
```

Without it, built-in CrewAI-compatible orchestrators still run for learning and improvement.

### 3. Run

```bash
npm run dev
```

| Service | URL |
|---------|-----|
| Frontend | http://127.0.0.1:3000 |
| Backend | http://127.0.0.1:8000 |
| OpenAPI (non-production) | http://127.0.0.1:8000/docs |

Or run halves separately: `npm run dev:frontend` / `npm run dev:backend`.

### Useful scripts

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

---

## Documentation

In-depth technical docs live under [`docs/`](./docs/README.md): architecture, code map, data model, request flows with file citations, API reference, frontend, operations, and per-feature deep dives.

| Doc | Contents |
|-----|----------|
| [docs/README.md](./docs/README.md) | Documentation index |
| [docs/architecture.md](./docs/architecture.md) | Layers, trust boundaries, decisions |
| [docs/diagrams.md](./docs/diagrams.md) | Unified Mermaid system / flow / sequence diagrams |
| [docs/code-map.md](./docs/code-map.md) | File ownership map |
| [docs/flows.md](./docs/flows.md) | End-to-end flows with file citations |
| [docs/data-model.md](./docs/data-model.md) | Firestore + Storage model |
| [docs/api-reference.md](./docs/api-reference.md) | Endpoint map |
| [docs/frontend.md](./docs/frontend.md) | UI structure and BFF |
| [docs/operations.md](./docs/operations.md) | Setup, scripts, troubleshooting |
| [docs/features/](./docs/features/) | Auth, parsing, ATS, profile, interview, learning, jobs, improvement |

---

## How it works

### Authentication

| Item | Detail |
|------|--------|
| Password hash | **scrypt** (`n=2**14`, `r=8`, `p=1`), format `scrypt$salt_hex$digest_hex` |
| Min password length | 8 (`MIN_PASSWORD_LENGTH`) |
| Token | PyJWT **HS256**, claims `sub` (user id) + `email` |
| TTL | `JWT_TTL_SECONDS` (default 7 days) |
| Storage | `localStorage` + `career_copilot_session` cookie |
| Sign-up | Creates `users`, `profiles`, preference rows with compensating rollback |
| Account delete | Phrase must be exactly `DELETE MY ACCOUNT`; purges storage then owned data |

Protected UI routes redirect unauthenticated users to `/sign-in`. **Ownership is always enforced server-side.**

### Document parsing

**Entry:** `parse_document_bytes` in `backend/app/features/document_parsing/pipeline.py`.

| Format | Engine | Notes |
|--------|--------|-------|
| PDF | **pypdf** (+ optional PyMuPDF / pdfplumber) | Fast extract via `extractors/pdf.py` |
| DOCX | python-docx | Native paragraphs + tables |

Pipeline:

1. Extract plain text off the async event loop (`asyncio.to_thread`) so health/auth stay responsive.
2. Segregate sections via LLM line-number assignment (prefers `LLM_PROVIDER`, falls back to the other provider) **or** structural heuristics.
3. Reconstruct section body only from source lines — the model never authors resume text.
4. Store `schema_version: resume-extraction-v1` with `sections`, `warnings`, `extraction_method`.

Statuses: `pending` → `processing` → `review_required` → **`confirmed`** (or `failed`).  
ATS, learning, job recommendations, and preparation require **confirmed** resume/JD content.

### Product ATS score (primary)

**File:** `backend/app/features/ats/ats_score.py`  
**Algorithm:** `evidence-keyword-coverage-v3`  
**Endpoints:** `POST /api/v1/ats-analyses`, `POST /api/v1/ats/score`

1. Extract up to **80** JD terms from requirements/skills-style lines (required weight **2.0**, preferred **1.0**).
2. Match against resume lines (prefer confirmed structured sections) with alias groups (`js` → javascript, `k8s` → kubernetes, …).
3. Credit: **strong** = 1.0, **partial** = 0.5, **missing** = 0.0.
4. Score:

\[
W = \sum_i w_i,\quad
\text{contribution}_i = 100 \times \frac{w_i \cdot c_i}{W},\quad
\text{overall\_score} = \mathrm{round}\Bigl(\sum_i \text{contribution}_i,\; 2\Bigr)
\]

Matched evidence is the **exact resume line** (never rewritten). Missing evidence is `null` (never invented).

> [!NOTE]
> Product ATS is **not** a hiring prediction, embedding similarity, or LLM composite score.  
> An optional structured LLM composite scorer lives under `features/ats/agent/` for library/tests only and is **not** what `POST /ats-analyses` persists today.

### Profile completion (0–100)

**File:** `backend/app/features/profile/completion.py`  
Recalculated on profile mutations — **not** raised by resume upload alone.

| Points | Item |
|-------:|------|
| 10 | Full name |
| 8 | Location |
| 10 | Current role |
| 8 | Target roles |
| 22 | Experience rows **or** fresher (`years_experience = 0`) |
| 17 | At least one skill |
| 10 | Education |
| 5 | Work modes |
| 5 | Preferred locations |
| 5 | Professional link |

### Job recommendation match

**File:** `backend/app/features/career_matching.py`  
**Algorithm:** `evidence-keyword-match-v1`

- Requirements can contribute up to **80** points (matched fraction × 80).
- Title/role hits can add up to **20** more (`min(role_hits, 4) × 5`).
- Evidence comes from confirmed skills + skills-like resume sections + resume plain text.

### Learning paths

**Algorithm:** `ats-youtube-api-v1`  
**Endpoint:** `POST /api/v1/learning-paths/generate`  
**Requires:** at least one completed ATS analysis.

1. **Gap analyst** — requirements with `not_found` or `partial_match`.
2. **YouTube planner** — Groq or deterministic search queries (no video IDs from the model).
3. **Materializer** — YouTube Data API v3 search (`type=video`, `safeSearch=strict`, embeddable) → exact `watch?v=` URLs; if API is unavailable, store **search results page URLs only**.

### Interview loop

1. Optional preparation pack from resume + JD evidence.  
2. Create session → start → structured questions (Groq) or local templates.  
3. Store responses; complete session.  
4. **No AI grading** of candidate answers.

### Primary product journey (ATS loop)

```text
Sign up / sign in
  → optional onboarding / profile
  → upload resume → review sections → confirm
  → paste/upload JD → confirm
  → POST /ats-analyses → score + evidence + optional brief
  → improve offline → re-upload → confirm → re-score
  → optional: learning path / interview prep / job recommendations
```

---

## Models, providers & agents

Live status: `GET /api/v1/agents/status` and fields on `GET /api/v1/health`.  
Registry: `backend/app/agents/registry.py` · Prompts: `backend/app/agents/prompts/`.

| Agent ID | Provider | Role | Fallback |
|----------|----------|------|----------|
| `resume_improvement` | NVIDIA | Evidence-checked rewrite suggestions | Manual edit / export |
| `resume_improvement_crew` | NVIDIA + tools | Gap → improve → validate | Built-in orchestrator if CrewAI package missing |
| `profile_fill` | NVIDIA | Profile draft from resume | Deterministic mapping |
| `interview_questions` | Groq | Mock interview questions | Local templates |
| `ats_improvement_brief` | NVIDIA or Groq | Brief from missing keywords | Deterministic brief |
| `learning_youtube_crew` | Groq + YouTube API | Gap → plan → exact videos | Deterministic plan + search URLs |
| `document_section_extract` | NVIDIA → Groq on 429 | Section segregation by line numbers | Structural layout parser |

**Product ATS score itself is not an LLM agent** — it is pure keyword coverage in `ats_score.py`.

---

## Configuration

One root `.env` (copy from `.env.example`). Browser-safe values use the `VITE_` prefix only.

### Core

| Variable | Purpose | Default / notes |
|----------|---------|-----------------|
| `APP_NAME` | API title | Career Copilot API |
| `APP_ENV` | `development` \| `test` \| `production` | OpenAPI disabled in production |
| `API_V1_PREFIX` | Versioned API prefix | `/api/v1` |
| `PUBLIC_API_BASE_URL` | Upstream FastAPI origin | `http://127.0.0.1:8000` |
| `FRONTEND_ORIGINS` | CORS allow-list | localhost + 127.0.0.1:3000 |
| `AUTH_SECRET` | JWT signing secret | **required** |
| `JWT_TTL_SECONDS` | Access token lifetime | `604800` (7 days) |
| `FIREBASE_PROJECT_ID` | Firestore project | required |
| `FIREBASE_CREDENTIALS_PATH` | Service-account JSON path | required locally |
| `FIREBASE_STORAGE_BUCKET` | Storage bucket | `{project}.appspot.com` |
| `DOCUMENT_BUCKET` / `AVATAR_BUCKET` | Logical prefixes | `candidate-documents` / `candidate-avatars` |
| `DOCUMENT_MAX_BYTES` | Resume/JD max size | 10 MiB |
| `AVATAR_MAX_BYTES` | Avatar max size | 3 MiB |

### LLM & external APIs

| Variable | Purpose |
|----------|---------|
| `LLM_PROVIDER` | Primary agent provider: `groq` (default) or `nvidia`. Other configured provider is fallback. |
| `NVIDIA_*` | Integrate API key, model, timeouts, tokens |
| `GROQ_*` | Chat API key, model, timeouts, tokens |
| `GROQ_RESUME_PARSER_*` | Structured resume parser model + limits |
| `LLM_RPM_LIMIT` | Shared chat RPM budget (default 40) |
| `LLM_ALLOW_REPAIR` | Second pass to repair invalid JSON |
| `YOUTUBE_API_KEY` | Data API v3 (server-only) |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | Optional job sync |
| `IMPROVEMENT_MAX_*` | Caps for resume improvement runs |

See `.env.example` for the full annotated list.

---

## Frontend routes

| Route | Purpose |
|-------|---------|
| `/` | Marketing landing |
| `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`, `/verify-email` | Auth UI |
| `/onboarding` | First-time profile |
| `/dashboard` | Workspace home |
| `/resume-analysis`, `/resume-analysis/new`, `/review`, `/report/:id` | Resume + ATS |
| `/mock-interview`, `/setup`, `/preparation`, `/session/:id`, `/report/:id` | Interviews |
| `/learning`, `/learning/:pathId`, `/learning/topic/:topicId` | Learning paths |
| `/jobs`, `/jobs/saved`, `/jobs/:jobId` | Jobs |
| `/settings/profile`, `/account`, `/preferences`, `/privacy` | Settings |

Route helpers: `frontend/src/shared/routes.ts` · Config: `frontend/src/shared/config.ts`.

---

## API map

Base prefix: **`/api/v1`** (browser: **`/api/backend/...`** maps 1:1 in local dev).

### Auth & health

| Method | Path | Auth |
|--------|------|------|
| POST | `/auth/sign-up`, `/auth/sign-in` | No |
| POST | `/auth/session`, `/auth/update-password` | Yes |
| POST | `/auth/sign-out` | No (clears cookie) |
| POST | `/auth/firebase` | Firebase ID token exchange |
| POST | `/auth/resend`, `/auth/reset-password` | Stubs (email not configured) |
| GET | `/health`, `/health/database`, `/agents/status` | No |
| GET | `/files/{bucket}/{path}` | Yes (path must start with `{user_id}/`) |

### Profile, resumes, JDs

| Area | Paths |
|------|--------|
| Me | `GET /me/bootstrap`, `GET /me/activity` |
| Profile | `GET/PATCH /profile`, avatar, preferences, skills/experience/… resources |
| From resume | `POST /profile/from-resume/preview`, `/preview-upload`, `/apply` |
| Resumes | `GET/POST /resumes`, versions, preview, activate, confirm extraction |
| JDs | `GET/POST /job-descriptions`, upload, metadata, confirm |

### ATS, improvement, interview, learning, jobs

| Area | Paths |
|------|--------|
| ATS | `GET/POST /ats-analyses`, evidence, suggestions, `POST /ats/score` (no DB write) |
| Improvement | `/resume-improvements`, suggestions accept/reject, apply, exports |
| Interview | `/interview-preparation`, `/interviews` (+ start/responses/complete) |
| Learning | `/learning-paths`, `/learning-paths/generate`, item progress |
| Jobs | `/jobs`, `/jobs/external/sync`, `/job-recommendations`, `/saved-jobs` |
| Settings | `/settings`, notifications, privacy, `DELETE /account` |

Interactive docs (development): http://127.0.0.1:8000/docs

---

## Database & storage

| Group | Collections / tables |
|-------|----------------------|
| Identity | `users`, `profiles` |
| Profile content | skills, experiences, projects, education, certifications, languages, links, preferences |
| Documents | `resumes`, `resume_versions`, `job_descriptions` |
| ATS | `ats_analyses`, `ats_evidence` |
| Interview | sessions, questions, responses, reports |
| Learning | paths, items, resources |
| Jobs | `jobs`, `job_recommendations`, `saved_jobs` |
| Settings / activity | notification & privacy preferences, `activity_events` |

Files live under Firebase Storage:

```text
{FIREBASE_STORAGE_BUCKET}/{DOCUMENT_BUCKET|AVATAR_BUCKET}/{user_id}/...
```

Downloads go through `GET /api/v1/files/{bucket}/{path}` with JWT ownership checks.

---

## Testing

| Area | Location |
|------|----------|
| ATS scoring, gate, schemas | `backend/tests/ats_scoring/` |
| Document parsing / sections / performance | `backend/tests/document_parsing/` |
| Interview preparation | `backend/tests/interview/` |
| Learning YouTube crew | `backend/tests/learning/` |
| Auth, avatars, jobs sync, rate limit | `backend/tests/test_*.py` |
| Resume fixtures | `backend/tests/fixtures/resumes/` |
| Frontend unit | `frontend` (Vitest) |
| Landing e2e | `frontend/e2e/landing.spec.ts` (Playwright) |

```bash
npm run test:backend
cd frontend && npm run test
cd frontend && npm run e2e:landing
```

API workflow smoke: `scripts/diagnostics/e2e-smoke.py`.

---

## Design principles

1. **Evidence over invention** — resume/JD text and user confirmations are the source of truth.  
2. **Server-enforced ownership** — candidate data lives in Firestore + Storage; rules deny direct client access.  
3. **Server-side secrets** — NVIDIA, Groq, YouTube, Admin credentials never ship to the browser.  
4. **Explainable ATS** — one product scoring module, weighted keyword coverage, exact quotes.  
5. **Fast parse, simple review UI** — pypdf (and optional fast backends) for PDF text; sections only for confirmation.  
6. **YouTube without hallucination** — video IDs only from the YouTube API (or search-page fallback).  
7. **Delete what you create** — resumes, ATS analyses, interviews, learning paths, full account wipe.  
8. **Stable error contracts** — `ApiError` codes + `X-Request-ID` for every response.

---

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| Backend won’t start | `AUTH_SECRET`, `FIREBASE_*`, `npm run check:env` |
| Firestore errors | Service-account path, project id, `npm run firebase:check` |
| PDF parse fails | Install backend deps; optional `pdf-extras` for PyMuPDF/pdfplumber |
| Empty / weak LLM features | `GROQ_API_KEY` / `NVIDIA_API_KEY` and matching models; see `/agents/status` |
| Learning paths have only search links | Set `YOUTUBE_API_KEY` |
| CORS / cookie issues | `FRONTEND_ORIGINS` must include the exact browser origin |
| Frontend can’t reach API | Dev proxy relies on `PUBLIC_API_BASE_URL`; production needs reverse proxy or `VITE_API_BASE_URL` |

---

## Quick reference

| Question | Answer |
|----------|--------|
| How is product ATS scored? | `backend/app/features/ats/ats_score.py` |
| How is auth done? | scrypt + HS256 JWT + localStorage/cookie |
| How are PDFs parsed? | pypdf chain via `document_parsing/parsing/text_extract.py` + `extractors/pdf.py` |
| Profile completion points? | `features/profile/completion.py` |
| Job match formula? | `features/career_matching.py` |
| Learning videos? | `learning/youtube_api.py` + crew under `learning/agents/crew/` |
| API routes? | `backend/app/api/router.py` + feature routers |
| UI routes? | `frontend/src/App.tsx`, `frontend/src/shared/routes.ts` |
| Env template? | `.env.example` |
| Runtime agent inventory? | `GET /api/v1/agents/status` |

---

## Scaling notes

Career Copilot is cloud-backed (Firestore + Storage). Natural next steps if you outgrow a single API process:

- **Background workers** for PDF extraction, ATS scoring, and long LLM crews (keep the request path thin).  
- **Caching** (e.g. Redis) for job lists, bootstrap payloads, and YouTube quota-sensitive searches.  
- **Horizontal API replicas** behind a load balancer (stateless JWT + shared Firebase).  
- **CDN / reverse proxy** for the static frontend with same-origin `/api` routing.

---

*This README describes the current product path: Firebase-backed career workspace, pypdf-based PDF extraction, evidence-backed ATS keyword coverage (`evidence-keyword-coverage-v3`), optional structured LLM ATS library (non-product), YouTube Data API learning paths, mock interviews without AI grading, and BFF-proxied JWT auth. Prefer `/health` and `/agents/status` at runtime over assumptions about which keys are configured.*
