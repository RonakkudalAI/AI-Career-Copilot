# System diagrams (Mermaid)

Unified view of Career Copilot: request path, domain features, data stores, and external services.

> Rendered on GitHub, VS Code (Mermaid preview), and most Markdown viewers that support Mermaid.

---

## 1. Unified system diagram

End-to-end architecture: browser → BFF → FastAPI → features → data & external APIs.

```mermaid
flowchart TB
  %% ── Client ──────────────────────────────────────────────
  subgraph CLIENT["Browser (untrusted)"]
    direction TB
    UI["React app<br/>frontend/src/App.tsx · features/*"]
    TOK["JWT storage<br/>localStorage + career_copilot_session"]
    DEMO{"Demo cookie<br/>career_copilot_demo=1?"}
    MOCK["demo-session.ts<br/>in-memory mocks"]
  end

  %% ── Edge ────────────────────────────────────────────────
  subgraph EDGE["Vite BFF proxy · vite.config.mjs"]
    direction LR
    P1["/api/backend/* → /api/v1/*"]
    P2["/api/files/* → /api/v1/files/*"]
  end

  %% ── API ─────────────────────────────────────────────────
  subgraph API["FastAPI · backend/app/main.py"]
    direction TB
    MW["Middleware<br/>CORS · X-Request-ID · ApiError"]
    AUTH["get_current_user<br/>features/auth/service.py"]
    RTR["Routers<br/>api/router.py · ats/routes · resume_improvement/routes"]
  end

  %% ── Domain ──────────────────────────────────────────────
  subgraph DOMAIN["Feature modules · backend/app/features"]
    direction TB
    F_AUTH["auth<br/>JWT · scrypt · account wipe"]
    F_PARSE["document_parsing<br/>pypdf + sections"]
    F_ATS["ats<br/>keyword coverage v3"]
    F_PROF["profile<br/>completion · fill"]
    F_INT["interview<br/>questions · prep"]
    F_LEARN["learning<br/>YouTube crew"]
    F_JOBS["career_matching · adzuna"]
    F_IMP["resume_improvement<br/>crew + exports"]
  end

  %% ── Agents ──────────────────────────────────────────────
  subgraph AGENTS["Agents · backend/app/agents"]
    REG["registry.py · /agents/status"]
    GROQ["Groq client"]
    NV["NVIDIA client"]
    PROMPTS["prompts/*.txt"]
  end

  %% ── Data ────────────────────────────────────────────────
  subgraph DATA["System of record · Admin SDK only"]
    direction TB
    FS[("Firestore<br/>database/client.py<br/>owned by user_id")]
    ST[("Firebase Storage<br/>candidate-documents<br/>candidate-avatars")]
    RULES["firestore.rules<br/>deny all client access"]
  end

  %% ── External ────────────────────────────────────────────
  subgraph EXT["External services · server secrets only"]
    direction LR
    XG["Groq API"]
    XN["NVIDIA Integrate"]
    XY["YouTube Data API v3"]
    XA["Adzuna API"]
  end

  %% ── Edges ───────────────────────────────────────────────
  UI --> TOK
  UI --> DEMO
  DEMO -->|yes| MOCK
  DEMO -->|no| EDGE
  TOK -.->|Bearer JWT| EDGE
  EDGE --> API
  MW --> AUTH --> RTR
  RTR --> DOMAIN
  F_AUTH --> FS
  F_PARSE --> FS
  F_PARSE --> ST
  F_ATS --> FS
  F_PROF --> FS
  F_PROF --> ST
  F_INT --> FS
  F_LEARN --> FS
  F_JOBS --> FS
  F_IMP --> FS
  F_IMP --> ST
  DOMAIN --> AGENTS
  GROQ --> XG
  NV --> XN
  F_LEARN --> XY
  F_JOBS --> XA
  FS --- RULES
  ST --- RULES

  classDef client fill:#e8f1ff,stroke:#0f3b82,color:#0b1f44
  classDef edge fill:#f3f4f6,stroke:#4b5563,color:#111
  classDef api fill:#ecfdf5,stroke:#047857,color:#064e3b
  classDef domain fill:#fff7ed,stroke:#c2410c,color:#7c2d12
  classDef data fill:#faf5ff,stroke:#7c3aed,color:#4c1d95
  classDef ext fill:#fef2f2,stroke:#b91c1c,color:#7f1d1d
  class UI,TOK,DEMO,MOCK client
  class P1,P2 edge
  class MW,AUTH,RTR api
  class F_AUTH,F_PARSE,F_ATS,F_PROF,F_INT,F_LEARN,F_JOBS,F_IMP,REG,GROQ,NV,PROMPTS domain
  class FS,ST,RULES data
  class XG,XN,XY,XA ext
```

### How to read it

| Zone | Meaning |
|------|---------|
| **Browser** | Untrusted UI; JWT in storage; demo short-circuit never hits the API |
| **Vite BFF** | Same-origin proxy so the page avoids CORS; rewrites to `/api/v1` |
| **FastAPI** | Auth dependency + routers; secrets stay here |
| **Features** | Domain algorithms (parse, ATS, learning, …) |
| **Agents** | Optional LLM providers + prompt packs |
| **Data** | Firestore + Storage via Admin SDK; client rules deny all |
| **External** | Groq / NVIDIA / YouTube / Adzuna — keys never in `VITE_*` |

---

## 2. Product journey (confirm → outcomes)

Primary candidate loop: upload → confirm → score → optional downstream features.

```mermaid
flowchart LR
  A[Sign up / sign in] --> B[Profile / onboarding]
  B --> C[Upload resume PDF/DOCX]
  C --> D[Parse text + sections]
  D --> E{User reviews}
  E -->|PATCH extraction| E
  E -->|Confirm| F[resume_versions.confirmed]
  G[Paste / upload JD] --> H[Confirm JD]
  F --> I[POST /ats-analyses]
  H --> I
  I --> J[score_resume<br/>evidence-keyword-coverage-v3]
  J --> K[(ats_analyses + ats_evidence)]
  K --> L[Optional ATS brief LLM]
  K --> M[Learning path<br/>YouTube crew]
  K --> N[Interview prep / mock]
  F --> O[Job recommendations<br/>evidence-keyword-match-v1]
  F --> P[Profile fill preview→apply]
  K --> Q[Re-upload revised resume]
  Q --> D
```

---

## 3. Authenticated request sequence

One protected API call from UI to Firestore.

```mermaid
sequenceDiagram
  autonumber
  actor User
  participant UI as React UI
  participant API as apiRequest<br/>shared/api/client.ts
  participant Proxy as Vite proxy<br/>vite.config.mjs
  participant FA as FastAPI<br/>main.py
  participant Auth as get_current_user<br/>auth/service.py
  participant H as Handler<br/>api/router.py
  participant Feat as features/*
  participant DB as Firestore/Storage<br/>database/client.py

  User->>UI: action
  UI->>API: apiRequest(path, init)
  alt demo cookie set
    API-->>UI: demo-session mock
  else live session
    API->>API: Bearer JWT + credentials include
    API->>Proxy: /api/backend/...
    Proxy->>FA: /api/v1/...
    FA->>Auth: Depends(get_current_user)
    Auth->>DB: load users by sub
    Auth-->>FA: CurrentUser
    FA->>H: route handler
    H->>Feat: domain logic
    Feat->>DB: owned_row / insert / storage
    DB-->>Feat: data
    Feat-->>H: result
    H-->>UI: JSON + X-Request-ID
  end
```

---

## 4. Resume → ATS data path (file-level)

```mermaid
flowchart TB
  UI["resume-flow.tsx"] -->|multipart| R["POST /resumes<br/>api/router.py"]
  R --> V["validate_document<br/>document_parsing/service.py"]
  V --> U["Storage upload<br/>database/client.py"]
  V --> P["parse_document_bytes<br/>pipeline.py"]
  P --> T["extract_text<br/>text_extract.py"]
  T --> T1["fast PDF/DOCX extractors"]
  T --> T2["pypdf / PyMuPDF / pdfplumber"]
  P --> S["extract_sections_enriched<br/>llm_sections.py / sections.py"]
  S --> RV[("resume_versions<br/>review_required")]
  RV -->|confirm| CF[("confirmed")]
  JD[("job_descriptions confirmed")] --> ATS
  CF --> ATS["POST /ats-analyses<br/>api/router.py"]
  ATS --> SC["score_resume<br/>ats_score.py"]
  SC --> AE[("ats_analyses + ats_evidence")]
  AE --> BR["improvement_brief.py optional"]
```

---

## 5. Trust boundary

```mermaid
flowchart LR
  subgraph UNTRUSTED["Untrusted"]
    B[Browser UI]
    JWT[JWT in localStorage/cookie]
    VITE[VITE_FIREBASE_* only]
  end

  subgraph TRUSTED["Trusted · FastAPI process"]
    SEC[AUTH_SECRET · service account<br/>GROQ · NVIDIA · YouTube · Adzuna]
    OWN[user_id ownership checks]
  end

  subgraph STORE["Firebase · Admin only"]
    FS[(Firestore)]
    ST[(Storage)]
    DENY[Client rules: allow false]
  end

  B -->|HTTPS + JWT| TRUSTED
  TRUSTED -->|Admin SDK| STORE
  B -.->|no direct product data path| DENY
```

---

## Related docs

- [Architecture](./architecture.md) — narrative for the same system  
- [Flows](./flows.md) — step-by-step file citations  
- [Code map](./code-map.md) — where each node lives in the repo  
