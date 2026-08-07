# Career Copilot deployment variables

These files are templates for the two production services:

- `vercel.frontend.env.example` is for the Vercel frontend.
- `render.backend.env.example` is for the Render FastAPI web service.

Do not rename these templates to real secret files inside the repository. Copy the values into the Vercel and Render dashboards, or create local ignored copies outside Git.

## Vercel

Set the project root to `frontend`, use `npm run build`, and use `dist` as the output directory. Import only the variables from `vercel.frontend.env.example`.

`VITE_API_BASE_URL` must be the Render backend origin only. Do not append `/api/v1` because the frontend adds `VITE_API_V1_PREFIX`.

## Render API

Create a Web Service with root directory `backend`:

```text
Build Command: pip install -e .
Start Command: uvicorn app.main:app --host 0.0.0.0 --port $PORT
Health Check Path: /api/v1/health/live
```

Upload the Firebase Admin JSON as a Render secret file at `/etc/secrets/firebase-admin.json`. Never commit that file.

## Secrets

The repository must not contain `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_SECRET`, AI provider keys, or Firebase Admin credentials. Rotate credentials that were previously exposed and enter only the new values in the provider dashboards.
