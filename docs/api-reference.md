# API reference

**Canonical:** [DOCUMENTATION.md](./DOCUMENTATION.md) — section *API surface*.  
**Live OpenAPI (dev only):** `http://127.0.0.1:8000/docs` when `APP_ENV` is not `production`.

## Bases

| Context | Base |
|---------|------|
| FastAPI | `/api/v1` (`API_V1_PREFIX`) |
| Browser local (Vite) | `/api/backend` → `/api/v1` |
| Files local (Vite) | `/api/files` → `/api/v1/files` |

## Auth

- `Authorization: Bearer <app JWT>` (preferred for JSON APIs)  
- Cookie `career_copilot_session` (file/media GETs)  
- HS256, `AUTH_SECRET`, claims `sub` / `email` / `iat` / `exp`

## Endpoint summary

| Area | Prefix under `/api/v1` |
|------|------------------------|
| Auth | `/auth/*` (sign-up, sign-in, session, supabase, firebase, sign-out, update-password) |
| Health | `/health/live`, `/health`, `/health/ready`, `/health/database`, `/agents/status` |
| Me | `/me/bootstrap`, `/me/activity` |
| Profile | `/profile`, avatar, preferences, child resources, from-resume |
| Resumes / JDs | `/resumes*`, `/resume-versions*`, `/job-descriptions*` |
| ATS | `/ats-analyses*`, `/ats/score` |
| Improvement | `/resume-improvements*`, `/resume-suggestions*`, `/resume-exports*`, `/resume-comparisons` |
| Interview | `/interview-preparation`, `/interviews*`, `/interviews/tts*` |
| Learning | `/learning-paths*` |
| Jobs | `/jobs*`, `/job-recommendations*`, `/saved-jobs*` |
| Settings / account | `/settings*`, `DELETE /account` |
| Files | `GET /files/{bucket}/{path}` |

## Error envelope

```json
{
  "error": {
    "code": "string_code",
    "message": "Human-readable message",
    "details": null,
    "request_id": "uuid"
  }
}
```

Responses include `X-Request-ID`.

Implementation sources: `backend/app/api/router.py`, `backend/app/api/routers/auth.py`, `backend/app/features/ats/routes.py`, `backend/app/features/resume_improvement/routes.py`.
