# Career Copilot — Technical Documentation

This folder is the **source of truth** for how the system is built: architecture, file map, data model, feature flows, API surface, frontend structure, and operations.

The root [README.md](../README.md) stays a product/quick-start overview. Everything deeper lives here.

## Who this is for

| Reader | Start here |
|--------|------------|
| New engineer onboarding | [01 — Architecture](./architecture.md) → [02 — Code map](./code-map.md) → [03 — Request flows](./flows.md) |
| Backend feature work | [Features](./features/) + [Data model](./data-model.md) |
| Frontend feature work | [Frontend](./frontend.md) + feature UI files listed in [Code map](./code-map.md) |
| API consumer / debugger | [API reference](./api-reference.md) |
| Running / diagnosing local setup | [Operations](./operations.md) |

## Document index

| Doc | What it covers |
|-----|----------------|
| [architecture.md](./architecture.md) | Goals, layers, trust boundaries, high-level diagrams, key decisions |
| [diagrams.md](./diagrams.md) | **Unified Mermaid diagrams** — system, journey, sequences, trust |
| [code-map.md](./code-map.md) | Every important path: what it owns and why it exists |
| [data-model.md](./data-model.md) | Firestore collections, storage buckets, ownership, statuses |
| [flows.md](./flows.md) | End-to-end request/data flows with **file citations** |
| [api-reference.md](./api-reference.md) | Endpoint map, auth, errors, agents |
| [frontend.md](./frontend.md) | Routes, BFF, auth client, feature modules |
| [operations.md](./operations.md) | Setup, scripts, env, testing, troubleshooting |
| [features/auth.md](./features/auth.md) | Sign-up, JWT, Google exchange, account deletion |
| [features/document-parsing.md](./features/document-parsing.md) | PDF/DOCX extract, section segregation, confirm gate |
| [features/ats-scoring.md](./features/ats-scoring.md) | Product keyword ATS + optional composite library |
| [features/profile.md](./features/profile.md) | Profile CRUD, completion checklist, fill-from-resume |
| [features/interview.md](./features/interview.md) | Preparation + mock sessions (no AI grading) |
| [features/learning.md](./features/learning.md) | ATS gaps → YouTube crew |
| [features/jobs.md](./features/jobs.md) | Catalog, recommendations, Adzuna sync |
| [features/resume-improvement.md](./features/resume-improvement.md) | Crew-based suggestions + exports |

## Golden rule (system-wide)

> Do not invent the candidate’s career.  
> Only use what the user types, uploads, **confirms**, or explicitly accepts.  
> Server secrets never ship to the browser. Firestore client rules deny direct access.

When in doubt, prefer:

1. Confirmed `resume_versions` / `job_descriptions` text  
2. Exact quote evidence (ATS, learning gaps, job match)  
3. Deterministic fallbacks when LLMs are off  

## How to keep docs current

When you change behavior:

1. Update the **feature** doc for that domain.  
2. Update [flows.md](./flows.md) if the call chain changes.  
3. Update [api-reference.md](./api-reference.md) if routes change.  
4. Bump algorithm version strings in code **and** docs when scoring formulas change.
