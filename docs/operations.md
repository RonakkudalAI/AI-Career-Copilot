# Operations

Local setup, scripts, environment, testing, and troubleshooting.

---

## Prerequisites

| Tool | Version / notes |
|------|-----------------|
| Node.js | 20+ |
| Python | **3.11–3.13** (pin `.python-version` = 3.12) |
| Firebase project | **Firestore** + service-account JSON |
| Supabase project | Private **Storage** bucket + service role key |

Optional: Groq, NVIDIA, YouTube Data API, Adzuna for full AI/jobs features.

---

## First-time setup

```bash
cd career-copilot
cp .env.example .env
# Required: AUTH_SECRET, FIREBASE_*, SUPABASE_*, VITE_FIREBASE_* for Google
npm run setup
```

`npm run setup` (`scripts/setup/project.mjs`):

1. Install root/frontend deps  
2. Create `backend/.venv` and install the API package  
3. Run Firestore connectivity checks  

Optional packages:

```bash
backend\.venv\Scripts\python.exe -m pip install -e "backend/.[crewai]"
backend\.venv\Scripts\python.exe -m pip install -e "backend/.[pdf-extras]"
```

---

## Run

```bash
npm run dev
```

| Process | URL |
|---------|-----|
| Frontend | http://127.0.0.1:3000 |
| Backend | http://127.0.0.1:8000 |
| OpenAPI | http://127.0.0.1:8000/docs (non-production) |

Halves: `npm run dev:frontend` / `npm run dev:backend`.

`npm run dev` runs preflight (Firestore probe) then starts both processes.

### Health checks

```bash
curl -s http://127.0.0.1:8000/api/v1/health
curl -s http://127.0.0.1:3000/api/backend/health   # via Vite proxy
```

Expect `database_status` / `storage_status` of `reachable` when configured.

---

## Script catalog

| npm script | Purpose |
|------------|---------|
| `setup` | Full install |
| `dev` | Local stack |
| `check:env` | Required env presence (no values dumped) |
| `check:secrets` | Credential pattern scan |
| `check:boundaries` | Import boundaries |
| `check:frontend` | lint + types + test + build |
| `test:backend` | pytest |

Python / Node diagnostics:

| Script | Purpose |
|--------|---------|
| `scripts/diagnostics/verify-environment.mjs` | Env key presence |
| `scripts/diagnostics/check-firestore.py` | Firestore write/read probe |
| `scripts/diagnostics/_audit_once.py` | Offline stack audit (DB, storage, auth, agents, OpenAPI) |
| `scripts/diagnostics/e2e-smoke.py` | API workflow smoke (running server) |
| `scripts/diagnostics/audit-local-api.py` | Local API audit |
| `scripts/diagnostics/check-secrets.mjs` | Secret leak scan |

---

## Environment model

Single root `.env` (template: `.env.example`).

| Group | Consumed by |
|-------|-------------|
| `VITE_*` | Vite frontend only |
| Firebase Admin + `AUTH_SECRET` | FastAPI auth + Firestore |
| `SUPABASE_*` | FastAPI object storage |
| `LLM_PROVIDER`, `GROQ_*`, `NVIDIA_*` | Agents |
| `YOUTUBE_*`, `ADZUNA_*` | Optional features |
| `OMNIROUTE_*` | Optional sidecar (default off) |

**Do not set `VITE_API_BASE_URL` for normal local dev** unless you intentionally bypass the Vite proxy.

---

## Frontend ↔ backend connection

```text
Browser apiRequest → /api/backend + path
Vite rewrite       → PUBLIC_API_BASE_URL + /api/v1 + path
```

| Browser path | Upstream |
|--------------|----------|
| `/api/backend/*` | `{PUBLIC_API_BASE_URL}/api/v1/*` |
| `/api/files/*` | `{PUBLIC_API_BASE_URL}/api/v1/files/*` |

Auth: `Authorization: Bearer` from `career_copilot_access_token` (+ optional session cookie).

Demo mode (`career_copilot_demo=1`, **development only**): `apiRequest` uses in-memory mocks. Real sign-in clears the demo cookie.

---

## Testing

```bash
npm run test:backend
cd frontend && npm run test
cd frontend && npm run typecheck
```

Key backend suites: ATS scoring/enrichment, document parsing, interview fallbacks, Firestore recency sort, auth helpers.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Dashboard metrics stay `—` | Backend not running or bootstrap 401 | `npm run dev`; sign out/in; check Network for `/me/bootstrap` |
| Empty resume/ATS lists despite data | Fixed: do not server-`order_by(created_at)` on legacy docs | Deploy/pull latest; restart API |
| “Could not reach the API” | Proxy or port mismatch | Confirm `PUBLIC_API_BASE_URL` and ports; open `/api/backend/health` |
| Storage 503 | Supabase misconfigured | Set `SUPABASE_URL`, service role, bucket; bucket private |
| Google sign-in fails | Firebase Admin / unverified email | Check credentials path; verify email in provider |
| Agents not ready | Missing GROQ/NVIDIA keys | Set keys or rely on deterministic fallbacks |
| Demo data instead of real account | Demo cookie still set | Sign in again (clears cookie) or clear `career_copilot_demo` |
| Health `degraded` | Firestore or storage probe failed | Run `check-firestore.py`; verify Supabase list |

### Firestore timestamp pitfall

Firestore queries that `order_by("created_at")` **omit documents without that field**.  
The app sorts user-scoped lists in process with fallback timestamps (`started_at`, `completed_at`, …). New records always write `created_at`.

---

## Production notes

- Set `APP_ENV=production` (disables OpenAPI docs).  
- Restrict `FRONTEND_ORIGINS`.  
- Prefer short-lived secrets rotation for `AUTH_SECRET` and service roles.  
- Serve the SPA behind a reverse proxy that forwards `/api/backend` and `/api/files` **or** set `VITE_API_BASE_URL` at build time to the public API origin.  
- Production builds **ignore** the demo cookie.

---

## Related

- [Architecture](./architecture.md)  
- [Data model](./data-model.md)  
- Root [README](../README.md)  
