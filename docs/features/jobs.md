# Feature: Jobs & recommendations

## Purpose

Browse a local job catalog, optionally sync external listings (Adzuna), and generate **evidence-grounded recommendations** from a confirmed resume.

## Why evidence grounding

Profile skills alone can be aspirational. Matching prefers **confirmed resume text** so recommendations do not invent capabilities.

## File map

| File | Role |
|------|------|
| `features/career_matching.py` | `score_job`, `candidate_skill_evidence`, algorithm version |
| `features/adzuna_api.py` | External job search/sync client |
| `api/router.py` | `/jobs*`, `/job-recommendations*`, `/saved-jobs*` |
| Frontend list/detail | `features/jobs/components/jobs.tsx` |
| Globe visualization | `features/jobs/components/career-globe.tsx`, `globe-utils.ts` |
| Types | `features/jobs/components/job-types.ts` |

## Algorithm

| Property | Value |
|----------|-------|
| Version | `evidence-keyword-match-v1` |
| Module | `career_matching.py` |

### Evidence builder

`candidate_skill_evidence(client, user_id, resume, version)`:

1. Skills-like sections + plain text from **confirmed version**  
2. Profile `candidate_skills` only if the phrase also appears in resume evidence  

### Score

If job has requirements:

```text
match_score ≈ (matched/requirements)*80 + min(role_hits, 4)*5
```

If no requirements:

```text
match_score ≈ min(role_hits*12, 40)
```

Phrase matching uses boundary-aware regex to avoid `java` matching inside `javascript`.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/jobs` | Catalog browse |
| GET | `/jobs/{id}` | Detail |
| POST | `/jobs/external/sync` | Adzuna pull (needs `ADZUNA_APP_ID/KEY`) |
| GET/POST | `/job-recommendations`, `/generate` | List / compute |
| GET/POST/PATCH/DELETE | `/saved-jobs…` | Bookmarks |

## Adzuna config

Env (see `.env.example`):

- `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`  
- `ADZUNA_COUNTRY`, `ADZUNA_RESULTS_PER_PAGE`, timeouts  

Empty keys → sync disabled / error per route.

## Related

- [flows.md §9](../flows.md)  
- [data-model.md](../data-model.md) jobs group  
- Tests: `backend/tests/test_external_jobs_sync.py`  
