# Feature: Document parsing

## Purpose

Turn uploaded PDF/DOCX (or pasted JD text) into **source-true plain text and sections** the candidate can review before confirmation.

## Pipeline

**Entry:** `features/document_parsing/pipeline.py` → `parse_document_bytes`.

1. **Extract text** (`parsing/text_extract.py`, PDF extractors, DOCX).  
2. **Section segregation** (`parsing/llm_sections.py` or structural layout).  
3. Materialize section bodies only from source line numbers.  
4. Persist on `resume_versions` / `job_descriptions` with `extraction_status=review_required`.  
5. User edits (optional) → **confirm** → `confirmed`.

## LLM sections

Prefers `LLM_PROVIDER` (default Groq), then the other configured provider, then structural layout.  
Groq resume-parser models (`GROQ_RESUME_PARSER_*`) may be used for strict schema extraction when configured.

NVIDIA rate limits / failures no longer block the whole parse when a fallback exists.

## Status lifecycle

```text
pending → processing → review_required → confirmed
                              ↘ failed
```

Only **confirmed** documents feed ATS, learning path generation, interview preparation evidence, and job recommendation evidence.

## Files

| Path | Role |
|------|------|
| `pipeline.py` | Orchestration |
| `parsing/text_extract.py` | Text extract |
| `parsing/llm_sections.py` | LLM line assignment |
| `parsing/sections.py` | Structural layout |
| `extractors/pdf.py` / `docx.py` | Format readers |

## Related

- [ATS scoring](./ats-scoring.md)  
- Tests: `backend/tests/document_parsing/`  
