# Career Copilot Architecture

This document describes the current feature-oriented layout. The restructuring preserves public URLs, FastAPI paths, request and response contracts, database behavior, storage configuration, authentication, and provider behavior.

## Repository flow

The repository root owns orchestration scripts, the root `.env`, the SQLite schema, and runtime `.data/`. The Next.js application is isolated under `frontend/`. The FastAPI application is isolated under `backend/`.

```text
backend/app/
├── main.py                 application and router composition
├── api/                    shared API schemas and the existing cross-feature router
├── core/                   configuration and API error infrastructure
├── database/               SQLite client, repository helpers, and activity utilities
├── agents/                 provider exports, registry, prompts, and compatibility surface
└── features/
    ├── auth/               authentication and account deletion
    ├── profile/            candidate profile data, completion, avatars, and resume profile fill
    ├── resume_management/  resume evidence, validation, improvements, version exports
    ├── document_parsing/   PDF/DOCX extraction, section detection, and document validation
    ├── ats/                deterministic scoring, structured scoring, ATS agents, and routes
    ├── resume_improvement/ resume-improvement routes and CrewAI-compatible orchestration
    └── mock_interview/     interview question generation agent

frontend/src/
├── app/                    Next.js routes, layouts, proxies, and route composition
├── features/               auth, dashboard, jobs, learning, interview, resume, profile, settings, and workspace UI
└── shared/                 API client, routes, utilities, and UI primitives
```

## Feature map

| Feature | Frontend | Backend | Persistence/agents |
| --- | --- | --- | --- |
| Authentication | `frontend/src/features/auth` | `backend/app/features/auth` plus `backend/app/api/router.py` | Users and candidate session ownership; JWT service |
| Candidate profile | `frontend/src/features/profile`, `settings`, `onboarding` | `backend/app/features/profile` | Profile and candidate tables; profile-fill agent |
| Resume management | `frontend/src/features/resume` | `backend/app/features/resume_management` | Resume versions, evidence, improvements, exports |
| Document parsing | Resume upload flow | `backend/app/features/document_parsing` | PDF/DOCX text extraction and canonical sections |
| ATS analysis | Resume analysis UI | `backend/app/features/ats` | `ats_analyses`, `ats_evidence`; deterministic and structured scoring |
| Resume improvement | Resume editor UI | `backend/app/features/resume_improvement` and `resume_management` | Improvement runs, suggestions, evidence validation, crew orchestration |
| Mock interview | `frontend/src/features/interview` | Existing interview handlers in `backend/app/api/router.py`; question agent in `backend/app/features/mock_interview` | Interview sessions and responses; Groq question generation |
| Learning path | `frontend/src/features/learning` | Existing learning handlers in `backend/app/api/router.py` | Learning-path records |
| Jobs | `frontend/src/features/jobs` | Existing job handlers in `backend/app/api/router.py` | Jobs and saved jobs |
| Settings | `frontend/src/features/settings` | Existing settings handlers in `backend/app/api/router.py` | Preferences and privacy settings |

## Request flow

Browser requests use `frontend/src/shared/api/client.ts`. Browser API calls use the Next.js backend proxy, while server-side requests use the configured backend origin. FastAPI registers the existing general router under `/api/v1` and the dedicated ATS scoring router under the same prefix. Moving feature modules does not change those paths.

## Database and storage

`backend/app/database/client.py` is the canonical local database client. `backend/app/database/repository.py` contains shared ownership and activity helpers. The configured database and local storage paths remain controlled by the existing root environment variables and `backend/app/core/config.py`; restructuring does not relocate runtime data.

## Agent flow

Provider clients are centralized under `backend/app/agents/providers`. Feature orchestration is owned by the relevant feature: ATS under `features/ats/agent`, profile extraction under `features/profile/agent`, interview generation under `features/mock_interview/agent`, and resume improvement crew orchestration under `features/resume_improvement/agents/crew`. Deterministic ATS scoring remains outside provider clients.

## Adding a feature

Add the smallest feature package needed under `backend/app/features` and keep feature-specific persistence and validation there. Add frontend implementation under `frontend/src/features` and keep `frontend/src/app` limited to route composition. Register routes centrally without changing existing public paths. Add focused tests before moving to the next feature.

## Current limitation

The existing large cross-feature handler module remains at `backend/app/api/router.py` as the compatibility-preserving API composition boundary. It is intentionally not split in this restructuring because extracting its interdependent handlers would be a behavioral refactor rather than a safe folder move. Future route extraction should be performed feature by feature with route-manifest comparison and focused tests.
