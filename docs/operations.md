# Operations

Local setup, scripts, environment, testing, and troubleshooting.

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20+ recommended |
| Python | **3.11–3.13** (repo pin `.python-version` = 3.12) |
| Firebase project | Firestore + Storage |
| Service account JSON | Admin SDK path in `FIREBASE_CREDENTIALS_PATH` |

Optional: Groq, NVIDIA, YouTube Data API, Adzuna keys for full AI/jobs features.

---

## First-time setup

```bash
# 1. Clone
cd career-copilot

# 2. Environment
cp .env.example .env
# edit AUTH_SECRET, FIREBASE_*, optional LLM/YouTube keys

# 3. Install frontend + backend venv + Firebase check
npm run setup
```

What `npm run setup` does (`scripts/setup/project.mjs`):

1. Install root/frontend deps  
2. Create `backend/.venv` and install `career-copilot-api`  
3. Run Firebase connectivity checks  

PDF parsing uses **pypdf** (core). Optional faster backends:

```bash
# Official CrewAI (Python < 3.14)
backend\.venv\Scripts\python.exe -m pip install -e "backend/.[crewai]"

# Optional faster PDF backends (PyMuPDF, pdfplumber) before pypdf
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

`npm run dev` runs `scripts/dev/preflight.mjs` first, then `scripts/dev/run.mjs`.

---

## Script catalog

| npm script | Implementation | Purpose |
|------------|----------------|---------|
| `setup` | `scripts/setup/project.mjs` | Full install |
| `dev` | preflight + run | Local stack |
| `dev:frontend` / `dev:backend` | `scripts/dev/*` | Single process |
| `firebase:check` | preflight | Firestore check |
| `check:env` | `diagnostics/verify-environment.mjs` | Required vars |
| `check:secrets` | `diagnostics/check-secrets.mjs` | Leak scan |
| `check:boundaries` | `verify-boundaries.mjs` | Import boundaries |
| `lint` / `typecheck` / `build:frontend` | via `run-frontend.mjs` | Frontend quality |
| `check:frontend` | full frontend gate | lint+types+test+build |
| `test:backend` | pytest via venv | Backend tests |

Python diagnostics:

| Script | Purpose |
|--------|---------|
| `scripts/diagnostics/e2e-smoke.py` | API workflow smoke |
| `scripts/diagnostics/check-firestore.py` | DB probe |
| `scripts/diagnostics/audit-local-api.py` | Local API audit |

---

## Environment model

Single root `.env` (template: `.env.example`).

| Prefix / key group | Consumed by |
|--------------------|-------------|
| `VITE_*` | Vite browser bundle only |
| `AUTH_SECRET`, `FIREBASE_*`, LLM, YouTube, Adzuna | FastAPI `core/config.py` |
| `PUBLIC_API_BASE_URL`, ports | Dev proxy + scripts |
| `FRONTEND_ORIGINS` | CORS allow-list |

Settings load path: `backend/app/core/config.py` → repo root `.env`.

> [!IMPORTANT]
> Never put `GROQ_API_KEY`, `NVIDIA_API_KEY`, `YOUTUBE_API_KEY`, or service-account JSON contents into `VITE_*` variables.

---

## Testing

### Backend

```bash
npm run test:backend
# or
backend\.venv\Scripts\python.exe -m pytest backend\tests
```

Key suites:

| Path | Focus |
|------|-------|
| `backend/tests/ats_scoring/` | Product score math / schemas |
| `backend/tests/document_parsing/` | Sections, validation, performance |
| `backend/tests/interview/` | Preparation |
| `backend/tests/learning/` | YouTube crew |
| `backend/tests/fixtures/resumes/` | Real resume samples |

### Frontend

```bash
cd frontend
npm run test          # vitest
npm run e2e:landing   # playwright
```

---

## Health checks while running

| Check | How |
|-------|-----|
| API up | `GET http://127.0.0.1:8000/api/v1/health` |
| DB | `GET …/health/database` |
| Agents | `GET …/agents/status` |
| Env | `npm run check:env` |
| Secrets in tree | `npm run check:secrets` |

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Backend fails on boot | Missing `AUTH_SECRET` or invalid Settings | Complete `.env`; read pydantic error |
| Firestore errors | Bad credentials path / project id | `FIREBASE_CREDENTIALS_PATH`, `npm run firebase:check` |
| PDF parse failed / no text | Bad PDF, encrypted, or image-only | Use a text-based PDF; encrypted files are rejected |
| CORS errors | Origin not allow-listed | Add exact origin to `FRONTEND_ORIGINS` |
| UI “Could not reach the API” | Backend down or proxy misconfig | `npm run dev`; check `PUBLIC_API_BASE_URL` |
| Weak AI features | Keys empty | Set Groq/NVIDIA; confirm `/agents/status` |
| Learning has only search links | No YouTube key | Set `YOUTUBE_API_KEY` |
| ATS 409 confirm errors | Resume/JD not confirmed | Complete review → confirm endpoints |
| Auth always expired | Clock skew / bad secret / deleted user | Re-sign-in; verify `AUTH_SECRET` stable |

---

## Security ops notes

1. Firestore rules deny all client access — do not open them for the product path.  
2. Service account JSON belongs under `secrets/` and must stay gitignored.  
3. Account wipe requires exact phrase `DELETE MY ACCOUNT` (`features/auth/account_deletion.py`).  
4. File download enforces `{user_id}/` path prefix.  

---

## Related docs

- [Architecture](./architecture.md)  
- [API reference](./api-reference.md)  
- Root [README.md](../README.md)  
