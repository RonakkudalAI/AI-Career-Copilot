# Career Copilot — Technical Documentation

This folder is the **source of truth** for how the system is built. The root [README.md](../README.md) is the product/quick-start overview; deeper material lives here.

## Stack (current)

| Concern | Choice |
|---------|--------|
| UI | Vite + React 19 + TypeScript + Tailwind 4 |
| API | FastAPI + Pydantic v2 |
| Database | Firebase Cloud Firestore (Admin SDK) |
| Object storage | **Supabase Storage** (private bucket; JWT file proxy) |
| LLM order | `LLM_PROVIDER` (`groq` default) then the other configured provider |
| Crews | Official `crewai` when installed; else compatible sequential orchestrator |

## Who this is for

| Reader | Start here |
|--------|------------|
| New engineer | [Architecture](./architecture.md) → [Code map](./code-map.md) → [Flows](./flows.md) |
| Backend feature work | [Features](./features/) + [Data model](./data-model.md) |
| Frontend feature work | [Frontend](./frontend.md) + [Code map](./code-map.md) |
| API consumer / debugger | [API reference](./api-reference.md) |
| Local setup / incidents | [Operations](./operations.md) |

## Document index

| Doc | What it covers |
|-----|----------------|
| [architecture.md](./architecture.md) | Goals, layers, trust boundaries, decisions |
| [diagrams.md](./diagrams.md) | Mermaid system / journey / sequence diagrams |
| [code-map.md](./code-map.md) | Important paths and ownership |
| [data-model.md](./data-model.md) | Firestore collections, Supabase storage prefixes |
| [flows.md](./flows.md) | End-to-end flows with file citations |
| [api-reference.md](./api-reference.md) | Endpoint map, auth, errors, agents |
| [frontend.md](./frontend.md) | Routes, BFF, auth client, feature modules |
| [operations.md](./operations.md) | Setup, scripts, env, testing, troubleshooting |
| [features/](./features/) | Auth, parsing, ATS, profile, interview, learning, jobs, improvement |

## Golden rule

> Do not invent the candidate’s career.  
> Only use what the user types, uploads, **confirms**, or explicitly accepts.  
> Server secrets never ship to the browser. Firestore client rules deny direct access.

Prefer:

1. Confirmed `resume_versions` / `job_descriptions` text  
2. Exact quote evidence (ATS, learning gaps, job match)  
3. Deterministic fallbacks when LLMs are off  

## How to keep docs current

When you change behavior:

1. Update the **feature** doc for that domain.  
2. Update [flows.md](./flows.md) if the call chain changes.  
3. Update [api-reference.md](./api-reference.md) if routes change.  
4. Update the root [README](../README.md) if setup or stack changes.  
5. Bump algorithm version strings in code **and** docs when scoring formulas change.

## What was removed / no longer accurate

| Old claim | Current reality |
|-----------|-----------------|
| Firebase Storage is product file store | **Supabase Storage** is the product object store |
| NVIDIA always primary for agents | **`LLM_PROVIDER`** (default `groq`) then fallback |
| Product ATS is LLM composite | Deterministic keyword coverage only |
| Interview has AI scoring | Practice only; optional browser voice, no grading |
| Supabase is “legacy optional” | Supabase Storage is **required** for product files when not in `APP_ENV=test` |
