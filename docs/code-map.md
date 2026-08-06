# Code map

Where code lives, what it owns, and how pieces connect. Paths are relative to the repository root.

---

## Root

| Path | Role |
|------|------|
| `package.json` | Monorepo scripts: `setup`, `dev`, checks, `test:backend` |
| `.env` / `.env.example` | Single env file for frontend + backend |
| `README.md` | Product overview + quick start |
| `docs/` | This documentation set |
| `firebase/firestore.rules` | Deny all client Firestore access |
| `firebase/storage.rules` | Storage security rules |
| `scripts/` | Install, dev orchestration, diagnostics |
| `secrets/` | Local service-account JSON (**gitignored**; never commit) |

---

## Scripts

| Path | Role |
|------|------|
| `scripts/setup/project.mjs` | Orchestrates full install |
| `scripts/setup/backend.mjs` | Creates venv, `pip install -e backend` |
| `scripts/setup/firebase.mjs` | Firebase connectivity checks |
| `scripts/dev/preflight.mjs` | Env/Firestore preflight before `dev` |
| `scripts/dev/run.mjs` | Spawns frontend + backend |
| `scripts/dev/frontend.mjs` / `backend.mjs` | Process launchers |
| `scripts/shared/load-env.mjs` | Loads root `.env` for Node scripts |
| `scripts/shared/ports.mjs` | Port resolution |
| `scripts/shared/backend-venv.mjs` | Locates `backend/.venv` Python |
| `scripts/diagnostics/verify-environment.mjs` | `npm run check:env` |
| `scripts/diagnostics/check-secrets.mjs` | Credential leak scan |
| `scripts/diagnostics/check-firestore.py` | Firestore probe |
| `scripts/diagnostics/e2e-smoke.py` | API workflow smoke |
| `scripts/diagnostics/audit-local-api.py` | Local API audit |
| `scripts/verify-boundaries.mjs` | Import boundary checks |
| `scripts/run-frontend.mjs` | Runs frontend npm tasks from root |

---

## Backend entry and core

| Path | Role |
|------|------|
| `backend/pyproject.toml` | Package `career-copilot-api`, deps, ruff, optional extras |
| `backend/app/main.py` | FastAPI app: CORS, middleware, exception handlers, router mounts |
| `backend/app/core/config.py` | `Settings` from root `.env`; provider validators |
| `backend/app/core/constants.py` | JWT algo, password min length, optional ATS composite weights |
| `backend/app/core/errors.py` | `ApiError` + JSON error handlers |

### Boot flow

```text
uvicorn app.main:app
  → get_settings()
  → FastAPI(title=…)
  → CORSMiddleware
  → api_error_handler / unexpected_error_handler
  → request_context middleware (X-Request-ID)
  → include_router(api.router)
  → include_router(ats.routes)   # POST /ats/score
```

---

## Backend API layer

| Path | Role |
|------|------|
| `backend/app/api/router.py` | **Primary HTTP surface** — auth, profile, resumes, JDs, ATS persistence, interviews, learning, jobs, settings, account |
| `backend/app/api/schemas.py` | Pydantic request bodies |
| `backend/app/features/ats/routes.py` | Stateless `POST /ats/score` |
| `backend/app/features/resume_improvement/routes.py` | Improvement runs, suggestions, exports |

`router.py` calls into features and database helpers; it also contains password scrypt helpers and signup graph creation.

---

## Backend database layer

| Path | Role |
|------|------|
| `backend/app/database/client.py` | Firestore query adapter, table allow-list, Firebase/Supabase storage objects |
| `backend/app/database/repository.py` | `owned_row(s)`, activity, profile completion recalculation, `CANDIDATE_TABLES` |
| `backend/app/database/activity.py` | Activity prune limits and helpers |

### Adapter pattern (why)

Feature code uses:

```python
client.table("resumes").select("*").eq("user_id", …).execute()
```

instead of raw Firestore API. Storage uses logical buckets (`document_bucket`, `avatar_bucket`) as **prefixes** inside the configured cloud bucket.

---

## Backend agents

| Path | Role |
|------|------|
| `backend/app/agents/registry.py` | Agent inventory for `/agents/status` and health |
| `backend/app/agents/providers/nvidia_client.py` | NVIDIA Integrate API client |
| `backend/app/agents/providers/groq_client.py` | Groq OpenAI-compatible client |
| `backend/app/agents/providers/common.py` | Shared completion / JSON helpers |
| `backend/app/agents/providers/rate_limit.py` | Process-level RPM budget |
| `backend/app/agents/providers/prompts.py` | Load prompt text files |
| `backend/app/agents/prompts/*.txt` | Versioned prompt packs |

| Prompt file | Used by |
|-------------|---------|
| `improve_resume_v1.txt` | Resume improvement |
| `fill_profile_from_resume_v1.txt` | Profile fill |
| `interview_questions_v1.txt` | Mock interview start |
| `interview_preparation_v1.txt` | Interview preparation |
| `ats_improvement_v1.txt` | ATS brief |
| `learning_youtube_path_v1.txt` | Learning planner |
| `document_section_extract_v1.txt` | Section segregation |
| `repair_structured_output_v1.txt` | JSON repair pass |

---

## Backend features (domain)

### Auth

| Path | Role |
|------|------|
| `features/auth/service.py` | `CurrentUser`, JWT create/decode, `get_current_user` |
| `features/auth/account_deletion.py` | Confirm phrase, storage path collect, cascade table list |

### Profile

| Path | Role |
|------|------|
| `features/profile/completion.py` | Checklist weights → 0–100 |
| `features/profile/avatars.py` | Upload validation, signed URLs |
| `features/profile/importer.py` | Apply validated batch from draft |
| `features/profile/agent/pipeline.py` | Fill-from-resume orchestration |
| `features/profile/agent/deterministic.py` | Non-LLM mapping |
| `features/profile/agent/normalize.py` | Date/value normalization |

### Document parsing

| Path | Role |
|------|------|
| `features/document_parsing/pipeline.py` | `parse_document_bytes` public entry |
| `features/document_parsing/service.py` | Validate, skills candidates, titles, metadata helpers |
| `features/document_parsing/parsing/text_extract.py` | PDF/DOCX text extraction (pypdf chain + python-docx) |
| `features/document_parsing/parsing/llm_sections.py` | LLM line→section mapping |
| `features/document_parsing/parsing/sections.py` | Structural/heuristic sections |
| `features/document_parsing/extractors/pdf.py` | Lightweight PDF blocks |
| `features/document_parsing/extractors/docx.py` | DOCX blocks |
| `features/document_parsing/schemas.py` | Extraction schemas |
| `features/document_parsing/confidence.py` | Confidence helpers |
| `features/document_parsing/contamination.py` | Contamination checks |
| `features/document_parsing/grounding.py` | Grounding utilities |
| `features/document_parsing/reconciliation.py` | Merge/reconcile helpers |
| `features/document_parsing/source_blocks.py` | Source block types (internal) |

### Resume management / improvement

| Path | Role |
|------|------|
| `features/resume_management/evidence.py` | Evidence hashing / validation |
| `features/resume_management/validation.py` | Suggestion validation |
| `features/resume_management/improvements.py` | Improvement domain logic |
| `features/resume_management/improvement_repository.py` | Persistence for runs/suggestions |
| `features/resume_management/exports.py` | PDF/DOCX export generation |
| `features/resume_improvement/routes.py` | HTTP for improvement |
| `features/resume_improvement/agents/crew/*` | Gap → improve → validate crew |

### ATS

| Path | Role |
|------|------|
| `features/ats/ats_score.py` | **Product scorer** `evidence-keyword-coverage-v3` |
| `features/ats/agents/improvement_brief.py` | LLM/deterministic brief after score |
| `features/ats/routes.py` | Stateless score endpoint |
| `features/ats/deterministic.py` | Deterministic helpers |
| `features/ats/agent/*` | Optional CrewAI structured ATS **library** (not product persist path) |
| `features/ats/scoring/*` | Optional composite scoring service/schemas |

### Interview

| Path | Role |
|------|------|
| `features/interview/preparation.py` | Evidence-grounded prep packs |
| `features/interview/question_bank.py` | Local question templates |
| `features/interview/agent/question_generator.py` | Groq structured questions |

### Learning

| Path | Role |
|------|------|
| `features/learning/service.py` | Public `generate_learning_path_from_ats` |
| `features/learning/youtube_api.py` | YouTube Data API search |
| `features/learning/youtube_catalog.py` | Algorithm version + catalog helpers |
| `features/learning/agents/crew/orchestrator.py` | Sequential crew wiring |
| `features/learning/agents/crew/tools.py` | Gap extract, plan, materialize tools |
| `features/learning/agents/crew/models.py` | Crew result types |

### Jobs

| Path | Role |
|------|------|
| `features/career_matching.py` | Recommendation match score `evidence-keyword-match-v1` |
| `features/adzuna_api.py` | External job sync client |

---

## Frontend map

| Path | Role |
|------|------|
| `frontend/package.json` | Vite app scripts and deps |
| `frontend/vite.config.mjs` | Alias `@`, BFF proxy rewrite |
| `frontend/src/main.tsx` | React bootstrap |
| `frontend/src/App.tsx` | Routes, lazy imports, `ProtectedRoute` |
| `frontend/src/globals.css` | Theme tokens / Tailwind |
| `frontend/src/shared/api/client.ts` | Authenticated API client |
| `frontend/src/shared/config.ts` | Token keys, demo cookie, API base |
| `frontend/src/shared/routes.ts` | Route constants |
| `frontend/src/shared/theme.tsx` | Theme provider |
| `frontend/src/components/ui/*` | Shared UI primitives |
| `frontend/src/features/auth/*` | Auth screens + session client + Firebase + demo |
| `frontend/src/features/dashboard/*` | Dashboard |
| `frontend/src/features/resume/*` | Resume/ATS flow UI |
| `frontend/src/features/interview/*` | Mock interview + prep UI |
| `frontend/src/features/learning/*` | Learning paths UI |
| `frontend/src/features/jobs/*` | Jobs + globe visualization |
| `frontend/src/features/settings/*` | Profile/account/preferences/privacy |
| `frontend/src/features/onboarding/*` | First-run onboarding |
| `frontend/src/features/marketing/*` | Landing page sections |
| `frontend/src/features/workspace/*` | Shell/nav layout |
| `frontend/src/features/profile/*` | Completion toast/model helpers |
| `frontend/public/icon.svg` | App icon |

---

## Tests map

| Path | Role |
|------|------|
| `backend/tests/ats_scoring/` | Keyword score, gate, schemas, service |
| `backend/tests/document_parsing/` | Sections, validation, e2e parse, performance |
| `backend/tests/interview/` | Preparation |
| `backend/tests/learning/` | YouTube crew |
| `backend/tests/fixtures/resumes/` | PDF/DOCX/JSON fixtures |
| `backend/tests/test_*.py` | Auth, avatars, jobs sync, rate limit, Firestore guards |
| `frontend/e2e/` | Playwright (landing) |
| `frontend/src/**/__tests__` | Vitest unit tests |

---

## Quick “where do I change X?”

| Change | Primary files |
|--------|----------------|
| New API endpoint | `api/router.py` (+ schema in `api/schemas.py`) |
| ATS formula | `features/ats/ats_score.py` |
| PDF extraction | `features/document_parsing/parsing/text_extract.py` |
| Section segregation | `parsing/llm_sections.py`, `parsing/sections.py` |
| JWT / session | `features/auth/service.py`, frontend `auth/api/client.ts` |
| Profile % | `features/profile/completion.py` |
| Job match % | `features/career_matching.py` |
| Learning path | `features/learning/**` |
| Env var | `.env.example` + `core/config.py` |
| Proxy paths | `frontend/vite.config.mjs` + `shared/config.ts` |
| UI route | `frontend/src/App.tsx` + `shared/routes.ts` |
| Agent status | `agents/registry.py` |
