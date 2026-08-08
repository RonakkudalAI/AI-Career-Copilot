# Resume improvement — how it works

**Canonical:** [../DOCUMENTATION.md](../DOCUMENTATION.md) §7.5.

## Goal

Propose rewrite suggestions for **existing** resume blocks grounded in ATS gaps — never invent employers, metrics, or skills.

## Crew (sequential)

```text
1. analyze_ats_gaps        → missing keywords from evidence only
2. generate_suggestions    → preferred LLM rewrite proposals
3. validate_suggestions    → drop ungrounded suggestions
```

Runtime: official CrewAI if installed; otherwise built-in sequential orchestrator (`resume_improvement/agents/crew/*`).

## HTTP surface

| Path | Role |
|------|------|
| `POST /resume-improvements` | Start run for a resume version + ATS analysis |
| `GET .../suggestions` | List suggestions |
| `PATCH /resume-suggestions/{id}` | Accept / reject / edit |
| `POST .../apply` | Apply accepted suggestions → new version |
| Export endpoints | PDF/DOCX via `resume_management/exports.py` |

## Evidence rules

Blocks are built from structured sections; validation hashes source text. Primary product loop remains: edit → re-upload → re-confirm → re-score.

## Key files

- `features/resume_improvement/routes.py`  
- `features/resume_improvement/agents/crew/*`  
- `features/resume_management/{evidence,improvements,validation,exports}.py`
