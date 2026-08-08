# Frontend

**Canonical:** [DOCUMENTATION.md](./DOCUMENTATION.md) — section *Frontend architecture*.

## Stack

Vite 8 · React 19 · TypeScript · React Router 7 · Tailwind CSS 4 · Firebase Web SDK (auth only)

## How the SPA talks to the API

1. `shared/api/client.ts` → `apiRequest(path, init)`.  
2. Loads app JWT from localStorage.  
3. Calls `resolveApiBase()` + path (`/api/backend/...` locally).  
4. Vite proxies `/api/backend` → FastAPI `/api/v1` and `/api/files` → `/api/v1/files`.  
5. On 401: clear token/cookie and fire `career-copilot:auth-expired`.

Demo mode: non-production cookie `career_copilot_demo` routes all calls through in-memory mocks.

## Route map

| Path | Feature module |
|------|----------------|
| `/` | marketing landing |
| `/sign-in`, `/sign-up`, … | auth screens |
| `/auth/callback` | Google redirect completion |
| `/onboarding` | first-run |
| `/dashboard` | bootstrap metrics |
| `/resume-analysis` | resumes + ATS history |
| `/resume-analysis/report/:id` | ATS report |
| `/mock-interview/*` | interview setup/session/report/prep |
| `/learning/*` | learning paths |
| `/jobs/*` | recommendations, saved, detail |
| `/settings/*` | profile/account/preferences/privacy |

## Important modules

| Module | Role |
|--------|------|
| `features/auth/*` | Firebase + app JWT, demo session |
| `features/workspace/*` | shell + bootstrap context |
| `shared/theme.tsx` | light/dark/system |
| `features/jobs/job-recs-cache.ts` | sessionStorage SWR for job feed |
| `features/interview/interview-voice.ts` | STT helpers |
| `features/interview/interview-tts.ts` | Fish Audio + browser TTS |
| `features/interview/interview-gaze.ts` | camera gaze metrics |

## Production hosting note

`frontend/vercel.json` is SPA-only. For split FE/API hosts you must either:

- reverse-proxy `/api/backend` and `/api/files` to the API, or  
- set `VITE_API_BASE_URL` **and** still serve a same-origin `/api/files` proxy so cookie-authenticated media works.
