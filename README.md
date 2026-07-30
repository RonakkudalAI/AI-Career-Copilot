# Career Copilot

Career Copilot is a Next.js application backed by Supabase Auth, PostgreSQL, private Storage buckets, and a Python FastAPI service. Browser storage and seeded candidate records are not used as application state.

## Single configuration file

All frontend, backend, Supabase, Storage, and NVIDIA runtime configuration is stored in the untracked root `.env`. No other project-owned `.env*` file is used.

Required public frontend variables are `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_API_BASE_URL`.

Backend application variables are `APP_NAME`, `APP_ENV`, `API_V1_PREFIX`, `LOG_LEVEL`, and `FRONTEND_ORIGINS`. Server-only Supabase variables are `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and `SUPABASE_DB_URL`.

Storage and file-limit variables are `DOCUMENT_BUCKET`, `AVATAR_BUCKET`, `INTERVIEW_BUCKET`, `DOCUMENT_MAX_BYTES`, `AVATAR_MAX_BYTES`, and `INTERVIEW_MEDIA_MAX_BYTES`.

Server-only NVIDIA variables are `NVIDIA_API_KEY`, `NVIDIA_BASE_URL`, `NVIDIA_MODEL`, `NVIDIA_TIMEOUT_SECONDS`, `NVIDIA_MAX_RETRIES`, `NVIDIA_MAX_OUTPUT_TOKENS`, `NVIDIA_TEMPERATURE`, and `NVIDIA_PROMPT_VERSION`. Resume safety limits use `IMPROVEMENT_MAX_SECTIONS`, `IMPROVEMENT_MAX_SOURCE_CHARS`, `IMPROVEMENT_MAX_JD_CHARS`, and `EXPORT_SIGNED_URL_SECONDS`.

Only `NEXT_PUBLIC_*` values are browser-visible. The NVIDIA key, Supabase secret key, and database URL are server-only. Never commit `.env` or copy a server-only value into a `NEXT_PUBLIC_*` variable.

Validate names, scopes, URLs, and project consistency without printing values:

```powershell
npm run check:env
```

## First run

Install JavaScript and Python dependencies with one command. The post-install step creates the repository-local backend virtual environment and installs FastAPI dependencies:

```powershell
npm install
```

Start the frontend and backend together:

```powershell
npm run dev
```

Open `http://localhost:3000`. The API runs at `http://127.0.0.1:8000`, with development docs at `/docs`.

## Other commands

Start either service independently:

```powershell
npm run dev:backend
npm run dev:frontend
```

Run validation:

```powershell
npm run check:secrets
npm run check:env
npm run lint
npm run typecheck
npm run test -- --run
npm run build
backend/.venv/Scripts/python.exe -m pytest backend/tests -q
npm run test:e2e
```

Supabase migrations, ownership policies, trigger bootstrap, indexes, and private bucket policies live under `supabase/`. A local Supabase stack additionally requires Docker and the Supabase CLI.

## Resume improvement

The resume builder supports candidate-confirmed manual edits, immutable versions, version comparison, and private PDF/DOCX exports. NVIDIA suggestions travel only through the authenticated FastAPI boundary. Configuration comes exclusively from the root `.env`.

Apply `supabase/migrations/20260730020000_resume_improvements.sql` before using suggestion decisions or exports. The migration reuses the existing resume, version, suggestion, export, activity, and private document-storage models.

The normal provider tests use mocked network responses:

```powershell
backend/.venv/Scripts/python.exe -m pytest backend
```

After the migration is applied, the opt-in live Supabase workflow check is:

```powershell
backend/.venv/Scripts/python.exe backend/tests/live_resume_improvement_check.py
```

A live NVIDIA smoke test is intentionally not part of the normal suite. Run it only with valid server-side provider configuration:

```powershell
$env:RUN_NVIDIA_LIVE_TESTS = "1"
backend/.venv/Scripts/python.exe backend/tests/live_nvidia_smoke.py
backend/.venv/Scripts/python.exe backend/tests/live_nvidia_resume_check.py
```
