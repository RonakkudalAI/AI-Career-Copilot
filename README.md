# Career Copilot

**One project. One README.** Everything you need to understand, run, and debug Career Copilot lives in this file.

---

## What this project is (in plain language)

Career Copilot is a **career prep web app** for people who want honest help with resumes, job applications, and interview practice.

It helps you:

1. **Build a real profile** (name, skills, experience, education, preferences, links).
2. **Upload a resume and a job description**, then get an **ATS-style keyword score** that is calculated with simple rules (not a magic “AI hiring score”).
3. **Edit that same resume** to add missing keywords only when they are true for you, with optional AI rewrite suggestions that must stick to your real text.
4. **Practice mock interviews** with generated questions.
5. **Track learning paths and saved jobs** from data stored in your account.

### The golden rule

> **The app should not invent your career.**  
> It only works from what you type, upload, confirm, or explicitly accept.  
> Your browser’s local storage is **not** the source of truth — **Supabase (database + files + login)** is.

---

## Table of contents

1. [How the system works (big picture)](#1-how-the-system-works-big-picture)
2. [What you can do in the product](#2-what-you-can-do-in-the-product)
3. [Tech stack (what each piece is for)](#3-tech-stack-what-each-piece-is-for)
4. [Folder layout (where things live)](#4-folder-layout-where-things-live)
5. [Backend deep dive (API layer)](#5-backend-deep-dive-api-layer)
6. [Frontend deep dive (UI layer)](#6-frontend-deep-dive-ui-layer)
7. [How login and security work](#7-how-login-and-security-work)
8. [How profile completion works](#8-how-profile-completion-works)
9. [How resume upload and parsing work](#9-how-resume-upload-and-parsing-work)
10. [How ATS scoring works](#10-how-ats-scoring-works)
11. [How in-place resume edit and AI improve work](#11-how-in-place-resume-edit-and-ai-improve-work)
12. [How profile fill from resume works](#12-how-profile-fill-from-resume-works)
13. [How mock interviews work](#13-how-mock-interviews-work)
14. [How AI agents are organized](#14-how-ai-agents-are-organized)
15. [Database and storage](#15-database-and-storage)
16. [API map (what the server exposes)](#16-api-map-what-the-server-exposes)
17. [Pages and routes in the app](#17-pages-and-routes-in-the-app)
18. [Environment variables](#18-environment-variables)
19. [Setup and run (step by step)](#19-setup-and-run-step-by-step)
20. [Scripts and day-to-day commands](#20-scripts-and-day-to-day-commands)
21. [Debugging checklist](#21-debugging-checklist)
22. [What this project deliberately does not do](#22-what-this-project-deliberately-does-not-do)
23. [Typical user journeys](#23-typical-user-journeys)

---

## 1. How the system works (big picture)

Think of three layers:

```text
┌─────────────────────────────────────────────────────────────┐
│  YOU (browser)                                              │
│  Next.js website — forms, pages, toast, PDF preview         │
└───────────────────────────┬─────────────────────────────────┘
                            │  Login session (JWT) + HTTPS API calls
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  FASTAPI BACKEND  (/api/v1)                                 │
│  Checks your login, talks to database, runs scoring & AI    │
└───────────────────────────┬─────────────────────────────────┘
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
   Supabase Auth     PostgreSQL + RLS    Private Storage
   (who you are)     (your rows only)    (PDF, avatar, …)
                            │
                            ▼ (optional)
                   NVIDIA / Groq AI APIs
                   (server-side keys only)
```

### What happens when you click something

1. The website checks you are signed in (Supabase Auth in the browser).
2. It calls the backend with your **access token** (`Authorization: Bearer …`).
3. The backend trusts that token, then talks to Supabase **as you** (so row-level security applies).
4. Results come back as JSON; the UI shows them.
5. AI keys never ship to the browser — only the backend can call NVIDIA or Groq.

---

## 2. What you can do in the product

| Area | What it means for you |
|------|------------------------|
| **Sign up / sign in** | Email/password (and auth callback routes for email links). Password field supports hold-to-reveal. |
| **Onboarding** | Short first-run path so your name and basics are not blank. |
| **Dashboard** | Snapshot of resumes, ATS runs, interviews, saved jobs, recent activity, and profile completion. |
| **Profile & settings** | Edit personal info, skills, experience, education, links, preferences; upload avatar (max 3 MB); privacy; delete account. |
| **Profile completion toast** | Corner reminder listing **only what is still missing**, with accurate % from the server. |
| **Resume library** | Upload PDF/DOCX, review extracted sections, confirm, preview PDF **in a modal**, set active resume. |
| **Job descriptions** | Paste text or upload a JD file, review, confirm. |
| **ATS analysis** | Score how many JD keywords appear in your resume; list missing keywords; short improvement note. |
| **Resume edit after ATS** | Edit the **same** resume (not a fake empty copy). Add missing keywords only if you confirm. Optional AI rewrites. Export PDF/DOCX. Re-score. |
| **Mock interview** | Create a session, get questions, answer, finish or delete. |
| **Learning & jobs** | Browse/save from data stored in the database (not invented in the browser). |

---

## 3. Tech stack (what each piece is for)

### Frontend (the website)

| Tool | Why it is here |
|------|----------------|
| **Next.js (App Router)** | Pages, layouts, routing |
| **React + TypeScript** | UI components with types |
| **Tailwind CSS** | Styling |
| **Lucide** | Icons |
| **Motion** | Light animations |
| **Three.js / React Three Fiber** | Marketing landing globe |
| **@supabase/ssr + supabase-js** | Browser and server auth sessions |

### Backend (the API)

| Tool | Why it is here |
|------|----------------|
| **Python 3.11–3.13** (prefer **3.12**) | Runtime. **3.14+ is not supported** by this package / official CrewAI. |
| **FastAPI + Uvicorn** | HTTP API server |
| **Pydantic / pydantic-settings** | Request bodies + reading `.env` |
| **httpx** | Calling NVIDIA / Groq |
| **supabase Python client** | Database + storage with your JWT |
| **pypdf / python-docx / reportlab** | Read resumes, write DOCX/PDF exports |
| **Docling** (optional) | Heavier, layout-aware PDF text if you install it |
| **crewai** (optional) | Official multi-agent package on supported Python |

### Data platform

| Tool | Why it is here |
|------|----------------|
| **Supabase Auth** | Sign-up, sign-in, JWT |
| **PostgreSQL** | All durable app data |
| **Supabase Storage** | Private files (resumes, avatars, interview media, exports) |
| **SQL migrations** | Schema, security policies, buckets |

### AI providers

| Provider | Used for | Not used for |
|----------|----------|--------------|
| **NVIDIA** | Resume rewrite suggestions, smarter profile fill, preferred ATS brief | Interview questions |
| **Groq** | Interview questions; ATS brief if NVIDIA is off | Resume improve “fallback” |

If an AI key is missing, the product still works with **rules/templates** where designed (for example: template interview questions, rule-based ATS brief, deterministic profile extract).

---

## 4. Folder layout (where things live)

```text
career-copilot_v1/
│
├── README.md                 ← you are here (only project README)
├── .env                      ← secrets & config (not committed)
├── package.json              ← frontend + npm scripts
├── scripts/                  ← install, dev, env check, secret scan
│   ├── dev.mjs               ← start API + website together
│   ├── dev-backend.mjs
│   ├── setup-backend.mjs     ← create backend/.venv, install Python package
│   ├── verify-environment.mjs
│   └── check-secrets.mjs
│
├── public/                   ← static brand assets
│
├── src/                      ← NEXT.JS frontend
│   ├── app/                  ← routes (marketing, auth, workspace)
│   ├── components/           ← shell, toast, shared UI
│   ├── features/             ← screen logic by domain
│   ├── lib/                  ← API client, Supabase, profile-completion helpers
│   └── types/
│
├── backend/                  ← FASTAPI API (no separate README)
│   ├── pyproject.toml        ← Python package career-copilot-api
│   ├── .venv/                ← local Python env (created by setup)
│   └── app/                  ← import root: `app.main`, `app.routes`, …
│       ├── main.py
│       ├── config.py
│       ├── auth.py
│       ├── routes.py
│       ├── repository.py
│       ├── profile_completion.py
│       ├── ats.py
│       ├── resume_improvements.py
│       ├── agents/           ← AI agents, prompts, crew, LLM clients
│       └── parsing/          ← extract text + sections from files
│
└── supabase/
    ├── migrations/           ← database schema over time
    └── seed.sql              ← optional seed data
```

There is **no** `backend/README.md`. Backend detail is documented **here**.

---

## 5. Backend deep dive (API layer)

### What the backend is

A **FastAPI** app whose job is:

- Check your login token.
- Read/write **only your rows** in Supabase.
- Run deterministic scoring and parsing.
- Call AI when keys are set and the feature needs it.
- Return clean JSON errors (`ApiError`) instead of leaking stack traces to the client.

Entry point: `backend/app/main.py`  
Routes live mainly in `backend/app/routes.py` and `backend/app/resume_improvement_routes.py`.  
Public API prefix: **`/api/v1`**.

### Important backend modules (simple meanings)

| File / folder | What it does |
|---------------|--------------|
| `config.py` | Loads the **root** `.env` and exposes settings (Supabase, NVIDIA, Groq, buckets, limits). |
| `auth.py` | Turns the Bearer token into a `CurrentUser` (id, email, name metadata). |
| `supabase_clients.py` | Builds a **user client** (publishable key + your JWT) or an **admin client** (secret key) for rare ops like health/purge. |
| `repository.py` | “Owned rows” helpers, activity feed write/prune, **profile completion recalculation**. |
| `profile_completion.py` | Pure scoring math: checklist items → percentage + missing list. |
| `routes.py` | Most HTTP endpoints (profile, resumes, JD, ATS, interviews, jobs, settings, bootstrap). |
| `resume_improvement_routes.py` | AI improve + apply routes. |
| `ats.py` | Keyword coverage score (no LLM). |
| `parsing/` | Pull text from PDF/DOCX; split into sections. |
| `documents.py` / validation helpers | File size/type checks. |
| `resume_improvements.py` | In-place edit apply, AI suggestion pipeline, evidence checks. |
| `resume_exports.py` | Build PDF/DOCX and signed download URLs. |
| `avatars.py` | Avatar size/type checks + signed URLs. |
| `account_deletion.py` | Wipe user data when they delete their account. |
| `agents/` | All product AI: registry, NVIDIA/Groq clients, prompts, crew orchestrator. |
| `schemas.py` | Request/response shapes. |

### How a typical protected request is handled

1. Middleware assigns a **request id** and security headers.
2. Route dependency `get_current_user` validates JWT.
3. `client_for(settings, user)` opens Supabase as that user.
4. Handlers query with `.eq("user_id", user.id)` (and RLS still applies).
5. Side effects (activity row, completion recalculation) run when needed.
6. Response is JSON; errors use a stable code + human message.

### Database connectivity (how it is done)

- **Normal app traffic:** user JWT + publishable key → PostgREST/Storage.  
- **Admin-only helpers:** secret key (health probe, full account purge).  
- FastAPI does **not** open a raw Postgres connection string for day-to-day queries.  
- Schema lives in `supabase/migrations/` — apply those in your Supabase project.

### Optional backend extras

```powershell
cd backend
.\.venv\Scripts\activate
pip install -e ".[docling]"   # better PDF layout extraction
pip install -e ".[crewai]"    # official CrewAI package (Python < 3.14 only)
```

Without those extras, the app still runs: basic PDF/DOCX parsers and a **built-in CrewAI-compatible** sequential orchestrator for resume improve.

### Compatibility shims

Older import paths like `app.nvidia_client` still re-export the newer agent modules so nothing breaks during refactors.

---

## 6. Frontend deep dive (UI layer)

### How the UI is organized

| Area | Role |
|------|------|
| `src/app/` | Next.js routes and layouts (URL → page). |
| `src/features/` | Real product screens (dashboard, resume flow, interview, settings, …). |
| `src/components/` | Shared chrome: workspace shell, toast, buttons/cards. |
| `src/lib/api/client.ts` | Attaches your Supabase session token to every API call. |
| `src/lib/supabase/` | Browser/server Supabase clients. |
| `src/lib/profile-completion.ts` | Shared helpers for % / missing items + “profile updated” browser event. |

### Workspace shell

`src/components/layout/workspace-shell.tsx`:

- Loads **`GET /me/bootstrap`** once when you enter the signed-in area.
- Shows sidebar, active resume label, avatar menu, theme toggle.
- Hosts the **profile completion toast**.
- Refreshes completion when:
  - the custom event `career-copilot:profile-updated` fires (after you save profile pieces), or
  - you leave Settings (so the score is fresh).

### API client behavior

`apiRequest` points at `NEXT_PUBLIC_API_BASE_URL` + `/api/v1`, sends the JWT, and surfaces backend error messages in the UI.

---

## 7. How login and security work

### Login flow (simple)

1. You sign up or sign in on the website (Supabase Auth).
2. Supabase stores a session (access + refresh tokens) using its SSR/browser helpers.
3. Every API call includes the **access token**.
4. Backend verifies the token and loads your user id.
5. All tables are filtered by `user_id` and protected by **RLS policies**.

### Security principles (how it is done)

| Principle | How |
|-----------|-----|
| No service secrets in the browser | Only `NEXT_PUBLIC_*` values are client-visible. |
| User-scoped data | Queries always owned by `user.id`; storage paths under your auth id. |
| Private files | Storage buckets are private; downloads use short-lived signed URLs. |
| AI on the server | NVIDIA/Groq keys only in root `.env`, read by FastAPI. |
| Honest AI | Validators drop invented employers, fake metrics, contact changes, etc. |
| Account deletion | Server removes owned rows and known storage objects. |
| Secret hygiene | `.env` is gitignored; `npm run check:secrets` scans for leaks. |

---

## 8. How profile completion works

### Why it exists

So you always know **how full your profile is**, and what is still empty — without guessing and without tying completion to uploading a resume.

### Source of truth

- Math: `backend/app/profile_completion.py`
- Save to DB: `repository.recalculate_completion`
- Shown in UI from server fields: `profile_completion` + `profile_completion_details.missing`

### What counts (and what does not)

- **Counts:** profile text fields, preferences lists, skills, experience **or** fresher (0 years), education, links.
- **Does not count:** uploading or confirming a resume. You can hit **100% without any resume**.

### Exact checklist (sums to 100)

| Item | Points | Complete when… |
|------|--------|----------------|
| Full name | 10 | Name is non-empty |
| Location | 8 | Location is non-empty |
| Current role | 10 | Current role is non-empty |
| Target roles | 8 | At least one target role in preferences |
| Work experience | 22 | At least one experience row **or** years of experience set to **0** (fresher) |
| Skills | 17 | At least one skill row |
| Education | 10 | At least one education row |
| Preferred work modes | 5 | At least one work mode |
| Preferred job locations | 5 | At least one preferred location |
| Professional link | 5 | At least one link (LinkedIn, GitHub, …) |

### When the score recalculates

Examples (not exhaustive): opening bootstrap, loading/saving profile, changing preferences, adding/editing/deleting skills/experience/education/links, applying profile-from-resume, deleting a resume (other data may still drive the score).

Each recalculation:

1. Reads live rows from the database.
2. Scores the checklist.
3. Writes `profiles.profile_completion` (0–100) and `profile_completion_details` (including `missing` and `completed` lists with labels and points).

### Toast and live sync (how the UI stays accurate)

1. Bootstrap returns `workspace.profile_completion` and `workspace.profile_missing`.
2. Corner toast (`profile-completion-toast.tsx`) shows:  
   **“Please complete your profile”** + % + remaining items (with `+N%` points).
3. After you save profile data, Settings calls `notifyProfileUpdated(...)`.
4. Shell and dashboard listen for that event and refresh from the server.
5. You can dismiss the toast for the current session; it returns if the % changes.

The client **filters out** any old stale `"resume"` missing item so retired rules never reappear in the UI.

---

## 9. How resume upload and parsing work

### Step by step

1. You upload a PDF or DOCX (size/type validated).
2. File is stored in the private **candidate-documents** bucket under your user id.
3. Backend extracts **plain text** (`pypdf` / `python-docx`, or Docling if installed).
4. Text is split into **sections** (summary, skills, experience, projects, education, …). Anything unclear goes to `unclassified_blocks`.
5. A **resume version** is saved with `extraction_status` not yet confirmed.
6. You **review** in the UI and **confirm** when the extract looks right.
7. Only confirmed versions are used for ATS scoring and improvement runs that require confirmation.

### PDF preview (how it is done)

- From the resume library, **Preview** opens a **modal** (not a new tab).
- Prefer the original PDF when it is still valid.
- After structural edits or DOCX sources, preview uses a rendered/exported PDF of the current structured content.

### Job descriptions

Same idea: paste or upload → extract → review → confirm. ATS needs a confirmed JD + confirmed resume version.

---

## 10. How ATS scoring works

### What it is

A **keyword coverage percentage**:

> Of the important words taken from the job description, how many appear in your resume text?

It is **not** a prediction of whether you will get hired, and it does **not** use embeddings or “semantic fit.”

### Algorithm name

`deterministic-keyword-coverage-v1` in `backend/app/ats.py`.

### Formula (simple)

```text
overall_score = round( matched_keywords / total_scored_keywords * 100 , 2 )
```

Each keyword contributes equally.

### How keywords are chosen from the JD

1. Break text into tokens (letters/numbers/tech symbols).
2. Lowercase.
3. Drop common filler words (“experience”, “required”, …).
4. Keep short tech tokens on an allowlist (`ai`, `ml`, `ui`, …) plus longer tokens.
5. Keep the top **50** unique keywords by importance (frequency + first appearance).

### Match rule

A JD keyword counts as matched only if that **exact normalized token** appears in the resume token set.

### What the report shows

- Overall score.
- Missing keywords (actionable).
- An “overall inference” paragraph (AI if available, otherwise a plain rule-based note about missing terms).
- It does **not** invent fake “evidence snippets” of things that are not in your resume.

### What does **not** change the score

- How good the AI paragraph is  
- Profile completion %  
- Soft personality narratives  
- Years of experience as a separate weighted model  

---

## 11. How in-place resume edit and AI improve work

### Goal

After an ATS report, help you improve **the resume you already have** — not create an empty second resume that looks “new.”

### Manual edit path

1. Open `/resume-analysis/report/[reportId]/edit`.
2. UI loads the **same** resume version used in that analysis.
3. Left: section forms. Right: live paper preview of real content only.
4. Missing keywords appear as chips; adding one to Skills happens **only if you click**.
5. Save calls manual-edit with `apply_mode: "in_place"` → updates the **same** `resume_versions` row.

### AI improve path (how it is done)

1. You request improvements from the confirmed resume + ATS context.
2. A **crew-style sequence** runs:
   - **Gap analyst** — reads missing keywords already scored (no invention).
   - **Improver** — NVIDIA suggests rewrites of **existing** blocks only.
   - **Validator** — drops unsupported numbers, new employers, contact changes, etc.
3. You accept / edit / reject suggestions.
4. Apply also defaults to **in place** on the same resume version.
5. You can export PDF/DOCX and re-run ATS on that version.

### Optional new version

`apply_mode: "new_version"` can create a history snapshot if you opt in. Default product path is **in place**.

### Inspiration

The UX pattern (score → keywords → edit → optional AI → export → re-check) is inspired by tools like Resume-Matcher, but this codebase is **project-native** (not a clone of that monorepo).

---

## 12. How profile fill from resume works

1. Pick a stored resume version or upload a file for preview.
2. Backend always runs a **deterministic** extract (rules from text/sections).
3. If NVIDIA is configured, an AI extract is merged carefully with the rules path.
4. You get a **draft** to review (nothing is auto-saved into your profile yet).
5. You choose what is true and **apply**.
6. Only selected fields/rows are written; completion % is recalculated.

Empty-only modes can avoid overwriting fields you already filled.

---

## 13. How mock interviews work

1. Create an interview session (role/mode/settings in the UI).
2. **Start** generates questions:
   - Prefer **Groq** with prompt `interview_questions_v1.txt`.
   - If Groq fails or is not configured → **local templates**.
   - **NVIDIA is never used** for interview questions.
3. You answer questions in the session UI.
4. Complete the session or delete it (cleanup of related rows/media as implemented).
5. Interview “evaluation AI” is **not** a shipped product capability (capability flag stays false).

---

## 14. How AI agents are organized

### Registry (single inventory)

`backend/app/agents/registry.py` lists every product agent, provider, prompt file, readiness, and fallback.

Status endpoint: **`GET /api/v1/agents/status`** (no secrets returned).

### Product agents

| Agent id | Human name | Provider | What it does | Fallback if AI off |
|----------|------------|----------|--------------|--------------------|
| `resume_improvement` | Resume improvement | NVIDIA | Suggest rewrites of real resume blocks | Manual edit + export |
| `resume_improvement_crew` | Resume improve crew | NVIDIA + crew orchestration | Gap → improve → validate sequence | Built-in sequential orchestrator always available |
| `profile_fill` | Profile fill | NVIDIA + rules | Extract profile fields from resume | Rules-only extract |
| `interview_questions` | Interview questions | **Groq only** | Generate practice questions | Templates |
| `ats_improvement_brief` | ATS brief | NVIDIA, else Groq, else rules | Explain missing keywords only | Deterministic paragraph |

### Prompts

Versioned text files under `backend/app/agents/prompts/`, for example:

- `improve_resume_v1.txt`
- `fill_profile_from_resume_v1.txt`
- `interview_questions_v1.txt`
- `ats_improvement_v1.txt`
- `repair_structured_output_v1.txt` (helper: fix broken JSON from models — not a product feature)

### LLM clients

- `agents/llm/nvidia_client.py` — chat + structured JSON + repair pass  
- `agents/llm/groq_client.py` — structured JSON + repair pass  
- `agents/llm/common.py` — strip markdown fences, extract content safely  

### Crew runtime (resume improve)

Folder: `backend/app/agents/crew/`

- If official `crewai` is installed on Python &lt; 3.14, it can be used.
- Otherwise a **compatible sequential orchestrator** runs the same three roles with the same truth-bound tools.
- Tools never invent free-form career fiction.

### Truth rules for every agent

- Do not invent employers, titles, metrics, skills, degrees, or contact info.
- Resume suggestions must be grounded in evidence blocks.
- ATS brief talks only about **missing keywords** provided by the scorer.
- User must click to add a skill chip.
- Profile AI is always previewed before save.

---

## 15. Database and storage

### Migrations (apply in order in Supabase)

| Migration file | Purpose |
|----------------|---------|
| `20260729180000_initial_career_copilot.sql` | Core tables, RLS, buckets |
| `20260730002000_grant_api_roles.sql` | Grants for API roles |
| `20260730020000_resume_improvements.sql` | Improvement runs / suggestions / metadata |
| `20260730120000_activity_events_retention.sql` | Activity retention support |
| `20260730140000_avatar_3mb_limit.sql` | Avatar size policy (3 MB) |
| `20260731120000_job_coordinates.sql` | Job map/coordinate fields |

### Main table groups

| Group | Tables (conceptually) |
|-------|------------------------|
| Profile | `profiles`, preferences, skills, experiences, projects, education, certifications, languages, links |
| Resume / JD / ATS | `resumes`, `resume_versions`, `job_descriptions`, `ats_analyses`, `ats_evidence` |
| Improve / export | improvement runs, suggestions, exports |
| Interview | sessions, questions, responses, reports |
| Learning / jobs | paths, items, resources, jobs, recommendations, saved jobs |
| Ops | notifications prefs, privacy prefs, activity events, user notifications |

Important profile columns:

- `profile_completion` — integer 0–100  
- `profile_completion_details` — JSON with checklist, missing, completed, points  

### Private storage buckets

| Bucket | Contents |
|--------|----------|
| `candidate-documents` | Resume/JD uploads, version files, exports |
| `candidate-avatars` | Profile pictures (≤ 3 MB) |
| `interview-media` | Interview recordings if used |

---

## 16. API map (what the server exposes)

Base URL: **`{API origin}/api/v1`**.

Interactive docs (local, non-production): `http://127.0.0.1:8000/docs`

### Health and agents

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | API up + feature flags |
| GET | `/health/supabase` | Can the admin client reach the DB? |
| GET | `/agents/status` | Full agent inventory |

### Session / home

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/me/bootstrap` | Dashboard + shell payload; **recalculates profile completion** |
| GET | `/me/activity` | Recent activity |

### Profile

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/profile` | Load profile + prefs; recalculates completion |
| PATCH | `/profile` | Update core profile fields |
| POST/DELETE | `/profile/avatar` | Avatar upload / remove |
| PUT | `/profile/preferences` | Target roles, work modes, locations, … |
| POST | `/profile/skills/from-resume` | Import skill candidates |
| POST | `/profile/from-resume/preview` | Draft from stored resume |
| POST | `/profile/from-resume/preview-upload` | Draft from upload |
| POST | `/profile/from-resume/apply` | Save selected draft pieces |
| CRUD | `/profile/{resource}` | skills, experiences, education, links, … |

### Resumes and versions

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/resumes` | List / create |
| GET/PATCH/DELETE | `/resumes/{id}` | Manage resume |
| GET | `/resumes/{id}/preview` | Preview payload / signed file |
| POST | `/resumes/{id}/activate` | Set active resume |
| POST | `/resumes/{id}/versions` | Upload new version |
| GET | `/resume-versions/{id}` | Version detail |
| PATCH | `/resume-versions/{id}/extraction` | Edit extract before confirm |
| POST | `/resume-versions/{id}/confirm` | Confirm extract |
| POST | `/resume-versions/{id}/manual-edit` | In-place (or new version) edit |
| POST | `/resume-versions/{id}/exports` | Create PDF/DOCX export |
| GET | `/resume-exports/{id}/download` | Signed download |
| GET | `/resume-comparisons` | Compare versions |

### Resume AI improvements

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/resume-improvements/capabilities` | Is AI improve available? |
| POST | `/resume-improvements` | Start improve run |
| GET | `/resume-improvements/{run_id}` | Run status |
| GET | `/resume-improvements/{run_id}/suggestions` | Suggestions list |
| PATCH | `/resume-suggestions/{id}` | Accept/edit/reject |
| POST | `/resume-improvements/{run_id}/apply` | Apply to resume |

### Job descriptions and ATS

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/job-descriptions` | List / create from text |
| POST | `/job-descriptions/upload` | Upload JD file |
| GET/PATCH/confirm | `/job-descriptions/{id}…` | Manage + confirm |
| GET/POST/DELETE | `/ats-analyses` | List / create / delete analyses |
| GET | `/ats-analyses/{id}/evidence` | Evidence rows |
| GET | `/ats-analyses/{id}/suggestions` | Related suggestions |

### Interview, learning, jobs, settings, account

| Area | Paths (conceptually) |
|------|----------------------|
| Interviews | `/interviews`, start, responses, complete, delete |
| Learning | `/learning-paths` and related |
| Jobs | `/jobs`, `/saved-jobs` |
| Settings | notification + privacy preferences |
| Account | `DELETE /account` |

---

## 17. Pages and routes in the app

### Feature modules (`src/features/`)

| Module | Screens / job |
|--------|----------------|
| `auth` | Sign-in, sign-up, forgot/reset password, verify |
| `marketing` | Public landing + globe |
| `onboarding` | First-run setup |
| `dashboard` | Home metrics + completion |
| `resume` | Upload, review, report, edit, library |
| `interview` | Setup, session, report |
| `settings` | Profile (with remaining list), account, prefs, privacy |
| `jobs` | Browse, detail, saved |
| `learning` | Paths and topics |

### Important URLs

| URL | What you see |
|-----|----------------|
| `/` | Marketing landing |
| `/sign-in`, `/sign-up` | Auth |
| `/onboarding` | First-run |
| `/dashboard` | Workspace home |
| `/resume-analysis` | Resume / ATS hub |
| `/resume-analysis/review` | Extraction review |
| `/resume-analysis/report/[reportId]` | ATS report |
| `/resume-analysis/report/[reportId]/edit` | Edit existing resume |
| `/mock-interview` … | Interview flow |
| `/settings/profile` | Profile editor + completion |
| `/jobs`, `/learning` | Jobs and learning |

---

## 18. Environment variables

All config is expected in the **repository root** `.env` (not committed).  
Backend reads that file by absolute path from `backend/app/config.py`.

### Frontend (safe to expose to the browser)

| Variable | Meaning |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public/anon key |
| `NEXT_PUBLIC_API_BASE_URL` | API origin, e.g. `http://127.0.0.1:8000` |

### Backend app

| Variable | Meaning |
|----------|---------|
| `APP_NAME`, `APP_ENV`, `API_V1_PREFIX`, `LOG_LEVEL` | Service metadata |
| `FRONTEND_ORIGINS` | CORS list (comma-separated), e.g. `http://localhost:3000` |

### Supabase (server)

| Variable | Meaning |
|----------|---------|
| `SUPABASE_URL` | Same project URL |
| `SUPABASE_PUBLISHABLE_KEY` | User-scoped client |
| `SUPABASE_SECRET_KEY` | Admin-only ops (health, purge) |
| `SUPABASE_DB_URL` | Optional for CLI/migrations — **not** the FastAPI day-to-day query path |

### Storage

| Variable | Meaning |
|----------|---------|
| `DOCUMENT_BUCKET`, `AVATAR_BUCKET`, `INTERVIEW_BUCKET` | Bucket names |
| `DOCUMENT_MAX_BYTES`, `AVATAR_MAX_BYTES`, `INTERVIEW_MEDIA_MAX_BYTES` | Size limits |

### NVIDIA

| Variable | Meaning |
|----------|---------|
| `NVIDIA_API_KEY`, `NVIDIA_BASE_URL`, `NVIDIA_MODEL` | Provider setup |
| `NVIDIA_TIMEOUT_SECONDS`, `NVIDIA_MAX_RETRIES`, `NVIDIA_MAX_OUTPUT_TOKENS`, `NVIDIA_TEMPERATURE` | Call policy |
| `NVIDIA_PROMPT_VERSION` | Label for prompt versioning |
| `IMPROVEMENT_MAX_*`, `EXPORT_SIGNED_URL_SECONDS` | Safety caps / signed URL lifetime |

### Groq

| Variable | Meaning |
|----------|---------|
| `GROQ_API_KEY`, `GROQ_BASE_URL`, `GROQ_MODEL` | Provider setup |
| `GROQ_*` timeouts / retries / tokens / temperature | Call policy |

**Never** put secret keys in `NEXT_PUBLIC_*` variables.

Validate names without printing secret values:

```powershell
npm run check:env
```

---

## 19. Setup and run (step by step)

### Prerequisites

1. **Node.js** (for the website and npm scripts).
2. **Python 3.11, 3.12, or 3.13** (3.12 recommended).  
   Python **3.14+ will not work** with this package’s pin (`>=3.11,<3.14`).
3. A **Supabase project** with the SQL migrations applied.
4. Optional: NVIDIA API key, Groq API key.

### 1) Create root `.env`

Copy your real keys into `.env` at the project root (see [§18](#18-environment-variables)).

### 2) Install everything

```powershell
npm install
```

What this does:

- Installs frontend packages.
- Runs `scripts/setup-backend.mjs`, which:
  - finds a supported Python (prefers 3.12),
  - creates `backend/.venv`,
  - installs the FastAPI package (and CrewAI when possible).

If your machine has multiple Pythons:

```powershell
$env:CAREER_COPILOT_PYTHON = "C:\Path\To\Python312\python.exe"
$env:CAREER_COPILOT_RECREATE_VENV = "1"
npm install
```

### 3) Apply database migrations

In Supabase (SQL editor or CLI), apply files under `supabase/migrations/` in timestamp order.

### 4) Run the full stack

```powershell
npm run dev
```

Then open:

| Service | URL |
|---------|-----|
| Website | http://localhost:3000 |
| API | http://127.0.0.1:8000 |
| API docs | http://127.0.0.1:8000/docs |

Or run pieces separately:

```powershell
npm run dev:frontend
npm run dev:backend
```

### 5) Production-style frontend build

```powershell
npm run build
npm run start
```

API example:

```powershell
uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000
```

---

## 20. Scripts and day-to-day commands

| Command | What it does |
|---------|----------------|
| `npm install` | Frontend deps + backend venv setup |
| `npm run dev` | API + Next together |
| `npm run dev:frontend` | Next only |
| `npm run dev:backend` | Uvicorn only |
| `npm run build` / `start` | Production Next build/serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |
| `npm run check:env` | Env presence/consistency |
| `npm run check:secrets` | Scan for leaked secrets |
| `npm run check` | secrets + env + lint + typecheck + build |
| `npm run check:frontend` | lint + typecheck + build |

---

## 21. Debugging checklist

| Symptom | What to try |
|---------|-------------|
| API not reachable | `GET /api/v1/health`; confirm `npm run dev:backend` and `NEXT_PUBLIC_API_BASE_URL` |
| “Not configured / session” errors | Sign out/in; check Supabase URL/keys; `GET /api/v1/health/supabase` |
| Agents “not ready” | `GET /api/v1/agents/status`; set NVIDIA/Groq keys if you need AI paths |
| Profile % wrong / toast wrong | Save profile once (forces recalculate); hard refresh; check bootstrap `workspace.profile_missing` |
| ATS score 0 / unexpected | Confirm **both** resume version and JD are **confirmed**; score is exact keyword match only |
| Resume “created a new empty resume” | Use post-ATS **edit** flow with `in_place` (default); do not start a blank resume for that path |
| Python / venv issues | Use 3.11–3.13; set `CAREER_COPILOT_PYTHON`; recreate venv |
| CORS errors | Set `FRONTEND_ORIGINS` to include `http://localhost:3000` |

Logs: Uvicorn access logs + request id middleware help correlate a UI error with a server request.

---

## 22. What this project deliberately does not do

| Not a goal | Why / reality |
|------------|----------------|
| Clone Resume-Matcher’s full monorepo | We reimplemented the useful flow, not the whole product surface |
| Semantic / embedding ATS | Score is exact keyword coverage by design |
| AI interview grading | Questions yes; evaluation agent is off |
| AI job recommender as core product | Tables/UI may exist; capability is not claimed as live AI |
| Give profile points for uploading a resume | Completion is **profile fields only** |
| Store truth only in localStorage | Database is system of record |
| Put AI keys in the browser | Server-only |
| Support Python 3.14 for this package | Pin is `>=3.11,<3.14` |

---

## 23. Typical user journeys

### A) First day

1. Sign up / sign in.  
2. See the profile toast if your checklist is incomplete.  
3. Open **Settings → Profile** and fill remaining items (toast % updates after save).  
4. Optional: fill profile from a resume draft (preview → apply only what is true).

### B) ATS + improve resume

1. Upload resume → review extract → confirm.  
2. Add job description → confirm.  
3. Run ATS analysis → read score + missing keywords.  
4. Open **Edit resume** → fix truthfully → save in place.  
5. Optional AI suggestions → accept only good ones → apply.  
6. Export PDF/DOCX → re-run ATS on the same version.

### C) Interview practice

1. Create mock interview.  
2. Start session (Groq or templates).  
3. Answer → complete or delete.

### D) Ongoing

1. Dashboard shows latest resume / interview / job actions.  
2. Save jobs, follow learning paths.  
3. Manage privacy or delete account under settings.

---

## Package identity

| Package | Version | Role |
|---------|---------|------|
| `career-copilot` (npm) | 1.0.0 | Frontend + orchestration scripts |
| `career-copilot-api` (Python) | 1.0.0 | FastAPI backend under `backend/` |

Deploy with **your** Supabase project and **your** API keys.

---

## Final notes

- This repository has **one README**: this file.  
- Backend structure, scoring, agents, env, and run instructions are all documented above.  
- When in doubt: **server recalculation + database rows beat any client guess.**

*Last aligned with the codebase: unified docs, profile completion without resume weight, in-place resume edit, deterministic ATS, NVIDIA/Groq agent split, Python 3.11–3.13 setup.*
