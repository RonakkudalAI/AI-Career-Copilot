# Feature: ATS scoring

## Purpose

Score a **confirmed resume** against a **confirmed job description** with transparent keyword coverage and **exact resume quotes** as evidence.

## Product algorithm

| Property | Value |
|----------|-------|
| Name | Evidence-backed keyword coverage |
| Version | `evidence-keyword-coverage-v3` |
| Module | `backend/app/features/ats/ats_score.py` |
| Persist | `POST /api/v1/ats-analyses` (`api/router.py`) |
| Stateless | `POST /api/v1/ats/score` (`features/ats/routes.py`) |

## Why deterministic product scoring

1. **Auditable** — each term has a quote or explicit null.  
2. **Stable** — no model temperature in the score itself.  
3. **Testable** — unit tests under `backend/tests/ats_scoring/`.  
4. **Golden rule** — never invent experience lines.

LLMs may only add an **improvement brief** after scoring (`features/ats/agents/improvement_brief.py`), constrained to missing/matched lists.

## File map

| File | Role |
|------|------|
| `features/ats/ats_score.py` | Term extract, match, formula, fingerprint helpers |
| `features/ats/agents/improvement_brief.py` | Optional brief |
| `features/ats/routes.py` | Stateless score |
| `features/ats/deterministic.py` | Helpers |
| `api/router.py` | `create_ats` persistence path |
| `features/ats/agent/*` | Optional structured LLM ATS **library** |
| `features/ats/scoring/*` | Composite service/schemas (library) |
| `core/constants.py` | Composite weights + domain gate (library only) |

## Scoring steps (product)

### 1. Inputs

- Resume `plain_text` + optional `structured_content.sections`  
- JD `raw_text`  
- Both must be `extraction_status == confirmed` on the persist path  

### 2. Extract JD terms (`_candidate_terms`)

- Scan requirements/skills-style lines  
- Classify **required** (weight 2.0) vs **preferred** (weight 1.0)  
- Cap **80** terms  
- Alias groups for matching only (`js`↔javascript, `k8s`↔kubernetes, …)

### 3. Resume lines

Prefer structured sections → `(line, section)` pairs; else layout split of plain text.

### 4. Match

| Strength | Credit `c` | Meaning |
|----------|------------|---------|
| strong | 1.0 | Strong section/phrase match |
| partial | 0.5 | Alias or weaker placement |
| missing | 0.0 | Not found |

Evidence quote = **exact resume line** or `null`.

### 5. Formula

\[
W=\sum w_i,\quad
\text{contribution}_i=100\cdot\frac{w_i c_i}{W},\quad
\text{overall\_score}=\mathrm{round}\sum\text{contribution}_i
\]

Also compute required/preferred sub-scores for UI breakdown.

### 6. Persist

`ats_analyses` + one `ats_evidence` row per term.  
Fingerprint of source text + confirm times avoids stale cache when content changes under same ids.

## Optional library path (not product)

Under `features/ats/agent/` + `scoring/service.py`:

1. LLM parse resume / JD  
2. Domain gate (skill overlap &lt; 0.15 + family mismatch → reject)  
3. Composite weights (`core/constants.py`):  

| Parameter | Weight |
|-----------|-------:|
| hard_skill_match | 0.40 |
| experience_relevance | 0.25 |
| education_match | 0.15 |
| certifications_match | 0.10 |
| seniority_alignment | 0.10 |

**Not** what `POST /ats-analyses` writes today (router forces keyword coverage and `structured_parameter_scores=None` path).

## Related

- [flows.md §5](../flows.md)  
- [learning](./learning.md) consumes ATS evidence gaps  
- Tests: `backend/tests/ats_scoring/`  
