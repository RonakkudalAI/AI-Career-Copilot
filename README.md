# Career Copilot

**Version:** 1.0.0
**Type:** Full-stack monorepo — Vite frontend + FastAPI backend + Firebase Cloud Firestore
**Purpose:** Private local career workspace for candidates

Career Copilot helps candidates manage profiles, parse resumes, score them against job descriptions with **auditable keyword evidence**, prepare for interviews, generate **YouTube learning paths** from ATS gaps, and browse **job recommendations** grounded in confirmed resume evidence.

> **Golden rule:** Do not invent the candidate’s career.\
> Only use what the user types, uploads, **confirms**, or explicitly accepts.
> **Cloud Firestore + file buckets** are the system of record. AI keys and Firebase credentials stay on the server.

---

## Table of contents

1. [What this project does](#1-what-this-project-does)
2. [What is intentionally not shipped](#2-what-is-intentionally-not-shipped)
3. [Architecture](#3-architecture)
4. [Authentication (end-to-end)](#4-authentication-end-to-end)
5. [Repository layout](#5-repository-layout)
6. [Tech stack](#6-tech-stack)
7. [Configuration & environment](#7-configuration--environment)
8. [Models, providers & agents](#8-models-providers--agents)
9. [Formulas & scoring (all algorithms)](#9-formulas--scoring-all-algorithms)
10. [Document parsing pipeline](#10-document-parsing-pipeline)
11. [Feature flows (end-to-end)](#11-feature-flows-end-to-end)
12. [API map](#12-api-map)
13. [Frontend routes & request path](#13-frontend-routes--request-path)
14. [Database & file storage](#14-database--file-storage)
15. [Setup, run & scripts](#15-setup-run--scripts)
16. [Testing](#16-testing)
17. [Design principles](#17-design-principles)
18. [Quick reference](#18-quick-reference)
19. [Scaling Considerations](#19-scaling-considerations)

---

## 1. What this project does

| Capability | UI | How it works (summary) |
|------------|----|------------------------|
| Sign up / sign in (email + password) | Yes | Local JWT (`AUTH_SECRET`), scrypt password hashes |
| Profile, avatar, completion checklist | Yes | Deterministic 0–100 checklist; resume upload does **not** raise completion % |
| Career preferences | Yes | Roles, locations, work modes, employment types, salary, etc. |
| Resume upload, parse, review, confirm | Yes | PDF via **Docling**; DOCX via python-docx/Docling; section segregation |
| Job description paste or upload + confirm | Yes | Required before ATS |
| **ATS keyword coverage score (0–100%)** | Yes | Single product scorer: `ats_score.py` (`evidence-keyword-coverage-v3`) |
| ATS improvement brief | Yes | LLM or deterministic brief from missing keywords only |
| Re-upload revised resume and re-score | Yes | Primary improvement loop after ATS |
| Profile fill from resume (preview → apply) | Yes | Draft until user applies; NVIDIA + deterministic merge |
| Mock interview sessions + questions | Yes | Groq or local templates; **no AI grading of answers** |
| Interview preparation from resume + JD | Yes | Evidence-grounded question packs |
| Learning paths from ATS gaps | Yes | Gaps → planner → YouTube Data API exact videos |
| Delete learning paths / interviews / ATS / account | Yes | Owned data cascade + storage purge on account delete |
| Jobs browse / save + recommendations | Yes | Premium glassmorphism UI for local jobs scored against confirmed resume evidence |
| Demo session (offline frontend mock) | Yes | Cookie `career_copilot_demo=1`; mocks key APIs in browser |
| In-app post-ATS resume editor | **No** | Removed; re-upload instead |
| Browser-side AI / YouTube keys | **No** | Server `.env` only |

---

## 2. What is intentionally not shipped

| Non-goal | Reality |
|----------|---------|
| Invented resume facts or skills | Blocked by evidence grounding |
| Invented YouTube video IDs | Only YouTube Data API results, or a search-page URL fallback |
| In-app full resume editor after ATS | Removed; re-upload a revised file |
| AI interview scoring / hiring prediction | Questions + practice only |
| Embedding / cosine similarity ATS | Not used in the product path |
| Hosted multi-tenant cloud DB | Firebase Cloud Firestore |
| Working email verify / password-reset delivery | Stubs return "not configuredâ€  for local dev |
| Social OAuth sign-in | Google sign-in via Firebase Authentication |
| Python 3.14+ as primary | `requires-python = ">=3.11,<3.14"` |

---

## 3. Architecture

```text
Browser (Vite React application)
  frontend/src/App.tsx  +  frontend/src/features
  Token: localStorage key career_copilot_access_token
         + cookie     career_copilot_session  (same JWT value)
  Guard: frontend/src/proxy.ts → features/auth/server/proxy.ts
        â”‚
        â”œâ”€â–º /api/backend/*     Vite BFF proxy → FastAPI /api/v1/*
        â””â”€â–º /api/files/*       Vite BFF proxy → FastAPI file download
                â”‚
                â–¼
FastAPI  backend/app/main.py
  Prefix: API_V1_PREFIX (default /api/v1)
  Auth:   JWT HS256 (AUTH_SECRET) → CurrentUser
  CORS:   FRONTEND_ORIGINS + credentials
        â”‚
        â”œâ”€â–º Firestore  FIREBASE_PROJECT_ID + server credentials
        â”‚     backend/app/database/client.py  (collection/document query adapter)
        â”œâ”€â–º Files      FIREBASE_STORAGE_BUCKET
        â”‚     buckets: candidate-documents, candidate-avatars, interview-media
        â””â”€â–º Optional server-only services
              NVIDIA Integrate API  → structured LLM tasks
              Groq                  → interviews, learning planner, ATS brief fallback, section extract
              YouTube Data API v3   → exact learning-path videos
              Docling               → layout-aware PDF text extraction
```

### Request path (authenticated API call)

1. UI calls `apiRequest()` in `frontend/src/shared/api/client.ts`.
2. Browser base is always `/api/backend` (same-origin BFF; avoids CORS from the page).
3. Vite development proxy forwards `/api/backend/*` and `/api/files/*` to
   `{PUBLIC_API_BASE_URL}{API_V1_PREFIX}`.
4. Request includes `Authorization: Bearer <JWT>` (and cookies via `credentials: "include"`).
5. FastAPI dependency `get_current_user` validates JWT (header preferred, else session cookie).
6. Handlers in `backend/app/api/router.py` (and feature routers) enforce **user ownership** of rows.
7. Errors use `ApiError` (`backend/app/core/errors.py`) with stable codes and `X-Request-ID`.

### Demo mode

If cookie `career_copilot_demo=1` is set, `apiRequest` routes to `demo-session.ts` and never hits FastAPI. Demo data is in-memory only.

---

## 4. Authentication (end-to-end)

**Code:**
- Backend: `backend/app/features/auth/service.py`, account wipe in `account_deletion.py`, routes in `api/router.py`
- Frontend: `frontend/src/features/auth/api/client.ts`, `auth-screen.tsx`, `server/proxy.ts`

### 4.1 Password storage

| Item | Value |
|------|--------|
| Algorithm | **scrypt** |
| Parameters | `n=2**14`, `r=8`, `p=1` |
| Salt | 16 random bytes per password |
| Stored format | `scrypt${salt_hex}${digest_hex}` |
| Verify | recompute scrypt + `hmac.compare_digest` |
| Min password length | **6** (`MIN_PASSWORD_LENGTH` in `core/constants.py`) |

### 4.2 JWT access token

| Item | Value |
|------|--------|
| Library | PyJWT |
| Algorithm | **HS256** (`JWT_ALGORITHM`) |
| Secret | `AUTH_SECRET` (required) |
| Claims | `sub` = user UUID string, `email` = user email |
| Expiry | **No exp claim** (local-dev style long-lived token; invalid if user deleted or secret changes) |

```text
create_access_token(user_id, email, settings)
  → jwt.encode({"sub": str(user_id), "email": email}, AUTH_SECRET, algorithm="HS256")
```

### 4.3 Sign-up flow

```text
UI POST /api/backend/auth/sign-up
  body: { email, password, full_name? }
        â”‚
        â–¼
FastAPI POST /api/v1/auth/sign-up
  1. Normalize email (lower/strip); validate email + password length
  2. Reject 409 if email already exists
  3. Insert users row (scrypt hash)
  4. Insert profiles row (id = user_id)
  5. Insert default rows: candidate_preferences, notification_preferences, privacy_preferences
  6. Return { access_token, token_type: "bearer", user: { id, email, full_name } }
        â”‚
        â–¼
Frontend saveToken(access_token):
  - localStorage["career_copilot_access_token"] = token
  - document.cookie career_copilot_session=<token>; Path=/; SameSite=Lax
```

### 4.4 Sign-in flow

```text
UI POST /auth/sign-in { email, password }
  → lookup users by email
  → _password_matches (scrypt)
  → same token payload + saveToken as sign-up
  → 401 invalid_credentials on failure (no user enumeration beyond generic message)
```

### 4.5 Session resolution (every protected API call)

```text
get_current_user:
  1. If Authorization header present → parse "Bearer <token>"
  2. Else use cookie career_copilot_session
  3. jwt.decode(token, AUTH_SECRET, algorithms=["HS256"])
  4. Load users row by payload.sub
  5. Return CurrentUser(id, email, access_token, full_name)
  Failures → 401 authentication_required | invalid_authorization | invalid_access_token | invalid_user_identity
```

### 4.6 Sign-out

1. Frontend clears `localStorage` token and sets session cookie `Max-Age=0`.
2. Calls `POST /auth/sign-out` (204); backend also deletes the session cookie on the response.

### 4.7 Password update / email stubs

| Endpoint | Behavior |
|----------|----------|
| `POST /auth/update-password` | Authenticated; re-hash with scrypt; min length 6 |
| `POST /auth/session` | Authenticated; returns current user |
| `POST /auth/resend` | Stub: email delivery not configured |
| `POST /auth/reset-password` | Stub: reset email not configured |
| OAuth | Frontend returns "Social sign-in is not configuredâ€  |

### 4.8 Route protection (React Router)

`frontend/src/features/auth/server/proxy.ts` (wired via `proxy.ts`):

| Condition | Action |
|-----------|--------|
| Path under `/dashboard`, `/resume-analysis`, `/mock-interview`, `/learning`, `/jobs`, `/settings`, `/onboarding` **and** no session cookie | Redirect to `/sign-in?next=â€¦` |
| Logged in on `/sign-in` or `/sign-up` | Redirect to `/dashboard` |

API ownership is still enforced server-side; the proxy only protects pages.

### 4.9 Account deletion

```text
DELETE /api/v1/account
  body: { confirmation_phrase, email? }
  confirmation_phrase must be exactly: DELETE MY ACCOUNT
  optional email must match account when provided
  → collect storage paths (resumes, exports, JDs, avatars, interview media)
  → purge user objects from Firebase Storage
  → delete users row (cascade removes owned tables per schema)
```

---

## 5. Repository layout

```text
career-copilot/
â”œâ”€â”€ README.md
â”œâ”€â”€ package.json              # root scripts (setup, dev, checks)
â”œâ”€â”€ .env / .env.example       # single env file for UI + API
â”œâ”€â”€ FIREBASE_SETUP.md         # Firebase project and Firestore setup
â”œâ”€â”€ firebase/firestore.rules  # Deny direct browser database access
â”œâ”€â”€ scripts/
â”‚   â”œâ”€â”€ setup/                # project, backend, Firebase setup
â”‚   â”œâ”€â”€ dev/                  # preflight, frontend, backend, run
â”‚   â”œâ”€â”€ diagnostics/          # env, secrets, e2e-smoke, DB checks
â”‚   â””â”€â”€ shared/               # load-env, ports
â”œâ”€â”€ frontend/                 # Vite React app
â”‚   â”œâ”€â”€ e2e/                  # Playwright
â”‚   â”œâ”€â”€ src/
â”‚   â”‚   â”œâ”€â”€ app/              # routes, layouts, BFF proxies
â”‚   â”‚   â”œâ”€â”€ features/         # domain UI
â”‚   â”‚   â”œâ”€â”€ components/       # shared visual pieces
â”‚   â”‚   â””â”€â”€ shared/           # api client, config, theme, primitives
â”‚   â””â”€â”€ package.json
â””â”€â”€ backend/                  # career-copilot-api (FastAPI)
    â”œâ”€â”€ pyproject.toml
    â”œâ”€â”€ tests/
    â””â”€â”€ app/
        â”œâ”€â”€ main.py
        â”œâ”€â”€ core/             # config, constants, errors
        â”œâ”€â”€ api/              # router.py, schemas.py
        â”œâ”€â”€ database/         # Firestore client, repository, activity
        â”œâ”€â”€ agents/           # registry, prompts/, providers/
        â””â”€â”€ features/
            â”œâ”€â”€ auth/
            â”œâ”€â”€ profile/
            â”œâ”€â”€ document_parsing/
            â”œâ”€â”€ resume_management/
            â”œâ”€â”€ resume_improvement/   # API/agents (no editor UI)
            â”œâ”€â”€ ats/                  # product scorer + optional LLM crew library
            â”œâ”€â”€ interview/
            â”œâ”€â”€ learning/
            â””â”€â”€ career_matching.py
```

---

## 6. Tech stack

| Layer | Technology | Location |
|-------|------------|----------|
| UI | Vite React application, React, TypeScript | `frontend/` |
| Styling | CSS variables + Tailwind postcss | `frontend/src/globals.css` |
| Motion / 3D | motion, three, @react-three/*, cobe | marketing, jobs globe |
| API | FastAPI, Uvicorn, Pydantic v2 | `backend/` |
| Auth | PyJWT HS256, scrypt passwords | `features/auth`, `api/router` |
| DB | Firestore + custom query adapter | `database/client.py` |
| Docs | **Docling** (PDF), python-docx, pypdf available | `document_parsing` |
| Export | reportlab, python-docx | resume exports |
| HTTP / LLM | httpx, OpenAI-compatible clients | NVIDIA, Groq |
| YouTube | YouTube Data API v3 | `learning/youtube_api.py` |
| Optional multi-agent | CrewAI package or built-in compatible orchestrator | improvement + learning crews |
| Tests | pytest, Vitest, Playwright | `backend/tests`, `frontend` |

---

## 7. Configuration & environment

One root `.env` (copy from `.env.example`). Browser-safe Firebase values use the `VITE_FIREBASE_*` prefix; server secrets remain server-only.

### 7.1 Core app

| Variable | Purpose | Default / notes |
|----------|---------|-----------------|
| `VITE_API_BASE_URL` / `PUBLIC_API_BASE_URL` | Upstream FastAPI origin | `http://127.0.0.1:8000` |
| `FRONTEND_ORIGINS` | CORS allow-list (comma-separated) | localhost + 127.0.0.1:3000 |
| `APP_NAME` | API title in health | Career Copilot API |
| `APP_ENV` | `development` disables OpenAPI docs when `production` | development |
| `API_V1_PREFIX` | Versioned API prefix | `/api/v1` |
| `LOG_LEVEL` | Logging | INFO |
| `FIREBASE_PROJECT_ID` | Firebase project ID | required |
| `FIREBASE_CREDENTIALS_PATH` | Server-only service-account JSON path | required locally |
| `FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket | `{project}.appspot.com` |
| `AUTH_SECRET` | JWT signing secret | **required** (set a long random value) |
| `DOCUMENT_BUCKET` / `AVATAR_BUCKET` / `INTERVIEW_BUCKET` | Storage bucket names | candidate-* |
| `DOCUMENT_MAX_BYTES` | Max resume/JD upload | 10 MiB |
| `AVATAR_MAX_BYTES` | Max avatar | 3 MiB |
| `INTERVIEW_MEDIA_MAX_BYTES` | Max media | 250 MiB |
| `EXPORT_SIGNED_URL_SECONDS` | Export link lifetime | 300 |

### 7.2 LLM providers

| Variable | Purpose |
|----------|---------|
| `LLM_PROVIDER` | Preference hint (`groq` or `nvidia`) where agents allow choice |
| `NVIDIA_API_KEY`, `NVIDIA_BASE_URL`, `NVIDIA_MODEL` | NVIDIA Integrate API |
| `NVIDIA_TIMEOUT_SECONDS`, `NVIDIA_MAX_RETRIES`, `NVIDIA_MAX_OUTPUT_TOKENS`, `NVIDIA_TEMPERATURE` | NVIDIA client knobs |
| `NVIDIA_PROMPT_VERSION` | Label for prompt versioning |
| `GROQ_API_KEY`, `GROQ_BASE_URL`, `GROQ_MODEL` | Groq chat API |
| `GROQ_TIMEOUT_SECONDS`, `GROQ_MAX_RETRIES`, `GROQ_MAX_OUTPUT_TOKENS`, `GROQ_TEMPERATURE` | Groq client knobs |
| `GROQ_RESUME_PARSER_*` | Optional structured resume parser model + limits |

Defaults (from `.env.example`): NVIDIA model `deepseek-3.2`; Groq model `llama-3.3-70b-versatile`.

### 7.3 YouTube

| Variable | Purpose | Default |
|----------|---------|---------|
| `YOUTUBE_API_KEY` | Data API v3 key (server-only) | empty |
| `YOUTUBE_API_BASE_URL` | API host | `https://www.googleapis.com/youtube/v3` |
| `YOUTUBE_SEARCH_MAX_RESULTS` | Videos per gap search | 3 (clamped 1–5) |
| `YOUTUBE_TIMEOUT_SECONDS` | HTTP timeout | 20 |

### 7.4 Resume improvement limits

| Variable | Default | Role |
|----------|---------|------|
| `IMPROVEMENT_MAX_SECTIONS` | 4 | Cap sections improved per run |
| `IMPROVEMENT_MAX_SOURCE_CHARS` | 30000 | Cap resume source text |
| `IMPROVEMENT_MAX_JD_CHARS` | 12000 | Cap JD text for improvement |

### 7.5 Fixed protocol constants (not env)

From `backend/app/core/constants.py`:

| Constant | Value | Used for |
|----------|-------|----------|
| `JWT_ALGORITHM` | `HS256` | Auth |
| `MIN_PASSWORD_LENGTH` | `6` | Auth |
| `DOMAIN_GATE_MIN_SKILL_OVERLAP` | `0.15` | Optional structured ATS library |
| `ATS_COMPOSITE_WEIGHTS` | see [§9.2](#92-optional-library-structured-llm-ats-composite) | Optional structured ATS library |

---

## 8. Models, providers & agents

Registry: `backend/app/agents/registry.py`
Live status: `GET /api/v1/agents/status` and fields on `GET /api/v1/health`.

| Agent ID | Name | Provider | Prompt | Fallback when LLM off |
|----------|------|----------|--------|------------------------|
| `resume_improvement` | Resume improvement | NVIDIA | `improve_resume_v1.txt` | Manual/export |
| `resume_improvement_crew` | Gap → improve → validate | NVIDIA + tools | improve + crew tools | Compatible orchestrator if CrewAI package missing |
| `profile_fill` | Profile from resume | NVIDIA | `fill_profile_from_resume_v1.txt` | Deterministic mapping |
| `interview_questions` | Mock interview questions | Groq | `interview_questions_v1.txt` | Local templates |
| `ats_improvement_brief` | ATS brief | NVIDIA or Groq | `ats_improvement_v1.txt` | Deterministic missing-keyword brief |
| `learning_youtube_crew` | Learning YouTube crew | Groq + YouTube API | `learning_youtube_path_v1.txt` | Deterministic plan + search URLs |
| `document_section_extract` | Section segregation | NVIDIA first, Groq on 429 | `document_section_extract_v1.txt` | Structural layout parser |

Prompts: `backend/app/agents/prompts/`.

**Product ATS score itself is not an LLM agent.** It is deterministic keyword coverage in `ats_score.py`. An optional CrewAI structured scorer also exists in the library for experiments/tests (see §9.2); it is **not** what `POST /ats-analyses` persists today.

---

## 9. Formulas & scoring (all algorithms)

This section is the full math for every score the product computes.

### 9.1 Product ATS score — keyword coverage (primary)

**File:** `backend/app/features/ats/ats_score.py`
**Algorithm version:** `evidence-keyword-coverage-v3`
**Endpoints:** `POST /api/v1/ats-analyses`, `POST /api/v1/ats/score`
**Comment in router:** single scoring path — deterministic keyword coverage only.

#### Inputs

| Input | Source |
|-------|--------|
| Resume text | Confirmed `resume_versions.plain_text` |
| Structured sections (preferred) | `resume_versions.structured_content.sections` |
| Job description text | Confirmed `job_descriptions.raw_text` |

Both resume version and JD must have `extraction_status = confirmed`. Re-running the same resume version + JD + algorithm version returns the existing completed analysis.

#### Step 1 — Extract JD terms (`_candidate_terms`)

- Walk JD lines that look like **requirements / skills / bullets** (markers such as required, qualifications, skills, preferred, nice to have, etc.).
- Classify each segment as:
  - **required** (default when required markers appear or inherit prior type)
  - **preferred** (preferred / nice to have / bonus / desired)
- Keep source-backed phrases only: known tech terms, short requirement list items, technical-shaped tokens. Cap **80** terms.
- Canonicalize aliases for search only (examples):

| Canonical | Aliases used when matching |
|-----------|----------------------------|
| javascript | javascript, js |
| typescript | typescript, ts |
| kubernetes | kubernetes, k8s |
| postgresql | postgresql, postgres, postgre sql |
| machine learning | machine learning, ml |
| â€¦ | see `ALIAS_GROUPS` in `ats_score.py` |

Weights used later:

| Requirement type | Weight \(w\) |
|------------------|--------------|
| required | **2.0** |
| preferred | **1.0** |

#### Step 2 — Resume lines (`_resume_lines`)

Prefer confirmed structured sections → list of `(exact_line, section)`.\
Else split plain text by layout headings (never invent body text).

#### Step 3 — Match (`_find_match`)

For each JD term, scan resume lines with whole-word match of the term or aliases (normalized).

| Match strength | Meaning | Credit multiplier \(c\) |
|----------------|---------|-------------------------|
| **strong** | Exact primary phrase in skills-like section, or exact multi-word primary match | **1.0** |
| **partial** | Found via alias or outside skills-like section | **0.5** |
| **missing** | Not found | **0.0** |

- Matched evidence quote = **exact resume line** (never rewritten).
- Missing evidence = `null` (never invented).
- DB `match_status`: `strong_match` | `partial_match` | `not_found`.

#### Step 4 — Score formula

Let requirements be \((t_i, type_i)\) with weights \(w_i \in \{2,1\}\).

\[
W = \sum_i w_i
\]

\[
\text{contribution}_i = 100 \times \frac{w_i \cdot c_i}{W}
\quad\text{(rounded to 4 decimals)}
\]

\[
\text{overall\_score} = \mathrm{round}\Bigl(\sum_i \text{contribution}_i,\; 2\Bigr)
\in [0, 100]
\]

Sub-scores (for UI breakdown):

\[
\text{required\_score} = 100 \times \frac{\sum_{\text{required}} w_i c_i}{\sum_{\text{required}} w_i}
\]

\[
\text{preferred\_score} = 100 \times \frac{\sum_{\text{preferred}} w_i c_i}{\sum_{\text{preferred}} w_i}
\]

#### Worked example

JD terms after extraction: `python` (required), `docker` (required), `aws` (preferred).
Resume has strong match for python, partial for docker, missing aws.

| Term | \(w\) | \(c\) | contribution |
|------|-------|-------|--------------|
| python | 2 | 1.0 | \(100 \times 2/5 = 40\) |
| docker | 2 | 0.5 | \(100 \times 1/5 = 20\) |
| aws | 1 | 0.0 | 0 |
| **Total** | \(W=5\) | | **overall_score = 60** |

required_score = \(100 \times (2+1)/4 = 75\); preferred_score = 0.

#### Persisted fields

| Field | Content |
|-------|---------|
| `ats_analyses.overall_score` | Keyword coverage % |
| `ats_analyses.score_breakdown` | method, counts, term lists, required/preferred scores, section_summary |
| `ats_analyses.summary` | Counts, missing lists, optional LLM brief (`overall_inference`, focus areas, â€¦) |
| `ats_evidence` rows | One per JD term + quote, contribution, explanation, rule_id `exact_resume_quote_match_v3` |

Optional **ATS improvement brief** (`generate_ats_improvement_brief`) runs after scoring: uses missing/matched lists only; never invents experience. Provider NVIDIA or Groq; deterministic brief if neither is configured.

#### What product ATS is not

- Not a hiring prediction
- Not an LLM composite score
- Not cross-candidate ranking
- Not embedding similarity

---

### 9.2 Optional library: structured LLM ATS (composite)

**Status:** Implemented under `backend/app/features/ats/agent/` + `scoring/service.py` and covered by unit tests. **Not** the path used by `POST /ats-analyses` today (that path forces deterministic keyword coverage and passes `structured_parameter_scores=None`).

Constants in `core/constants.py`:

| Parameter key | Weight |
|---------------|--------|
| `hard_skill_match` | **0.40** |
| `experience_relevance` | **0.25** |
| `education_match` | **0.15** |
| `certifications_match` | **0.10** |
| `seniority_alignment` | **0.10** |
| **Sum** | **1.00** |

Pipeline (`run_pipeline`):

1. LLM parse resume → `ResumeParsed` (skills, experience, education, certifications, years).\
2. LLM parse JD → `JDParsed` (domain, role_family, required/preferred skills, min years, mandatory criteria).\
3. **Domain gate** (rule + model):
   - Skill overlap = \(|resume\_skills \cap required\_skills| / |required\_skills|\).
   - If domain family mismatches **and** overlap \(< 0.15\) (`DOMAIN_GATE_MIN_SKILL_OVERLAP`) → **REJECT**.\
   - Also REJECT if no experience entry matches role family / industry.
   - REJECT → all parameter scores 0, `composite_score = 0`.\
4. On **ALLOW**, scorer outputs each parameter in \([0,100]\).
5. Composite (always recomputed in code, not trusted from model alone):

\[
\text{composite\_score} = \mathrm{round}\Bigl(
  0.40\,H + 0.25\,E + 0.15\,Ed + 0.10\,C + 0.10\,S,\; 2\Bigr)
\]

Treat this as a **library / research path**, not the persisted product score unless you re-wire the router.

---

### 9.3 Profile completion (0–100)

**File:** `backend/app/features/profile/completion.py`
Recalculated on profile mutations via `recalculate_completion` — **not** on page load bootstrap.

Checklist weights (sum = **100**). Resume upload/confirm is **not** included.

| Key | Label | Points |
|-----|-------|--------|
| `full_name` | Full name | 10 |
| `location` | Location | 8 |
| `current_role` | Current role | 10 |
| `target_roles` | Target roles (preferences list) | 8 |
| `experience` | Work experience rows **or** years_experience = 0 (fresher) | 22 |
| `skills` | At least one skill | 17 |
| `education` | At least one education row | 10 |
| `work_modes` | Preferred work modes | 5 |
| `preferred_locations` | Preferred job locations | 5 |
| `links` | Professional link | 5 |

\[
\text{profile\_completion} = \sum \text{points of completed items}
\quad\in [0,100]
\]

---

### 9.4 Job recommendation match score

**File:** `backend/app/features/career_matching.py`
**Algorithm version:** `evidence-keyword-match-v1`
**Endpoint:** `POST /api/v1/job-recommendations/generate`

Evidence:

- Candidate skills from `candidate_skills` + skills-like resume sections + resume plain text.
- Job `requirements` list from local `jobs` table.

Matching:

- Requirement is **matched** if normalized name is in skill set **or** phrase appears in evidence text.
- Title terms (3+ letter tokens from job title) that appear in evidence add **role hits**.

Formula:

\[
\text{if requirements exist:}\quad
\text{match\_score} = \mathrm{round}\Bigl(
  \frac{|\text{matched}|}{|\text{requirements}|}\times 80
  + \min(\text{role\_hits}, 4)\times 5,\; 1\Bigr)
\]

\[
\text{if no requirements:}\quad
\text{match\_score} = \mathrm{round}\bigl(\min(\text{role\_hits}\times 12,\; 40),\; 1\bigr)
\]

So requirements drive up to **80** points; title/role evidence up to **20** more (4 Ã— 5). Results are ranked and top `limit` stored in `job_recommendations`.

---

### 9.5 Learning path progress

\[
\text{progress\_percentage} = \mathrm{round}\Bigl(
  \frac{\#\{\text{items with status completed}\}}{\#\text{items}}\times 100\Bigr)
\]

(0 if no items.)

---

### 9.6 Learning path generation (not a numeric "scoreâ€ , but the pipeline)

**Algorithm version:** `ats-youtube-api-v1`
**Endpoint:** `POST /api/v1/learning-paths/generate`
**Requires:** at least one **completed** ATS analysis (optional `source_analysis_id`).

Sequential crew (`learning/agents/crew/`):

1. **Gap analyst (deterministic)** — unique requirements with `match_status` in `{not_found, partial_match}` from `ats_evidence`.\
2. **YouTube planner (Groq or deterministic)** — one study step per gap with **search queries only** (no video IDs).\
3. **Validator + materializer** — for each step:
   - If `YOUTUBE_API_KEY` configured → YouTube Data API v3 `search` (`type=video`, `safeSearch=strict`, `videoEmbeddable=true`, max results from settings).\
   - Store exact `https://www.youtube.com/watch?v=<api_id>` only.
   - If API unavailable → **search results page URL only** (never invent watch IDs).

Items/resources are written to `learning_paths` → `learning_items` → `learning_resources`.

---

## 10. Document parsing pipeline

**Goal:** Accurate plain text + clean **sections** for review/confirm (no source-block UI in product payload).

**Entry:** `parse_document_bytes` in `document_parsing/pipeline.py`.

### 10.1 Text extraction

| Format | Engine | Notes |
|--------|--------|-------|
| PDF | **Docling only** | Layout-aware; missing Docling → HTTP 503 `docling_not_installed` |
| DOCX | python-docx (native); Docling optional | |

`DOCLING_INFERENCE_COMPILE_TORCH_MODELS=false` is set for portable Windows CPU installs.

### 10.2 Section segregation

`extract_sections_enriched` (`parsing/llm_sections.py`):

1. Split plain text into numbered lines (cap ~400).
2. If LLM available: model assigns **line numbers + section kinds only**; content is reconstructed from source lines (never model-written body).
   - NVIDIA first (rate-limit throttle ~1.6s interval); Groq only on NVIDIA 429.
3. Else: structural layout heuristics (headings, bullets, contact detection).

### 10.3 Stored structured payload

```json
{
  "schema_version": "resume-extraction-v1",
  "sections": { "skills": ["â€¦"], "experience": ["â€¦"] },
  "warnings": [],
  "extraction_method": "â€¦"
}
```

No `source_blocks` in the product payload.

### 10.4 Confirm flow

User reviews sections → may patch extraction → `POST .../confirm` on resume version or JD → `extraction_status = confirmed` → eligible for ATS / job recommendations / preparation.

---

## 11. Feature flows (end-to-end)

### A. ATS loop (primary product journey)

```text
1. Sign up / sign in  →  JWT + cookie
2. Onboarding / profile (optional completion checklist)
3. POST /resumes (multipart)  →  Docling + sections  →  review_required
4. User reviews sections → POST /resume-versions/{id}/confirm
5. POST /job-descriptions (text) or /job-descriptions/upload
6. Confirm JD → POST /job-descriptions/{id}/confirm
7. POST /ats-analyses { resume_version_id, job_description_id }
     → score_resume() keyword formula
     → insert ats_analyses + ats_evidence
     → optional improvement brief into summary
8. UI report: overall_score %, evidence table, missing keywords, brief
9. Improve offline → re-upload new resume version → confirm → re-run ATS
```

UI: `/resume-analysis`, `/resume-analysis/new`, `/review`, `/report/[id]`.

### B. Learning loop

```text
1. Complete â‰¥1 ATS analysis
2. POST /learning-paths/generate  (optional source_analysis_id)
3. Open /learning/[pathId] → watch exact YouTube URLs
4. PATCH item status → progress_percentage recalculated
5. DELETE /learning-paths/{id} cascades items + resources
```

### C. Interview loop

```text
1. Optional POST /interview-preparation (resume + JD evidence → question pack)
2. POST /interviews  → create session (mode, role, difficulty, counts, media flags)
3. POST /interviews/{id}/start  → Groq structured questions or local templates
4. POST .../responses  → store typed/transcript/media paths
5. POST .../complete  → session completed (no AI grading of answers)
6. DELETE session if desired
```

UI: `/mock-interview`, `/setup`, `/preparation`, `/session/[id]`, `/report/[id]`.

### D. Jobs loop

```text
1. Confirmed active resume
2. POST /job-recommendations/generate  → score_job formula vs local jobs
3. Browse GET /jobs, save POST /saved-jobs/{job_id}
```

### E. Profile fill from resume

```text
POST /profile/from-resume/preview  (or preview-upload)
  → NVIDIA + deterministic draft (skills, experience, education, â€¦)
User reviews → POST /profile/from-resume/apply
  → insert validated rows; recalculate profile completion
```

### F. Resume improvement (API only; no full editor UI)

```text
GET  /resume-improvements/capabilities
POST /resume-improvements
GET  /resume-improvements/{run_id}/suggestions
PATCH /resume-suggestions/{id}  (accept/reject/edit)
POST /resume-improvements/{run_id}/apply
POST /resume-versions/{id}/exports + download
```

Evidence validation uses source text hashes so suggestions cannot invent content detached from the resume.

---

## 12. API map

Base: **`/api/v1`** (override with `API_V1_PREFIX`).
Browser calls go through **`/api/backend/...`** which maps 1:1 onto that prefix.

### Auth & health

| Method | Path | Auth |
|--------|------|------|
| POST | `/auth/sign-up` | No |
| POST | `/auth/sign-in` | No |
| POST | `/auth/session` | Yes |
| POST | `/auth/sign-out` | No (clears cookie) |
| POST | `/auth/resend`, `/auth/reset-password` | No (stubs) |
| POST | `/auth/update-password` | Yes |
| GET | `/health`, `/health/database`, `/agents/status` | No |
| GET | `/files/{bucket}/{path}` | Yes (path must start with `{user_id}/`) |

### Me / profile

| Method | Path |
|--------|------|
| GET | `/me/bootstrap`, `/me/activity` |
| GET/PATCH | `/profile` |
| POST/DELETE | `/profile/avatar` |
| PUT | `/profile/preferences` |
| POST | `/profile/skills/from-resume` |
| POST | `/profile/from-resume/preview`, `/preview-upload`, `/apply` |
| GET/POST/PATCH/DELETE | `/profile/{resource}` â€¦ |

Profile resources include skills, experiences, projects, education, certifications, languages, links (via `CANDIDATE_TABLES`).

### Resumes & JDs

| Method | Path |
|--------|------|
| GET/POST | `/resumes` |
| GET/PATCH/DELETE | `/resumes/{id}` |
| GET | `/resumes/{id}/preview` |
| POST | `/resumes/{id}/activate`, `/resumes/{id}/versions` |
| GET | `/resume-versions/{id}` |
| PATCH | `/resume-versions/{id}/extraction` |
| POST | `/resume-versions/{id}/confirm` |
| GET/POST | `/job-descriptions` |
| POST | `/job-descriptions/upload` |
| GET | `/job-descriptions/{id}` |
| PATCH | `/job-descriptions/{id}/metadata`, `/extraction` |
| POST | `/job-descriptions/{id}/confirm` |

### ATS

| Method | Path | Notes |
|--------|------|-------|
| GET | `/ats-analyses` | List owned analyses |
| POST | `/ats-analyses` | Product scorer + persistence |
| GET/DELETE | `/ats-analyses/{id}` | |
| GET | `/ats-analyses/{id}/evidence`, `/suggestions` | |
| POST | `/ats/score` | Same deterministic scorer, **no** DB write |

### Resume improvement

| Method | Path |
|--------|------|
| GET | `/resume-improvements/capabilities` |
| POST | `/resume-improvements` |
| GET | `/resume-improvements/{run_id}`, `.../suggestions` |
| PATCH | `/resume-suggestions/{id}` |
| POST | `/resume-improvements/{run_id}/apply` |
| GET | `/resume-comparisons` |
| POST | `/resume-versions/{id}/exports` |
| GET | `/resume-exports/{id}/download` |

### Interview

| Method | Path |
|--------|------|
| POST | `/interview-preparation` |
| GET/POST | `/interviews` |
| GET/DELETE | `/interviews/{id}` |
| POST | `/interviews/{id}/start`, `/responses`, `/complete` |

### Learning

| Method | Path |
|--------|------|
| GET/POST | `/learning-paths` |
| POST | `/learning-paths/generate` |
| GET/DELETE | `/learning-paths/{id}` |
| PATCH | `/learning-paths/{id}/items/{item_id}` |

### Jobs & settings

| Method | Path |
|--------|------|
| GET | `/jobs`, `/jobs/{id}` |
| GET/POST | `/job-recommendations`, `/job-recommendations/generate` |
| GET/POST/PATCH/DELETE | `/saved-jobs` â€¦ |
| GET | `/settings` |
| PUT | `/settings/notifications`, `/settings/privacy` |
| DELETE | `/account` |

---

## 13. Frontend routes & request path

| Route | Purpose |
|-------|---------|
| `/` | Marketing landing |
| `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`, `/verify-email` | Auth UI (email delivery stubs) |
| `/onboarding` | First-time profile |
| `/dashboard` | Workspace home (bootstrap counts, latest ATS, activity) |
| `/resume-analysis`, `/new`, `/review`, `/report/[id]` | Resume + ATS |
| `/mock-interview`, `/setup`, `/preparation`, `/session/[id]`, `/report/[id]` | Interviews |
| `/learning`, `/learning/[pathId]`, `/learning/topic/[topicId]` | Learning paths |
| `/jobs`, `/jobs/saved`, `/jobs/[jobId]` | Jobs |
| `/settings/profile`, `/account`, `/preferences`, `/privacy` | Settings |
| `/api/backend/[...path]` | BFF → FastAPI |
| `/api/files/[bucket]/[...path]` | BFF → file download |

Shared route helpers: `frontend/src/shared/routes.ts`.
Config constants: `frontend/src/shared/config.ts`
(`ACCESS_TOKEN_STORAGE_KEY`, `SESSION_COOKIE_NAME`, `BROWSER_API_PROXY_PREFIX`, demo cookie).

### Browser vs server API base

| Context | Base |
|---------|------|
| Browser | `/api/backend` (always) |
| Static browser bundle | `{PUBLIC_API_BASE_URL|VITE_API_BASE_URL}{API_V1_PREFIX}` |

In-flight GET dedupe lives in memory only (no client data cache).

---

## 14. Database & file storage

- **Database setup:** `FIREBASE_SETUP.md`
- **Engine:** Firebase Cloud Firestore
- **Client:** `backend/app/database/client.py` — chainable collection/document adapter and ownership helpers in `repository.py`

### Main table groups

| Group | Tables |
|-------|--------|
| Identity | `users`, `profiles` |
| Profile content | `candidate_preferences`, `candidate_skills`, `candidate_experiences`, `candidate_projects`, `candidate_education`, `candidate_certifications`, `candidate_languages`, `candidate_links` |
| Documents | `resumes`, `resume_versions`, `job_descriptions` |
| ATS | `ats_analyses`, `ats_evidence` |
| Improvements | `resume_suggestions`, `resume_exports` (+ improvement runs as implemented in app layer) |
| Interview | `interview_sessions`, `interview_questions`, `interview_responses`, `interview_reports` |
| Learning | `learning_paths`, `learning_items`, `learning_resources` |
| Jobs | `jobs`, `job_recommendations`, `saved_jobs` |
| Settings / activity | `notification_preferences`, `privacy_preferences`, `activity_events` |

### Extraction statuses

`pending` → `processing` → `review_required` → **`confirmed`** (or `failed`).

### Files

Under Firebase Storage `{FIREBASE_STORAGE_BUCKET}/{DOCUMENT_BUCKET|AVATAR_BUCKET|INTERVIEW_BUCKET}/{user_id}/...`:

| Bucket env | Typical use |
|------------|-------------|
| `DOCUMENT_BUCKET` | Resume/JD binaries, exports |
| `AVATAR_BUCKET` | Profile pictures |
| `INTERVIEW_BUCKET` | Audio/video responses |

Access: `GET /api/v1/files/{bucket}/{path}` only if path is under the authenticated user id.

---

## 15. Setup, run & scripts

### Prerequisites

- Node.js 20+ recommended
- Python **3.11–3.13**\
- Windows scripts use `backend\.venv\Scripts\python.exe`

### Install

```bash
# From repo root
cp .env.example .env   # Windows: copy manually
# Edit .env: AUTH_SECRET, optional NVIDIA/GROQ/YOUTUBE keys

npm run setup
# installs frontend deps, creates backend venv, installs package,
# verifies the configured Firebase Firestore connection
```

Docling is already a core dependency in `backend/pyproject.toml`. If PDF parse returns 503, reinstall:

```bash
backend\.venv\Scripts\python.exe -m pip install "docling>=2.0,<3"
```

Optional official CrewAI package (Python &lt; 3.14):

```bash
backend\.venv\Scripts\python.exe -m pip install -e "backend/.[crewai]"
```

Without it, CrewAI-compatible built-in orchestrators still run for learning / improvement.

### Run

```bash
npm run dev
# frontend ~ http://127.0.0.1:3000
# backend  ~ http://127.0.0.1:8000
# OpenAPI  ~ http://127.0.0.1:8000/docs  (non-production)
```

Or: `npm run dev:frontend` / `npm run dev:backend`.

### Scripts

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
| frontend `npm run test` / `e2e` | Vitest / Playwright |

---

## 16. Testing

| Area | Location |
|------|----------|
| ATS keyword scoring + gate + schemas | `backend/tests/ats_scoring/` |
| Document parsing / sections | `backend/tests/document_parsing/` |
| Interview preparation | `backend/tests/interview/` |
| Learning YouTube crew | `backend/tests/learning/` |
| Avatars | `backend/tests/test_avatar_storage.py` |
| Resume fixtures | `backend/tests/fixtures/resumes/` |
| Frontend unit | `frontend/src/**/__tests__` |
| Landing e2e | `frontend/e2e/landing.spec.ts` |

```bash
npm run test:backend
cd frontend && npm run test
```

---

## 17. Design principles

1. **Evidence over invention** — resume/JD text and user confirmations are the source of truth.\
2. **Server-enforced ownership** — candidate data lives in Firestore + file buckets.
3. **Server-side secrets** — NVIDIA, Groq, YouTube keys never in the browser.\
4. **Explainable ATS** — one product scoring file (`ats_score.py`), weighted keyword coverage, exact quotes.\
5. **Simple parse UI** — sections only; Docling for PDF accuracy.\
6. **YouTube without hallucination** — video IDs only from YouTube API (or search-page fallback).\
7. **Delete what you create** — resumes, ATS, interviews, learning paths, full account wipe.\
8. **Stable error codes** — `ApiError` for clients; request IDs on every response.
9. **Premium UI aesthetic** — leveraging glassmorphism, modern typography, and dynamic visual indicators.

---

## 18. Quick reference

| Question | Answer |
|----------|--------|
| How is product ATS scored? | `backend/app/features/ats/ats_score.py` — §9.1 formula |
| What are composite parameter weights? | §9.2 library only; **not** persisted by `/ats-analyses` |
| How is auth done? | scrypt passwords + HS256 JWT + localStorage/cookie — §4 |
| How are PDFs parsed? | Docling in `document_parsing/parsing/text_extract.py` + `pipeline.py` |
| Profile completion points? | `features/profile/completion.py` — §9.3 |
| Job match formula? | `features/career_matching.py` — §9.4 |
| Learning videos? | `learning/youtube_api.py` + crew in `learning/agents/crew/` |
| Routes (API)? | `backend/app/api/router.py` + `features/ats/routes.py` + improvement routes |
| Routes (UI) | `frontend/src/App.tsx` and `frontend/src/shared/router.ts` |
| Database setup? | `FIREBASE_SETUP.md` |
| Env template? | `.env.example` |
| Agent inventory at runtime? | `GET /api/v1/agents/status` |

---

*This README matches the current codebase: Firebase Firestore career workspace, Docling PDF extraction, product ATS as evidence-backed keyword coverage (`evidence-keyword-coverage-v3`), optional structured LLM ATS library with domain gate + composite weights, YouTube Data API learning paths, mock interviews without AI grading, profile/jobs/settings, BFF-proxied JWT auth, and no in-app post-ATS resume editor. Prefer `/health` and `/agents/status` at runtime over assumptions about which keys are configured.*


## 19. Scaling Considerations

Career Copilot uses a cloud-backed Firestore workspace. The remaining scaling considerations are:

- **Background Jobs:** Offload heavy tasks (e.g., Docling PDF extraction, ATS scoring, and LLM calls) to a background worker system like Celery or Redis Queue (RQ) to prevent blocking the main FastAPI thread.
- **Storage:** Move local file storage for resumes and generated assets to cloud object storage (e.g., AWS S3, Google Cloud Storage) for durability and horizontal scaling of backend nodes.
- **Caching:** Introduce a caching layer (e.g., Redis) for frequent queries, such as job browsing, profile data, or YouTube Data API responses, to reduce latency and API quota usage.
- **Load Balancing:** Deploy behind a load balancer to distribute traffic across multiple backend and frontend instances.
