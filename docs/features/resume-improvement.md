# Feature: Resume improvement & exports

## Purpose

Generate **evidence-checked** rewrite suggestions for confirmed resume sections (and optional JD context), let the user accept/reject/edit them, apply changes, and export documents. This is primarily an **API/crew path** — there is no full post-ATS in-app resume editor; the main product loop remains **re-upload**.

## Why evidence validation

Suggestions must hash-ground to source text so the model cannot invent employers, titles, or metrics detached from the resume.

## File map

| File | Role |
|------|------|
| `features/resume_improvement/routes.py` | HTTP endpoints |
| `features/resume_management/improvements.py` | Domain orchestration |
| `features/resume_management/improvement_repository.py` | Persist runs/suggestions |
| `features/resume_management/evidence.py` | Source evidence hashes / checks |
| `features/resume_management/validation.py` | Suggestion validation |
| `features/resume_management/exports.py` | PDF/DOCX export generation |
| `features/resume_improvement/agents/crew/orchestrator.py` | Gap → improve → validate |
| `features/resume_improvement/agents/crew/tools.py` | Crew tools |
| `features/resume_improvement/agents/crew/compat.py` | Official CrewAI vs built-in runtime |
| `features/resume_improvement/agents/crew/models.py` | Types |
| `agents/prompts/improve_resume_v1.txt` | Improvement prompt |
| Settings caps | `IMPROVEMENT_MAX_*` in `core/config.py` |

## Flow

```text
GET  /resume-improvements/capabilities
POST /resume-improvements
       → load confirmed source text + optional JD
       → crew:
            1) ATS/gap analyst (tools)
            2) NVIDIA improver (prompt improve_resume_v1)
            3) evidence validator (reject ungrounded claims)
       → store resume_improvement_runs + resume_suggestions

GET  /resume-improvements/{run_id}
GET  /resume-improvements/{run_id}/suggestions
PATCH /resume-suggestions/{id}     accept | reject | edit
POST /resume-improvements/{run_id}/apply

POST /resume-versions/{id}/exports
GET  /resume-exports/{id}/download
```

## Limits

| Setting | Default role |
|---------|--------------|
| `improvement_max_sections` | Cap sections per run |
| `improvement_max_source_chars` | Cap resume source chars |
| `improvement_max_jd_chars` | Cap JD chars |

## Runtime

Same CrewAI-compatible dual runtime as learning:

- Official package when installed  
- Built-in sequential orchestrator otherwise  

Reported via `GET /agents/status` (`resume_improvement`, `resume_improvement_crew`).

## Related

- [flows.md §10](../flows.md)  
- [ATS](./ats-scoring.md) for gap inputs  
- [document parsing](./document-parsing.md) for source versions  
