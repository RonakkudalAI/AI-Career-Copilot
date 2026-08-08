# Deployment

Career Copilot is deployed as a split application: the Vite frontend is served by Vercel and the FastAPI service runs on Render. The deployment folder contains local templates only and is intentionally excluded from Git. Keep the authoritative deployment checklist here.

## Frontend on Vercel

Configure the Vercel project with `frontend` as the root directory, `npm run build` as the build command, and `dist` as the output directory. Set these client-safe variables in both Preview and Production environments:

```text
VITE_API_BASE_URL=<Render backend origin>
VITE_API_V1_PREFIX=/api/v1
VITE_FIREBASE_API_KEY=<Firebase web app API key>
VITE_FIREBASE_AUTH_DOMAIN=career-copilot05.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=career-copilot05
VITE_FIREBASE_STORAGE_BUCKET=career-copilot05.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=<Firebase web app sender id>
VITE_FIREBASE_APP_ID=<Firebase web app id>
```

`VITE_API_BASE_URL` must be the backend origin only; do not append `/api/v1`. The frontend adds the API prefix. After changing any `VITE_*` value, create a new Vercel deployment because Vite embeds these values at build time.

Firebase Authentication must have Email/Password and Google enabled. Authorized domains must include the exact frontend hostname, `localhost`, and `127.0.0.1` when those local hosts are used. Do not include protocols or ports in Firebase authorized domains.

## Backend on Render

Create a Render Web Service with `backend` as the root directory:

```text
Build Command: pip install -e .
Start Command: uvicorn app.main:app --host 0.0.0.0 --port $PORT
Health Check Path: /api/v1/health/live
```

Required backend configuration includes:

```text
APP_ENV=production
API_V1_PREFIX=/api/v1
PUBLIC_API_BASE_URL=<Render backend origin>
FRONTEND_ORIGINS=<Vercel frontend origin>
FIREBASE_PROJECT_ID=career-copilot05
FIREBASE_DATABASE_ID=(default)
FIREBASE_CREDENTIALS_PATH=/etc/secrets/firebase-admin.json
SUPABASE_URL=<Supabase project URL>
SUPABASE_STORAGE_BUCKET=career-copilot-files
```

Upload the Firebase Admin service-account JSON as a Render secret file at `/etc/secrets/firebase-admin.json`. Add `AUTH_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, and provider keys as Render secret environment variables. Never place those values in frontend variables or Git.

## Verification

Run these checks from the repository before release:

```powershell
npm.cmd run check:env
npm.cmd run firebase:check
npm.cmd run check:frontend
backend\.venv\Scripts\python.exe -m pytest
```

Then verify the deployed service with `GET /api/v1/health/live`, open the frontend, complete email/password sign-in, complete Google sign-in, and test an authenticated API request. A successful local build does not prove that the Vercel and Render dashboards contain the same values.

## Rollback

If a deployment fails, roll back to the previous Vercel and Render deployment pair. Do not change Firebase or Supabase data to recover from a frontend configuration error. Correct the provider environment variables, redeploy, and repeat the verification checks.
