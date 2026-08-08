# Architecture

**Canonical:** [DOCUMENTATION.md](./DOCUMENTATION.md) — sections *Project architecture*, *How the project works*, *How each feature works*, and *Mermaid diagrams*.

## Snapshot

```text
Browser (React + Vite)
  │  Bearer JWT  (+ session cookie for file GETs)
  ├─ /api/backend/*  → proxy → FastAPI /api/v1/*
  └─ /api/files/*    → proxy → FastAPI /api/v1/files/*
         │
    FastAPI (ownership, JWT, ApiError)
         ├─ features/*   domain logic
         ├─ agents/*     Groq / NVIDIA / prompts / crews
         ├─ Firestore    structured data (Admin SDK)
         └─ Supabase     private object storage
```

### Layers

| Layer | Location | Responsibility |
|-------|----------|----------------|
| UI | `frontend/src` | Routes, auth client, feature screens |
| BFF proxy | `frontend/vite.config.mjs` | Dev/preview rewrite only |
| HTTP | `backend/app/api` | Routes, schemas, auth router |
| Domain | `backend/app/features` | Parsing, ATS, interview, learning, jobs, … |
| Agents | `backend/app/agents` | LLM clients, routing, registry |
| Data | `backend/app/database` | Firestore adapter, storage, ownership |

### Trust rules

1. Browser never holds service keys or talks to Firestore.  
2. Every row and file path is scoped to the signed-in user.  
3. Product ATS score is deterministic; LLMs enrich, they do not invent experience.  
4. Confirm gate: only `confirmed` resume/JD drive ATS, learning, prep, job match.

See diagrams and full narrative in the canonical doc.
