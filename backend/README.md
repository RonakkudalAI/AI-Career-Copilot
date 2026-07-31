# Career Copilot API (`backend/app`)

FastAPI service that validates the Supabase access token on protected routes and performs database/storage operations with the user JWT (or secret key for admin-only paths).

## Layout

```text
app/
├── main.py                 # FastAPI entry
├── config.py               # Root .env → Settings
├── auth.py                 # JWT / CurrentUser
├── routes.py               # Primary HTTP routes
├── resume_improvement_routes.py
├── schemas.py
├── supabase_clients.py     # User + admin Supabase clients
├── repository.py           # Ownership helpers, activity, profile completion
├── agents/                 # Product AI agents + LLM clients + prompts
│   ├── registry.py         # Agent inventory / status
│   ├── llm/                # NvidiaClient, GroqClient
│   ├── crew/               # CrewAI-compatible multi-agent orchestration
│   │   ├── orchestrator.py # Sequential: gaps → NVIDIA improve → validate
│   │   ├── tools.py        # Truth-bound tools (no free invention)
│   │   └── compat.py       # Detect official crewai package (needs Python <3.14)
│   ├── ats/                # ATS improvement brief
│   ├── interview/          # Interview questions
│   ├── profile_fill/       # Profile extraction
│   └── prompts/            # Versioned prompt text files
├── parsing/                # Document text + section structure
├── ats.py                  # Deterministic keyword coverage score
├── resume_improvements.py  # Improve / manual edit / apply
├── resume_exports.py
└── …                       # Profile, avatars, account deletion, etc.
```

## Runtime

Configuration is loaded from the repository root `.env` (absolute path in `config.py`).

```powershell
# from repo root
npm run dev:backend
# → uvicorn app.main:app --app-dir backend
```

Docs: `http://127.0.0.1:8000/docs` (non-production).

## Database connectivity

- **User path:** `create_user_supabase_client` (publishable key + user `Authorization` JWT)
- **Admin path:** `create_admin_supabase_client` (secret key) for health probe / account purge
- **Schema:** `supabase/migrations/*` — apply in Supabase; do not invent local schema files

Compatibility shims (`nvidia_client.py`, `profile_from_resume.py`, …) re-export agent modules so older imports keep working.
