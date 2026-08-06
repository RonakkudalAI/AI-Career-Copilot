# Frontend

Stack: **Vite 8 + React 19 + TypeScript + React Router 7 + Tailwind CSS 4**.  
Root of UI: `frontend/`.

---

## Entry and shell

```text
frontend/src/main.tsx
  → ThemeProvider
  → BrowserRouter
  → App.tsx
```

`App.tsx` responsibilities:

1. Public marketing route `/`  
2. Auth routes (lazy)  
3. `ProtectedRoute` gate for workspace  
4. Nested routes under `WorkspaceShell`  
5. Lazy-loaded feature pages for code splitting  

| File | Role |
|------|------|
| `frontend/src/main.tsx` | Bootstrap |
| `frontend/src/App.tsx` | Route table + auth gate |
| `frontend/src/features/workspace/components/workspace-shell.tsx` | Nav/layout chrome |
| `frontend/src/shared/routes.ts` | Canonical path constants |

---

## Route map

Defined in `App.tsx` (paths also in `shared/routes.ts`):

| Path | Feature module |
|------|----------------|
| `/` | `features/marketing/components/landing.tsx` |
| `/sign-in`, `/sign-up`, … | `features/auth/components/auth-screen.tsx` |
| `/onboarding` | `features/onboarding/components/onboarding.tsx` |
| `/dashboard` | `features/dashboard/components/dashboard.tsx` |
| `/resume-analysis/*` | `features/resume/components/resume-flow.tsx` |
| `/mock-interview/*` | `features/interview/components/*` |
| `/learning/*` | `features/learning/components/learning.tsx` |
| `/jobs/*` | `features/jobs/components/jobs.tsx` (+ globe) |
| `/settings/*` | `features/settings/components/settings.tsx` |

Protected paths require a token (or demo session). Missing token → `/sign-in?next=…` via `features/auth/safe-path.ts`.

---

## API client

| File | Role |
|------|------|
| `shared/api/client.ts` | `apiRequest<T>` — authenticated fetch |
| `shared/config.ts` | Base URL, token/cookie keys, demo cookie |
| `features/auth/api/client.ts` | Auth-specific POSTs + token save |
| `features/auth/demo-session.ts` | Offline mock API |

### Base URL resolution

```text
resolveApiBase():
  if VITE_API_BASE_URL set → absolute origin + /api/v1
  else → "/api/backend"  (same-origin proxy)
```

### Proxy (dev + preview)

`frontend/vite.config.mjs`:

| Browser path | Upstream |
|--------------|----------|
| `/api/backend/*` | `{PUBLIC_API_BASE_URL}/api/v1/*` |
| `/api/files/*` | `{PUBLIC_API_BASE_URL}/api/v1/files/*` |

Env is loaded from **repo root** (`envDir` parent of `frontend/`).

### GET dedupe

In-flight GET keys: `METHOD:path:token` stored in a `Map` inside `apiRequest` to avoid double-fetch storms.

### 401 handling

Clears localStorage token + session cookie, throws user-facing re-auth error.

---

## Auth UX flow

```text
auth-screen.tsx
  → createClient() from features/auth/api/client.ts
  → signInWithPassword / signUp / Google
  → saveToken(localStorage + cookie)
  → navigate dashboard/onboarding
```

Google uses `features/auth/firebase.ts` (Firebase Web SDK + `VITE_FIREBASE_*`), then exchanges ID token via `POST /auth/firebase`.

---

## Feature modules (UI responsibilities)

| Module | What the UI does | Backend it drives |
|--------|------------------|-------------------|
| `resume` | Upload, review sections, confirm, run ATS, view evidence | `/resumes`, `/job-descriptions`, `/ats-analyses` |
| `dashboard` | Bootstrap counts, latest score, activity | `/me/bootstrap`, `/me/activity` |
| `profile` helpers | Completion toast/model | Profile completion fields |
| `settings` | Profile CRUD, password, delete account | `/profile`, `/settings`, `/account` |
| `interview` | Setup, session, prep, report | `/interviews`, `/interview-preparation` |
| `learning` | Paths, items, progress | `/learning-paths` |
| `jobs` | Browse, save, recommendations, globe viz | `/jobs`, `/job-recommendations`, `/saved-jobs` |
| `marketing` | Landing sections (motion/3D demos) | None (static) |
| `onboarding` | First-run profile | `/profile`, preferences |

Shared UI primitives: `frontend/src/components/ui/*` and `shared/ui/*`.

---

## Demo mode

| Constant | Value |
|----------|-------|
| Cookie name | `career_copilot_demo` |
| Cookie value | `1` |

When present, `apiRequest` never hits the network; `demo-session.ts` answers with fixtures. Useful for UI work without Firebase/LLM keys.

---

## Theming

| File | Role |
|------|------|
| `globals.css` | CSS variables / Tailwind entry |
| `shared/theme.tsx` | Theme provider |
| `shared/theme-utils.ts` | Helpers |

---

## Testing (frontend)

| Tool | Config / location |
|------|-------------------|
| Vitest | `frontend/vitest.config.mts`, `**/__tests__` |
| Playwright | `frontend/playwright.config.ts`, `frontend/e2e/` |
| Landing validation | `frontend/scripts/validate-landing.mjs` |

From repo root: `npm run check:frontend` (lint + typecheck + test + build via `scripts/run-frontend.mjs`).

---

## Related docs

- [Flows](./flows.md)  
- [API reference](./api-reference.md)  
- [Architecture](./architecture.md)  
