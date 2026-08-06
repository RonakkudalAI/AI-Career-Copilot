# Feature: Resume improvement

## Purpose

Propose **evidence-bound** rewrites for confirmed resume blocks, optionally guided by ATS gaps. Never invent employers, metrics, or skills not supported by source text.

## Orchestration

| Piece | Location |
|-------|----------|
| HTTP | `features/resume_management/improvements.py`, routes in `api/router.py` |
| Crew | `features/resume_improvement/agents/crew/` |
| Runtime | `official_crewai` when `crewai` installed; else compatible sequential tools |
| Tools | Gap analyze → LLM generate (`preferred_llm_providers`) → validate |

Capability: `GET` improvements capabilities / agents status shows preferred provider order.

## Flow

```text
POST /resume-improvements
  confirmed resume sections + optional ATS analysis
  → crew tools
  → resume_suggestions rows
PATCH suggestions (accept/reject/edit)
POST apply / export (docx/pdf) to storage
```

## Providers

Uses `LLM_PROVIDER` order via `tool_generate_resume_suggestions`.  
If no LLM is configured, improvement is unavailable; manual re-upload remains the path.

## Related

- [ATS scoring](./ats-scoring.md)  
- [Data model](../data-model.md) improvement collections  
