# Operations

**Canonical:** [DOCUMENTATION.md](./DOCUMENTATION.md) — *Configuration* and *Operations*.

## Prerequisites

- Node.js 20+  
- Python 3.11–3.13  
- Firebase project (Firestore + service account JSON)  
- Supabase project (private Storage bucket)  

## Setup

```bash
cp .env.example .env   # Windows: copy .env.example .env
# Fill AUTH_SECRET, FIREBASE_*, SUPABASE_*, VITE_FIREBASE_*
npm run setup
npm run dev
```

| Service | URL |
|---------|-----|
| App | http://127.0.0.1:3000 |
| API | http://127.0.0.1:8000 |
| OpenAPI (dev) | http://127.0.0.1:8000/docs |

There is **no** Celery worker process. All product work is synchronous request/response inside FastAPI (with timeouts and fallbacks).

## Useful scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Preflight + FE + BE |
| `npm run check:env` | Required env keys |
| `npm run check:secrets` | Secret scan |
| `npm run test:backend` | pytest |
| `cd frontend && npm run test` | Vitest |
| `scripts/diagnostics/*` | API/Firestore/connection audits |

## Health endpoints

| Path | Meaning |
|------|---------|
| `GET /api/v1/health/live` | Process up (no network probes) |
| `GET /api/v1/health` | Agents + bounded DB/storage probes |
| `GET /api/v1/health/database` | Deeper dependency probe |
| `GET /api/v1/agents/status` | Agent inventory |

## Production checklist

1. Strong `AUTH_SECRET`, restricted `FRONTEND_ORIGINS`.  
2. `APP_ENV=production` (docs disabled).  
3. Proxy `/api/backend` (or build with `VITE_API_BASE_URL`) **and** `/api/files` → API `/api/v1/files`.  
4. Firestore rules remain deny-all for clients.  
5. Supabase bucket private; only service role on server.  
6. Firebase project is career-copilot05 and FIREBASE_DATABASE_ID=(default).
7. Email/Password and Google providers are enabled, and the exact Vercel hostname is in Firebase Authorized Domains.
8. Vercel was rebuilt after changing any VITE_* value; those values are embedded at build time.

The full split-host Vercel/Render procedure is in deployment.md.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Bootstrap empty / `—` | API health, JWT, CORS origin |
| File/avatar 404 | `/api/files` rewrite present on page origin |
| Storage 503 | Supabase env trio configured |
| LLM features weak | `GROQ_*` / `NVIDIA_*` / `LLM_PROVIDER` |
| Demo data | Clear `career_copilot_demo` cookie |
