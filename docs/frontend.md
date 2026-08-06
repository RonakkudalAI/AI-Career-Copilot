# Frontend

Stack: **Vite + React 19 + TypeScript + React Router 7 + Tailwind CSS 4**.  
Root: `frontend/`.

---

## Entry and shell

```text
frontend/src/main.tsx
  → ThemeProvider
  → BrowserRouter
  → App.tsx
```

| File | Role |
|------|------|
| `App.tsx` | Route table + `ProtectedRoute` |
| `features/workspace/components/workspace-shell.tsx` | Nav, bootstrap for profile chrome |
| `shared/routes.ts` | Path constants |
| `shared/api/client.ts` | Authenticated `apiRequest` |
| `shared/config.ts` | API base, token/cookie keys, demo cookie |
| `features/auth/api/client.ts` | Sign-in/up, token save (clears demo cookie) |
| `features/auth/demo-session.ts` | Dev-only in-memory API |

---

## Routes

| Path | Module |
|------|--------|
| `/` | Marketing landing |
| `/sign-in`, `/sign-up`, … | Auth screens |
| `/onboarding` | Onboarding |
| `/dashboard` | Bootstrap metrics + activity |
| `/resume-analysis` | Tabs: ATS history, resume library, new upload |
| `/resume-analysis/report/:id` | ATS report + evidence |
| `/mock-interview/*` | Setup, session (voice practice), preparation |
| `/learning/*` | Paths |
| `/jobs/*` | Catalog, saved, detail |
| `/settings/*` | Profile, account, preferences, privacy |

Protected routes require JWT (or demo session in non-production).

---

## API client

### Base URL

```text
resolveApiBase():
  if VITE_API_BASE_URL → origin + /api/v1
  else → "/api/backend"
```

### Proxy (`vite.config.mjs`)

| Browser | Upstream |
|---------|----------|
| `/api/backend/*` | `{PUBLIC_API_BASE_URL}/api/v1/*` |
| `/api/files/*` | `{PUBLIC_API_BASE_URL}/api/v1/files/*` |

Env loaded from **repo root**.

### Auth headers

- `Authorization: Bearer <access_token>`  
- `credentials: "include"`  
- Demo: `isDemoSession()` short-circuits to `demoApiRequest`  

---

## Feature notes

| Feature | Notes |
|---------|-------|
| Dashboard | Always loads `GET /me/bootstrap`; shows loading/error states |
| Resume hub | Lists resumes + enriched ATS history (`resume` / `job_description` labels) |
| Interview session | Optional TTS + speech recognition; pure helpers in `interview-voice.ts` |
| Demo | Cookie `career_copilot_demo=1` only honored when `import.meta.env.PROD` is false |

---

## Testing

```bash
cd frontend
npm run test
npm run typecheck
npm run e2e:landing   # Playwright
```

---

## Related

- [Operations](./operations.md)  
- [API reference](./api-reference.md)  
