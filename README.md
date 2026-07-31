# Career Copilot

Production-oriented career preparation platform: profile building, resume/ATS analysis, evidence-bound resume improvement, mock interviews, jobs, and learning — backed by a local SQLite database and optional NVIDIA / Groq LLMs.

---

## 1. Project Overview

**Career Copilot** is a full-stack web application that helps candidates prepare for job applications without inventing career facts.

### Problem

Job seekers need practical tools that:

- Score a resume against a real job description with **auditable keyword evidence**
- Suggest resume improvements that stay grounded in **existing resume text**
- Generate mock-interview questions for practice
- Keep profile data, files, and activity in one **user-owned system of record**

Many tools either invent “AI career content,” hide how scores are computed, or scatter truth across browser local storage. Career Copilot does the opposite.

### Value proposition

| Principle | What it means in product terms |
|-----------|--------------------------------|
| **Truth over invention** | Agents rewrite or explain only what evidence supports. Users must confirm extracts and accept suggestions. |
| **Local ownership** | Auth, data, and files live in local SQLite + filesystem storage (not a hosted BaaS dependency). |
| **Graceful degradation** | Core flows work without LLM keys using deterministic scoring, templates, and rule-based extracts. |
| **Server-side AI** | NVIDIA and Groq API keys never ship to the browser. |

### What you can do

1. **Sign up / sign in** with email + password (local JWT sessions).
2. **Build a profile** (skills, experience, education, preferences, links) with a server-scored completion checklist.
3. **Upload a resume** (PDF/DOCX) → extract sections → review → confirm.
4. **Add a job description** → confirm → run **ATS analysis** (structured LLM scoring when available + deterministic keyword evidence).
5. **Edit the same resume in place**, optionally run **AI improvement** (crew: gap → improve → validate).
6. **Practice mock interviews** (Groq questions or local templates).
7. **Browse/save jobs** and manage **learning paths** from database-backed data.

### Golden rule

> The app must not invent your career. It works from what you type, upload, confirm, or explicitly accept. **SQLite + local storage is the system of record** — not browser localStorage for durable product data.

---

## 2. Complete Tech Stack

### Languages

| Technology | Role |
|------------|------|
| **TypeScript** | Next.js frontend |
| **Python 3.11–3.13** (prefer **3.12**) | FastAPI backend; **3.14+ is not supported** (`requires-python = ">=3.11,<3.14"`) |

### Frontend

| Technology | Role |
|------------|------|
| **Next.js (App Router)** | Pages, layouts, API route proxies |
| **React** | UI |
| **Tailwind CSS** | Styling (`@tailwindcss/postcss`) |
| **Lucide React** | Icons |
| **Motion** | Light animations |
| **Three.js / React Three Fiber / Drei** | Marketing landing globe |
| **@fontsource-variable/space-grotesk**, **@fontsource/ibm-plex-mono** | Typography |

### Backend / API

| Technology | Role |
|------------|------|
| **FastAPI** | HTTP API under `/api/v1` |
| **Uvicorn** | ASGI server |
| **Pydantic v2 / pydantic-settings** | Request/response models + root `.env` loading |
| **httpx** | Async HTTP to NVIDIA / Groq |
| **PyJWT[crypto]** | HS256 access tokens (`AUTH_SECRET`) |
| **python-multipart** | File uploads |
| **pypdf**, **python-docx**, **reportlab** | Resume parse + PDF/DOCX export |
| **langchain-openai** | Chat client for structured ATS scoring pipeline |

### Database / storage

| Technology | Role |
|------------|------|
| **SQLite** (stdlib `sqlite3`) | All durable app data; path from `DATABASE_PATH` |
| **Local filesystem** (`LOCAL_STORAGE_DIR`) | Private buckets for documents, avatars, interview media |
| **`db/schema.sql`** | Idempotent schema applied by `scripts/setup/migrate-local-db.py` |
| **Custom query client** (`backend/app/db/client.py`) | Fluent API over SQLite (`table().select().eq()...`) — **not** Prisma/SQLAlchemy/Drizzle |

### AI / LLM APIs

| Provider | Default model id | Base URL (default) |
|----------|------------------|--------------------|
| **NVIDIA Integrate** (OpenAI-compatible) | `deepseek-3.2` | `https://integrate.api.nvidia.com/v1` |
| **Groq** (OpenAI-compatible) | `llama-3.3-70b-versatile` | `https://api.groq.com/openai/v1` |

### Agent frameworks

| Technology | Role |
|------------|------|
| **CrewAI** (optional extra `.[crewai]`) | Official package for ATS structured scoring crews; resume-improve crew reports package presence |
| **Built-in sequential orchestrator** (`app.agents.crew`) | Always available for resume improvement: gap analyst → NVIDIA improver → evidence validator |
| **Custom agent registry** (`app.agents.registry`) | Single inventory for product agents / readiness |

### Infrastructure & tooling

| Technology | Role |
|------------|------|
| **npm scripts** | Install, dev (API + UI), env checks, secret scan |
| **Node.js** | Frontend tooling and orchestration scripts under `scripts/` |
| **ESLint + TypeScript** | Frontend quality gates |
| **pytest-style tests** under `tests/ats_scoring/` | ATS scoring unit tests |

### Optional extras

```powershell
cd backend
.\.venv\Scripts\activate
pip install -e ".[docling]"   # layout-aware PDF extraction
pip install -e ".[crewai]"    # official CrewAI (Python < 3.14 only)
```

---

## 3. AI Architecture (Models & Agents)

### Models used

| Model identifier | Provider | Config keys | Why this project uses it | Primary roles |
|------------------|----------|-------------|---------------------------|---------------|
| **`deepseek-3.2`** | NVIDIA Integrate API | `NVIDIA_MODEL`, `NVIDIA_API_KEY`, `NVIDIA_BASE_URL` | Default structured-output model for resume rewrites, profile extraction, preferred ATS brief; OpenAI-compatible chat completions | Resume improvement, profile fill AI path, ATS improvement brief (preferred), ATS structured scoring when `LLM_PROVIDER=nvidia` |
| **`llama-3.3-70b-versatile`** | Groq | `GROQ_MODEL`, `GROQ_API_KEY`, `GROQ_BASE_URL` | Fast structured JSON for interview questions; ATS brief fallback; default ATS structured scorer when `LLM_PROVIDER=groq` | Interview questions, ATS improvement brief (if NVIDIA off), ATS structured scoring (default provider) |

Both clients call `{base_url}/chat/completions` with `response_format: { "type": "json_object" }`, retries on transient HTTP statuses (`408`, `429`, `5xx`), and a **repair pass** via `repair_structured_output_v1.txt` when JSON fails validation.

**Provider selection for ATS structured scoring only:** `LLM_PROVIDER` must be `groq` or `nvidia` (default `groq` in `Settings` / `.env.example`). Resume improve and profile fill always use **NVIDIA**, not Groq as a silent fallback.

### Agents involved

Product inventory is defined in `backend/app/agents/registry.py` and exposed at **`GET /api/v1/agents/status`**.

| Agent id | Persona / role | Objective | Tools / inputs | Provider | Fallback |
|----------|----------------|-----------|----------------|----------|----------|
| `resume_improvement` | Evidence-checked rewrite assistant | Suggest rewrites of **confirmed** resume blocks | Confirmed sections + optional ATS/JD context; NVIDIA `improve_resume_v1.txt` | NVIDIA | Manual edit + export |
| `resume_improvement_crew` | Sequential multi-agent crew | Gap → improve → validate | See crew table below | NVIDIA + tools | Built-in orchestrator always; needs NVIDIA for generation |
| `profile_fill` | Resume → profile extractor | Draft profile fields from resume text | Deterministic parse + optional NVIDIA `fill_profile_from_resume_v1.txt` + evidence filter | NVIDIA + rules | Deterministic-only draft |
| `interview_questions` | Mock interviewer | Generate practice questions | Session mode/role/count; `interview_questions_v1.txt` | **Groq only** | Local templates |
| `ats_improvement_brief` | ATS explainer | Overall inference from **missing keywords only** | Score + missing term list; `ats_improvement_v1.txt` | NVIDIA, else Groq | Deterministic paragraph |

#### Resume improvement crew (sequential)

Defined in `backend/app/agents/crew/orchestrator.py` + tools in `tools.py`:

| Step | Agent role | Tool | Behavior |
|------|------------|------|----------|
| 1 | **ATS Gap Analyst** | `analyze_ats_gaps` | Deterministic: reads supplied ATS evidence only; never invents requirements |
| 2 | **Resume Improvement Specialist** | `generate_resume_suggestions` | NVIDIA `NvidiaClient.generate` over confirmed blocks |
| 3 | **Evidence Validator** | `validate_suggestions` | Server-side `validate_suggestion` drops unsupported employers/metrics/contact changes |

Process model: **`sequential`**. Runtime mode: `official_crewai` if the package is importable, else `compatible_orchestrator`. Tools are always truth-bound wrappers — free-form CrewAI tool invention is not used.

#### ATS structured scoring crew (`backend/app/agents/ats_scoring/`)

Separate from the product registry; used by `POST /api/v1/ats/score` and integrated into `POST /api/v1/ats-analyses`:

| Agent role | Goal |
|------------|------|
| **Resume Parsing Agent** | Extract explicit resume facts → `ResumeParsed` |
| **Job Description Parsing Agent** | Domain, role family, required skills → `JDParsed` |
| **Domain Gate Agent** | ALLOW/REJECT before scoring (rule gate can override to REJECT) |
| **Resume Scoring Agent** | Parameter scores → composite formula |

Requires **CrewAI** + **langchain-openai** (`ChatOpenAI` pointed at Groq or NVIDIA). If the pipeline fails, product ATS analysis **falls back** to deterministic keyword coverage from `backend/app/ats/deterministic.py`.

#### Prompt files (`backend/app/agents/prompts/`)

| File | Used by |
|------|---------|
| `improve_resume_v1.txt` | Resume improvement |
| `fill_profile_from_resume_v1.txt` | Profile fill AI path |
| `interview_questions_v1.txt` | Mock interview questions |
| `ats_improvement_v1.txt` | ATS overall inference |
| `repair_structured_output_v1.txt` | JSON repair helper (not a product feature) |

ATS scoring prompts live in `backend/app/agents/ats_scoring/prompts.py` (inline strings for parse / gate / score).

---

## 4. Feature Flows (Step-by-Step)

### Feature: Authentication & session

**Trigger:** User opens `/sign-in` or `/sign-up` (or demo path in non-production).

**Execution flow:**

1. Browser posts to `/api/backend/auth/sign-up` or `/auth/sign-in` (proxied to FastAPI `/api/v1/...`).
2. Backend hashes password, creates `users` + empty `profiles` / preference rows on sign-up.
3. Backend issues JWT via `create_access_token` (`HS256`, claim `sub` = user id).
4. Frontend stores token in `localStorage` (`career_copilot_access_token`) and cookie `career_copilot_session`.
5. Subsequent `apiRequest` calls send `Authorization: Bearer <token>`.
6. `get_current_user` validates JWT and loads the user row from SQLite.

**Output:** Authenticated session; protected workspace routes load bootstrap data.

**Notes:** `auth/resend` and `auth/reset-password` return “not configured for local development.” Social OAuth is stubbed as unavailable.

---

### Feature: Profile completion

**Trigger:** Workspace shell bootstrap, profile load/save, preference or list mutations.

**Execution flow:**

1. Server reads profile + related rows.
2. `backend/app/profile_completion.py` scores a fixed 100-point checklist (no resume upload criterion).
3. `repository.recalculate_completion` writes `profiles.profile_completion` and `profile_completion_details`.
4. UI toast shows remaining items; client may filter stale keys such as legacy `"resume"`.

**Checklist weights:**

| Item | Points |
|------|--------|
| Full name | 10 |
| Location | 8 |
| Current role | 10 |
| Target roles | 8 |
| Work experience **or** 0 years (fresher) | 22 |
| Skills | 17 |
| Education | 10 |
| Preferred work modes | 5 |
| Preferred job locations | 5 |
| Professional link | 5 |

**Output:** Integer 0–100 plus missing/completed detail for dashboard and toast.

---

### Feature: Resume upload, parse, confirm

**Trigger:** User uploads PDF/DOCX under resume analysis flow.

**Execution flow:**

1. Validate type/size (`DOCUMENT_MAX_BYTES`, MIME allowlist).
2. Store file under `LOCAL_STORAGE_DIR` / document bucket / `{user_id}/...`.
3. Extract plain text (`pypdf` / `python-docx`; optional Docling).
4. Split into structured sections (`backend/app/parsing/`).
5. Insert `resume_versions` with `extraction_status` until user confirms.
6. User reviews at `/resume-analysis/review` → `POST /resume-versions/{id}/confirm`.

**Output:** Confirmed resume version usable for ATS and improvement.

---

### Feature: Job description ingest

**Trigger:** Paste text or upload JD file.

**Execution flow:**

1. Create `job_descriptions` row (text path or file path).
2. Extract / structure content; user reviews metadata/extraction.
3. Confirm via `POST /job-descriptions/{id}/confirm`.

**Output:** Confirmed JD required by ATS analysis.

---

### Feature: ATS analysis

**Trigger:** User runs analysis with confirmed resume version + confirmed JD (`POST /api/v1/ats-analyses`).

**Execution flow:**

1. Ownership + `extraction_status == confirmed` checks.
2. **Always** run deterministic scorer `score_resume` (`ALGORITHM_VERSION = deterministic-keyword-coverage-v1`): top-50 JD keywords, exact normalized token match in resume.
3. **Attempt** structured pipeline `score_resume_jd` (`structured-llm-gated-v1` persisted as algorithm version on the analysis row):
   - Parse resume + JD with CrewAI agents
   - Domain gate (model + rule override)
   - Weighted composite if ALLOW; **0** if REJECT
4. Persist `ats_analyses` + `ats_evidence` rows (keyword evidence for audit/UI).
5. Generate `summary.overall_inference` via `generate_ats_improvement_brief` (NVIDIA → Groq → deterministic).
6. Write activity event.

**Composite formula (structured path):**

```text
composite = 0.40 * hard_skill_match
          + 0.25 * experience_relevance
          + 0.15 * education_match
          + 0.10 * certifications_match
          + 0.10 * seniority_alignment
```

**Output:** Analysis report (score, breakdown, missing keywords, inference). Direct non-persisted scoring also available at `POST /api/v1/ats/score`.

---

### Feature: In-place resume edit & AI improve

**Trigger:** From ATS report edit UI (`/resume-analysis/report/[reportId]/edit`) or improvement APIs.

**Manual path:**

1. Load the **same** `resume_versions` row used in the analysis.
2. Edit sections; missing keyword chips add skills **only on click**.
3. `POST /resume-versions/{id}/manual-edit` with default `apply_mode: "in_place"`.

**AI path:**

1. `POST /resume-improvements` with section keys + optional ATS/JD ids.
2. Crew: gap analysis → NVIDIA suggestions → validation → double-check validator.
3. User accepts/edits/rejects suggestions; `POST /resume-improvements/{run_id}/apply`.
4. Optional export PDF/DOCX; re-run ATS on the same version.

**Output:** Updated resume version, suggestion records, optional exports.

---

### Feature: Profile fill from resume

**Trigger:** Settings/profile “from resume” preview.

**Execution flow:**

1. Load stored resume version or upload for preview.
2. Deterministic draft from text/sections.
3. If NVIDIA configured: structured extract → drop values not supported by resume text → merge with deterministic draft.
4. Return draft only (no auto-write).
5. User selects fields → `POST /profile/from-resume/apply` → completion recalculated.

**Output:** Reviewable draft then selective profile updates.

---

### Feature: Mock interview

**Trigger:** Create session → start (`POST /interviews/{session_id}/start`).

**Execution flow:**

1. Create `interview_sessions` with mode (e.g. `technical`, `behavioural`, `mixed`).
2. On start: `generate_interview_questions` tries **Groq** + `interview_questions_v1.txt`.
3. On Groq failure/unconfigured: **local templates** (never NVIDIA).
4. Insert `interview_questions`; user posts responses; complete or delete session.

**Output:** Practice questions and session transcript storage. **Interview evaluation / grading AI is not a shipped product agent.**

---

### Feature: Jobs & learning

**Trigger:** Workspace `/jobs`, `/learning` routes.

**Execution flow:**

1. `GET /jobs`, `GET /saved-jobs`, save/patch/delete saved jobs — rows from SQLite `jobs` / `saved_jobs`.
2. Learning paths/items/resources read/write via `/learning-paths` endpoints.
3. No separate AI job recommender agent is registered in the product agent inventory.

**Output:** Database-backed lists and saved-job state.

---

### Feature: Account deletion

**Trigger:** Settings → delete account (`DELETE /account`).

**Execution flow:** Collect owned storage paths and DB rows for the user; remove files and cascade/owned deletes via application logic.

**Output:** User data and known storage objects removed.

---

## 5. Implementation Rationale (The “How” and “Why”)

### Why SQLite (not Postgres / Prisma / hosted BaaS)?

- **Zero external DB server** for local/dev: `DATABASE_PATH` points at a file (default `.data/career-copilot.sqlite`).
- Schema is a single idempotent `db/schema.sql` applied by `scripts/setup/migrate-local-db.py` (and preflight on `npm run dev`).
- A small fluent client (`LocalClient` / `Query`) mirrors common patterns (`.table().select().eq().execute()`) so route code stays readable without an ORM migration stack.
- **Application-owned isolation:** isolation is **application-level** — every candidate query filters `user_id`, and JWT identifies the principal.

### Why local JWT + password hashes?

- Auth is fully offline-capable for development and demos.
- Tokens are signed with `AUTH_SECRET` (`HS256`); session cookie optional for same-origin helpers.
- Email delivery (verify/reset) is intentionally stubbed until a mail provider is wired.

### Why two LLM providers (NVIDIA + Groq)?

| Concern | Choice |
|---------|--------|
| Heavy structured resume work | NVIDIA (`deepseek-3.2`) |
| Fast interview Q generation | Groq (`llama-3.3-70b-versatile`) |
| Separation of concerns | Groq is **not** a silent fallback for resume improve / profile fill |
| ATS brief | Prefer NVIDIA, else Groq, else deterministic text |
| ATS structured scoring default | `LLM_PROVIDER=groq` (overridable to `nvidia`) |

### Why a sequential crew (not a free swarm)?

- Resume improvement is a **pipeline with fixed contracts**, not open-ended multi-agent chat.
- Gap analysis and validation are **deterministic tools**; only generation needs an LLM.
- That minimizes hallucination surface area and produces an auditable task log on each run.
- Official CrewAI is optional; the **compatible orchestrator** preserves behavior when the package is missing or Python is unsupported.

### Why dual ATS scoring (structured LLM + deterministic keywords)?

- Deterministic keyword coverage always yields **explainable missing/matched terms** for the UI and evidence table.
- Structured LLM scoring adds domain gate + multi-parameter composite when CrewAI/provider work.
- Product path prefers structured composite when available, but **never depends on it alone** — fallback keeps analyses usable offline.

### How is state / memory handled?

| Layer | Mechanism |
|-------|-----------|
| Durable product state | SQLite tables (`profiles`, resumes, ATS, interviews, …) |
| Files | Local storage buckets under `LOCAL_STORAGE_DIR` |
| Session | JWT in localStorage + cookie |
| AI “memory” | **None across turns** — each call gets explicit context (resume blocks, ATS evidence, prompts) |
| Frontend cache | In-flight GET dedupe only; no durable client data store for product truth |

### How are hallucinations, rate limits, and API failures handled?

| Risk | Mitigation |
|------|------------|
| Invented employers/metrics | `validate_suggestion` / evidence hashes; crew validator drops blocked items |
| Profile AI inventing facts | Evidence filter: values must appear in resume text |
| ATS brief inventing skills | Prompt + code constrained to provided `missing_keywords` |
| Invalid JSON from models | Repair prompt pass; then `ApiError` 502 |
| Rate limit 429 | Mapped to provider-specific `ApiError` 429 |
| Transient 5xx / network | Retries with backoff (`NVIDIA_MAX_RETRIES` / `GROQ_MAX_RETRIES`) |
| Missing API keys | Feature still runs via manual edit, deterministic ATS, template interviews, rules profile fill |
| Structured ATS pipeline down | Log warning; persist deterministic keyword score |

### Frontend request architecture

- Browser API calls use same-origin **`/api/backend/[...path]`** proxy to avoid CORS friction and keep cookies consistent.
- Server-side rendering paths may call `PUBLIC_API_BASE_URL` / `NEXT_PUBLIC_API_BASE_URL` directly.
- File downloads use signed-style paths like `/api/files/{bucket}/{path}` that the Next proxy/file routes resolve with the user’s bearer token.

---

## 6. Environment Setup & Configuration

### Prerequisites

1. **Node.js** (Current LTS recommended) with npm.
2. **Python 3.11, 3.12, or 3.13** (3.12 preferred). Python **3.14+ will fail** package install.
3. No separate database server.
4. Optional: NVIDIA API key and/or Groq API key for AI paths.

### Installation

```powershell
# From repository root
copy .env.example .env
# Edit .env: set AUTH_SECRET and any API keys you need

npm install
```

`postinstall` runs:

- `scripts/setup/backend.mjs` — create `backend/.venv`, install `career-copilot-api` (and CrewAI when possible)
- `scripts/setup/local-db.mjs` — apply schema / storage dirs

If multiple Pythons are installed:

```powershell
$env:CAREER_COPILOT_PYTHON = "C:\Path\To\Python312\python.exe"
$env:CAREER_COPILOT_RECREATE_VENV = "1"
npm install
```

### Run (full stack)

```powershell
npm run dev
```

Preflight applies `db/schema.sql` and verifies a transactional DB write/read/rollback. Then:

| Service | URL |
|---------|-----|
| Website | http://localhost:3000 |
| API | http://127.0.0.1:8000 |
| OpenAPI docs (non-production) | http://127.0.0.1:8000/docs |

Separate processes:

```powershell
npm run dev:frontend
npm run dev:backend
```

Production-style frontend:

```powershell
npm run build
npm run start
```

API alone:

```powershell
uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000
```

### Useful npm scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Preflight + API + Next |
| `npm run db:setup` | Schema apply + DB check only |
| `npm run check:env` | Env presence (values not printed) |
| `npm run check:secrets` | Secret leak scan |
| `npm run lint` / `typecheck` / `build` | Frontend quality |
| `npm run check` | secrets + env + frontend checks |

### Complete `.env.example`

Copy to root `.env`. Values below match the checked-in template and the settings fields consumed by `backend/app/config.py` / scripts. **Never** put secrets in `NEXT_PUBLIC_*` variables.

```env
# One repository-wide environment file.
# Copy this file to .env. Keep real credentials only in the ignored .env file.

# Frontend and API
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000   # Browser-facing API origin (and health of proxy target)
PUBLIC_API_BASE_URL=http://127.0.0.1:8000        # Server-side Next → FastAPI base (optional; falls back to NEXT_PUBLIC_*)
FRONTEND_ORIGINS=http://localhost:3000,http://127.0.0.1:3000  # CORS allowlist for FastAPI
APP_NAME=Career Copilot API                        # Service name in health payloads
APP_ENV=development                                # "production" disables /docs
API_V1_PREFIX=/api/v1                              # FastAPI router prefix
LOG_LEVEL=INFO                                     # Logging level for the API process

# Local persistence
DATABASE_PATH=./.data/career-copilot.sqlite        # SQLite file path (created if missing)
LOCAL_STORAGE_DIR=./.data/storage                  # Root for document/avatar/interview files
AUTH_SECRET=replace-with-a-long-random-local-secret  # JWT signing secret (change for real use)
DOCUMENT_BUCKET=documents                          # Storage subfolder name for resumes/JDs/exports
AVATAR_BUCKET=avatars                              # Storage subfolder name for avatars
INTERVIEW_BUCKET=interview-media                   # Storage subfolder name for interview media

# File limits and signed local URLs
DOCUMENT_MAX_BYTES=10485760                        # Max resume/JD upload size (bytes)
AVATAR_MAX_BYTES=5242880                           # Max avatar size (bytes); code default is 3 MiB if unset
INTERVIEW_MEDIA_MAX_BYTES=52428800                 # Max interview media size (bytes)
EXPORT_SIGNED_URL_SECONDS=900                      # Export URL lifetime hint (seconds)

# Provider selection for ATS structured scoring: groq or nvidia
LLM_PROVIDER=groq

# NVIDIA provider (server-only; leave the key empty when unused)
NVIDIA_API_KEY=                                    # Bearer token for NVIDIA Integrate API
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=deepseek-3.2                          # Model id for resume/profile/brief (and scoring if selected)
NVIDIA_TIMEOUT_SECONDS=45
NVIDIA_MAX_RETRIES=2
NVIDIA_MAX_OUTPUT_TOKENS=1200
NVIDIA_TEMPERATURE=0.1
NVIDIA_PROMPT_VERSION=v1                           # Stored on improvement runs for audit

# Groq provider (server-only; leave the key empty when unused)
GROQ_API_KEY=                                      # Bearer token for Groq
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL=llama-3.3-70b-versatile                 # Interview questions + optional ATS brief/scoring
GROQ_TIMEOUT_SECONDS=45
GROQ_MAX_RETRIES=2
GROQ_MAX_OUTPUT_TOKENS=1200
GROQ_TEMPERATURE=0.1

# Resume improvement limits
IMPROVEMENT_MAX_SECTIONS=8                         # Max sections per improve request
IMPROVEMENT_MAX_SOURCE_CHARS=24000                 # Max total source block characters
IMPROVEMENT_MAX_JD_CHARS=12000                     # Max JD characters attached to improve context
```

**Code defaults** (if a variable is omitted) may differ slightly from `.env.example` — for example `document_bucket` defaults to `candidate-documents` and `avatar_max_bytes` to `3 * 1024 * 1024` in `Settings`. Whatever is present in root `.env` wins via pydantic-settings.

### Package identity

| Package | Version | Role |
|---------|---------|------|
| `career-copilot` (npm) | 1.0.0 | Frontend + scripts |
| `career-copilot-api` (Python) | 1.0.0 | FastAPI app under `backend/app` |

### High-level layout

```text
career-copilot_v1/
├── README.md
├── .env.example / .env
├── package.json
├── scripts/                 # setup, dev, migrate, env verify
├── db/schema.sql            # SQLite schema
├── src/                     # Next.js App Router UI
├── backend/
│   ├── pyproject.toml
│   └── app/                 # FastAPI: routes, agents, ATS, auth, DB
└── tests/ats_scoring/       # Structured ATS unit tests
```

### Security notes

- Keep `.env` out of git (see `.gitignore`).
- Run `npm run check:secrets` before commits.
- AI keys exist only on the API process.
- File access requires auth and path prefix `{user_id}/`.

---

## Appendix A — Primary API map

Base: **`{API origin}/api/v1`**.

| Area | Examples |
|------|----------|
| Health | `GET /health`, `GET /health/database`, `GET /agents/status` |
| Auth | `POST /auth/sign-up`, `/auth/sign-in`, `/auth/session`, `/auth/sign-out`, … |
| Workspace | `GET /me/bootstrap`, `GET /me/activity` |
| Profile | `GET/PATCH /profile`, avatar, preferences, CRUD under `/profile/{resource}`, from-resume preview/apply |
| Resumes | `/resumes`, versions, confirm, manual-edit, exports |
| Improvements | `/resume-improvements`, suggestions, apply |
| JD / ATS | `/job-descriptions`, `/ats-analyses`, `POST /ats/score` |
| Interviews | `/interviews`, start, responses, complete |
| Jobs / learning | `/jobs`, `/saved-jobs`, `/learning-paths` |
| Settings / account | `/settings`, `DELETE /account` |
| Files | `GET /files/{bucket}/{path}` |

Interactive docs: `http://127.0.0.1:8000/docs` when `APP_ENV != production`.

---

## Appendix B — What this project deliberately does not do

| Not shipped as product AI | Reality in code |
|---------------------------|-----------------|
| Interview answer grading | Questions yes; no evaluation agent in registry |
| Semantic / embedding ATS | Keyword + optional structured scores only |
| Invented resume experience | Validators and confirm gates |
| Hosted database / database-managed row security | Local SQLite + app ownership filters |
| Email verification delivery | Stub responses in local auth routes |
| Profile points for uploading a resume | Checklist is profile fields only |

---

*Documentation generated from the codebase as of the audit pass. Prefer `GET /api/v1/agents/status` and `GET /api/v1/health` at runtime for live readiness.*
