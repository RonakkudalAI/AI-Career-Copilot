<!-- prettier-ignore -->
<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./frontend/public/brand/career-copilot-dark.png" />
  <img src="./frontend/public/brand/career-copilot-light.png" alt="Career Copilot" height="72" />
</picture>

# Career Copilot

**Private career workspace for candidates** — evidence-grounded resume analysis, ATS scoring, interview practice, learning paths, and job matching.

[Features](#features) · [Getting started](#getting-started) · [Architecture](#architecture) · [Configuration](#configuration) · [API](#api) · [Docs](#documentation) · [Testing](#testing)

![Version](https://img.shields.io/badge/version-1.0.0-0f3b82?style=flat-square)
![Node](https://img.shields.io/badge/Node.js-20%2B-3c873a?style=flat-square)
![Python](https://img.shields.io/badge/Python-3.11–3.13-3776ab?style=flat-square)
![Stack](https://img.shields.io/badge/Vite%20%2B%20FastAPI%20%2B%20Firestore-111827?style=flat-square)

</div>

---

## What is this?

Career Copilot is a monorepo web app where a candidate can:

1. Build a profile and upload a resume (PDF/DOCX)  
2. Confirm extracted sections (nothing unreviewed drives scoring)  
3. Score the resume against a confirmed job description with **exact keyword evidence**  
4. Practice mock interviews (optional browser voice Q&A)  
5. Generate YouTube learning paths from ATS gaps  
6. Browse job recommendations grounded in confirmed resume text  

> [!IMPORTANT]
> **Do not invent the candidate’s career.**  
> Only text the user types, uploads, **confirms**, or explicitly accepts is used.  
> LLM / YouTube / service keys stay on the server. The browser never talks to Firestore directly.

| Layer | Technology |
|-------|------------|
| Frontend | Vite, React 19, TypeScript, Tailwind CSS 4, React Router 7 |
| Backend | FastAPI, Pydantic v2, Uvicorn |
| Data | Cloud Firestore (Admin SDK) |
| Files | Supabase Storage (private; streamed via authenticated API) |
| LLMs | Groq preferred (`LLM_PROVIDER=groq`), NVIDIA fallback; deterministic fallbacks |
| Crews | Official `crewai` when installed; otherwise built-in sequential orchestrators |

---

## Features

| Area | What you get |
|------|----------------|
| **Auth** | Email/password (scrypt) + app JWT; optional Google via Firebase ID-token exchange |
| **Profile** | Structured fields, avatar, completion checklist (0–100), fill-from-resume preview → apply |
| **Resume / JD** | Upload or paste → review → **confirm** |
| **ATS** | Deterministic keyword coverage (`evidence-keyword-coverage-v4`); history shows resume + JD used |
| **Interviews** | Question packs + practice sessions; Groq Orpheus / browser TTS + STT; practice feedback (coaching, not hiring scores) |
| **Learning** | ATS gaps → YouTube (API or search URLs) + allowlisted educational search links (`ats-mixed-learning-v1`) |
| **Jobs** | Evidence-based recommendations (`evidence-keyword-match-v1`); FreeHire sync; saved/pipeline tracking |
| **Resume improve** | Evidence-checked rewrite suggestions via sequential crew |
| **Account wipe** | Confirm with `DELETE MY ACCOUNT` |

### Not included (by design)

- Invented skills, employers, metrics, or YouTube video IDs  
- AI **hiring** decisions or “you will get the job” prediction scores (practice coaching feedback may still exist)  
- Product-path embedding / cosine-similarity ATS  
- Direct browser access to Firestore or storage service keys  

---

## Getting started

### Prerequisites

- Node.js **20+**
- Python **3.11–3.13** (repo pin: 3.12)
- Firebase project with **Firestore** + service-account JSON  
- Supabase project with a **private Storage** bucket  

### 1. Configure environment

```bash
git clone <repo-url> career-copilot
cd career-copilot
cp .env.example .env   # Windows: copy .env.example .env
```

Set at least:

| Variable | Role |
|----------|------|
| `AUTH_SECRET` | JWT signing secret |
| `FIREBASE_PROJECT_ID` | Firestore project |
| `FIREBASE_CREDENTIALS_PATH` | Service-account JSON path |
| `FIREBASE_DATABASE_ID` | e.g. `(default)` or a named DB |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service role |
| `SUPABASE_STORAGE_BUCKET` | Private bucket name |
| `VITE_FIREBASE_*` | Web client config (Google sign-in) |

Optional: `GROQ_*`, `NVIDIA_*`, `YOUTUBE_API_KEY`, `FREEHIRE_*`, `LLM_PROVIDER` (default `groq`).

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

### 2. Install

```bash
npm run setup
```

Creates the backend venv, installs the API package, installs frontend deps, and checks Firestore.

Optional:

```bash
backend\.venv\Scripts\python.exe -m pip install -e "backend/.[crewai]"
backend\.venv\Scripts\python.exe -m pip install -e "backend/.[pdf-extras]"
```

### 3. Run

```bash
npm run dev
```

All product work runs **synchronously inside the API request** (timeouts, RPM limits, and deterministic fallbacks). There is no separate Celery/worker process.

| Service | URL |
|---------|-----|
| App | http://127.0.0.1:3000 |
| API | http://127.0.0.1:8000 |
| OpenAPI (dev) | http://127.0.0.1:8000/docs |

```bash
# halves
npm run dev:frontend
npm run dev:backend
```

### Sanity checks

```bash
curl -s http://127.0.0.1:8000/api/v1/health/live
curl -s http://127.0.0.1:8000/api/v1/health
curl -s http://127.0.0.1:3000/api/backend/health
npm run check:env
```

---

## Architecture

```text
Browser (Vite + React)
  Authorization: Bearer <JWT>
        │
        ├─ /api/backend/*  ──Vite proxy──►  FastAPI /api/v1/*
        └─ /api/files/*    ──Vite proxy──►  FastAPI /api/v1/files/*
                │
                ▼
           FastAPI (ownership enforced)
                ├─ Firestore      (rows)
                ├─ Supabase Storage (files under {user_id}/…)
                └─ Groq / NVIDIA / YouTube / FreeHire  (server .env)
```

| Path | Responsibility |
|------|----------------|
| `frontend/src/` | UI features: auth, dashboard, resume, interview, learning, jobs, settings |
| `backend/app/main.py` | FastAPI app, CORS, request IDs |
| `backend/app/api/` | HTTP routes and schemas |
| `backend/app/database/` | Firestore + storage adapters, ownership helpers |
| `backend/app/agents/` | Provider clients, prompts, preferred-provider routing |
| `backend/app/features/` | Domain logic (auth, parsing, ATS, interview, …) |
| `docs/DOCUMENTATION.md` | Unified technical documentation |

> [!NOTE]
> Leave `VITE_API_BASE_URL` unset for local dev so the app uses the same-origin `/api/backend` proxy. Set it only for static hosting that cannot proxy.

---

## How the product path works

### Confirm gate

Uploaded resumes and JDs are extracted, shown for review, then **confirmed**.  
ATS, learning generation, interview prep evidence, and job-match evidence require **confirmed** sources.

### ATS score

- Algorithm: **`evidence-keyword-coverage-v4`** (`backend/app/features/ats/ats_score.py`)  
- Exact resume line as evidence when matched; `null` when missing  
- Optional LLM “improvement brief” from missing terms only (never invents experience)  
- History endpoints attach **which resume + JD** were used  

### Interviews

- Questions: Groq structured output, or **local templates** if the provider fails  
- Interviewer TTS: Groq Orpheus, then NVIDIA Magpie, then Fish Audio, then browser speech  
- Practice feedback + session report (Groq or deterministic heuristics) — **coaching only**, not a hiring decision  

### Learning & jobs

- Learning: ATS gaps → YouTube API or search URLs + allowlisted article searches (`ats-mixed-learning-v1`)  
- Jobs: score catalog against confirmed resume evidence (`evidence-keyword-match-v1`); FreeHire sync

### Agents

Prefer `LLM_PROVIDER` (default **groq**), then the other configured provider. Status: `GET /api/v1/agents/status`. Full agent table, prompts, crews, and end-to-end how-it-works: [docs/DOCUMENTATION.md](./docs/DOCUMENTATION.md).

---

## Configuration

One root `.env` (template: [`.env.example`](./.env.example)). Only `VITE_*` keys are exposed to the browser.

| Group | Examples |
|-------|----------|
| App / CORS | `APP_ENV`, `API_V1_PREFIX`, `PUBLIC_API_BASE_URL`, `FRONTEND_ORIGINS` |
| Auth | `AUTH_SECRET`, `JWT_TTL_SECONDS` |
| Firestore | `FIREBASE_PROJECT_ID`, `FIREBASE_CREDENTIALS_PATH`, `FIREBASE_DATABASE_ID` |
| Storage | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `DOCUMENT_BUCKET`, `AVATAR_BUCKET` |
| LLM | `LLM_PROVIDER`, `GROQ_*`, `NVIDIA_*`, `LLM_RPM_LIMIT` |
| Optional | `YOUTUBE_API_KEY`, `FREEHIRE_*`, `GROQ_TTS_*` |

---

## API

Browser base in local dev: **`/api/backend`** → FastAPI **`/api/v1`**.

| Area | Endpoints (prefix `/api/v1`) |
|------|------------------------------|
| Auth | `POST /auth/sign-up`, `/sign-in`, `/session`, `/firebase`, `/sign-out`, `/update-password` |
| Health | `GET /health/live`, `/health`, `/health/ready`, `/health/database`, `/agents/status` |
| Me | `GET /me/bootstrap`, `/me/activity` |
| Profile | `/profile`, avatar, preferences, child resources, from-resume |
| Resumes / JDs | `/resumes`, versions, confirm; `/job-descriptions` |
| ATS | `/ats-analyses`, evidence; `/ats/score` |
| Improvement | `/resume-improvements*`, suggestions, apply, exports |
| Interview | `/interview-preparation`, `/interviews` (+ start / responses / complete / tts) |
| Learning | `/learning-paths`, `/learning-paths/generate` |
| Jobs | `/jobs`, recommendations, saved jobs, optional external sync |
| Files | `GET /files/{bucket}/{path}` (JWT; path under `{user_id}/`) |

Full map: [docs/api-reference.md](./docs/api-reference.md) · deep dive: [docs/DOCUMENTATION.md](./docs/DOCUMENTATION.md).

---

## Documentation

**Single source of truth:** [docs/DOCUMENTATION.md](./docs/DOCUMENTATION.md)

Covers aim, problem statement, tech stack, **how every subsystem works**, agents, data model, full API map, code map, frontend architecture, operations, Mermaid diagrams, and known contracts.

Satellite docs under `docs/` (architecture, API, data model, frontend, flows, operations, deployment, features/*) summarize and link back to that file. Production deployment instructions are in [docs/deployment.md](./docs/deployment.md).

---

## Testing

```bash
npm run test:backend
cd frontend && npm run test && npm run typecheck
```

| Check | Command |
|-------|---------|
| Env keys present | `npm run check:env` |
| Secret scan | `npm run check:secrets` |
| Firestore probe | `backend\.venv\Scripts\python.exe scripts/diagnostics/check-firestore.py` |
| Offline stack audit | `backend\.venv\Scripts\python.exe scripts/diagnostics/_audit_once.py` |
| API smoke (server up) | `backend\.venv\Scripts\python.exe scripts/diagnostics/e2e-smoke.py` |

---

## Project scripts

| Script | Purpose |
|--------|---------|
| `npm run setup` | Install everything |
| `npm run dev` | Preflight + frontend + backend |
| `npm run check:frontend` | Lint, types, tests, production build |
| `npm run test:backend` | Pytest |

---

## Design principles

1. **Evidence over invention** — confirmed text is the source of truth.  
2. **Server-enforced ownership** — every row and file path is scoped to the signed-in user.  
3. **Deterministic product ATS** — LLMs enrich; they do not own the score.  
4. **Degrade gracefully** — missing LLM/YouTube/FreeHire reduces features, not the whole app.

Full technical detail: [docs/DOCUMENTATION.md](./docs/DOCUMENTATION.md).
