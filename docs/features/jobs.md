# Jobs & recommendations — how it works

**Canonical:** [../DOCUMENTATION.md](../DOCUMENTATION.md) §7.8.

## Goal

Recommend jobs from a local catalog using confirmed resume evidence; external fill uses the reference project's
country-agnostic, public FreeHire search API.

## Catalog

| Path | Behavior |
|------|----------|
| `GET /jobs` | Active jobs |
| `POST /jobs/external/sync` | FreeHire search (page 1) from candidate preferences; cooldown + process lock |
| `GET /jobs/{id}` | Job detail |

Synced jobs store title, company, location, description, optional geo, extracted tech `requirements`, `external_id`, and
the source. FreeHire is read-only and requires no API key; it is best-effort and may be disabled with `FREEHIRE_ENABLED=false`.

## Recommendations

Algorithm `evidence-keyword-match-v1` (`career_matching.py`):

1. Load confirmed resume version (active resume default).  
2. Build skill/evidence text (profile skills only if grounded in resume).  
3. Score each active job (requirement coverage + title role hits).  
4. Rank, paginate (`offset`/`limit`), persist `job_recommendations`.

## Saved / pipeline

`saved_jobs` tracks statuses: saved, applied, interviewing, offer, rejected, withdrawn. Frontend pipeline filters map these into saved/applied/rejected buckets.

## Frontend

- `jobs.tsx` generate feed + saved view  
- `job-recs-cache.ts` sessionStorage SWR  
- `career-globe.tsx` geo visualization  

## Key files

- `features/career_matching.py`  
- `api/router.py` jobs handlers  
- `frontend/src/features/jobs/*`
