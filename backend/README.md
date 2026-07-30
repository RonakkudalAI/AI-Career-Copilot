# Career Copilot API

The FastAPI service validates the Supabase access token on every protected request and performs database and storage operations using that user's JWT. A server secret is optional and is reserved for explicit administrative operations.

All runtime configuration comes from the repository root `.env`, resolved by absolute path from `app/config.py`. From the repository root, run `npm install` once and then `npm run dev:backend`.

Interactive API documentation is available at `http://127.0.0.1:8000/docs` outside production.
