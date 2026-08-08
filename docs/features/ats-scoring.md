# ATS scoring — how it works

**Canonical:** [../DOCUMENTATION.md](../DOCUMENTATION.md) §7.4.

## Goal

Score a **confirmed** resume against a **confirmed** job description with auditable keyword evidence — not a hiring prediction.

## Algorithm

| Item | Value |
|------|--------|
| Version | `evidence-keyword-coverage-v4` |
| File | `backend/app/features/ats/ats_score.py` |
| Persist | `POST /api/v1/ats-analyses` |
| Stateless | `POST /api/v1/ats/score` |

### Steps

1. Gate: both sources `extraction_status=confirmed`.  
2. Fingerprint plain text + structure + confirm timestamps → return prior analysis if unchanged.  
3. Extract JD terms (required vs preferred weights, section markers, alias groups).  
4. Match resume lines (structured sections preferred).  
5. Strong / partial / missing → weighted overall 0–100.  
6. Persist analysis + evidence rows (exact quote or null).  
7. Optional improvement brief (LLM with deterministic fallback).

## History UX

List/detail enrich each analysis with the resume version and JD that were used (including “unavailable” labels if deleted).

## Not product path

`features/ats/agent/*` and `features/ats/scoring/*` are library/test composites. Product scoring always uses deterministic `score_resume`.

## Key files

- `features/ats/ats_score.py`  
- `features/ats/agents/improvement_brief.py`  
- `features/ats/routes.py`  
- `api/router.py` ATS handlers  
- Frontend: `features/resume/components/resume-flow.tsx`
