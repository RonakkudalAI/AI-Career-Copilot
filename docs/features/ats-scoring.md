# Feature: ATS scoring

## Purpose

Score a **confirmed** resume version against a **confirmed** job description with **auditable keyword evidence**. Product score is deterministic — not an LLM composite and not a hiring prediction.

## Product algorithm

| Item | Value |
|------|--------|
| File | `features/ats/ats_score.py` |
| Version | `evidence-keyword-coverage-v3` |
| Persist | `POST /api/v1/ats-analyses` |
| Score-only | `POST /api/v1/ats/score` (no DB write) |

1. Extract JD requirement terms (required weight 2.0, preferred 1.0).  
2. Match resume lines (structured sections preferred) with alias groups.  
3. Strong = 1.0, partial = 0.5, missing = 0.0.  
4. Weighted overall score 0–100, rounded to 2 decimals.  
5. Matched evidence = **exact resume quote**; missing = `null`.

## Persistence & history

```text
POST /ats-analyses
  → score_resume(...)
  → insert ats_analyses (processing)
  → insert ats_evidence rows
  → generate_ats_improvement_brief (optional LLM, never blocks score)
  → update completed (+ summary brief fields)
  → return enriched analysis (resume + job_description metadata)
```

`GET /ats-analyses` and `GET /ats-analyses/{id}` call `_enrich_ats_analysis` so the UI can show **Resume used** / **Job description used**.

Fingerprint of source text + confirm timestamps skips re-score when inputs are unchanged.

## Improvement brief

| File | `features/ats/agents/improvement_brief.py` |
|------|--------------------------------------------|
| Order | `preferred_llm_providers` (Groq/NVIDIA per `LLM_PROVIDER`) |
| Timeout | Cap ~12s optional AI so scoring does not hang |
| Fallback | Deterministic missing-keyword brief |

## Optional library (not product persist path)

`features/ats/agent/` structured composite scorer is for library/tests. It is **not** what `POST /ats-analyses` writes today.

## Data

`ats_analyses` + `ats_evidence`.

## Related

- [document-parsing.md](./document-parsing.md) confirm gate  
- [learning.md](./learning.md) consumes not_found / partial evidence  
- Tests: `backend/tests/ats_scoring/`  
