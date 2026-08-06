# Feature: Document parsing

## Purpose

Turn PDF/DOCX uploads into **plain text + structured sections** that a human can review and confirm. Downstream ATS, learning, and job matching only trust **confirmed** content.

## Why this design

| Choice | Why |
|--------|-----|
| Confirm gate | Extraction is imperfect; user is final authority |
| LLM assigns line numbers only | Model cannot invent resume body text |
| Fast extract before Docling | Most resumes have extractable text; Docling is heavier |
| Offload sync extract to threads | Keep FastAPI event loop responsive (`pipeline.py`) |

## File map

| File | Responsibility |
|------|----------------|
| `features/document_parsing/pipeline.py` | Public entry `parse_document_bytes` |
| `features/document_parsing/service.py` | Validation, titles, skill candidates, metadata |
| `features/document_parsing/parsing/text_extract.py` | PDF/DOCX text extraction |
| `features/document_parsing/parsing/llm_sections.py` | LLM section segregation |
| `features/document_parsing/parsing/sections.py` | Heuristic sections |
| `features/document_parsing/extractors/pdf.py` | Lightweight PDF → blocks |
| `features/document_parsing/extractors/docx.py` | DOCX → blocks |
| `features/document_parsing/schemas.py` | Schemas |
| `features/document_parsing/confidence.py` | Confidence helpers |
| `features/document_parsing/contamination.py` | Contamination checks |
| `features/document_parsing/grounding.py` | Grounding helpers |
| `features/document_parsing/reconciliation.py` | Reconciliation |
| `features/document_parsing/source_blocks.py` | Block model |
| `agents/prompts/document_section_extract_v1.txt` | Section prompt |
| HTTP upload/confirm | `api/router.py` |

## Pipeline flow

```text
parse_document_bytes(content, mime_type, settings)
  │
  ├─ plain_text = await asyncio.to_thread(extract_text, …)
  │     text_extract.extract_text
  │       PDF:
  │         1) _extract_pdf_fast  (extractors/pdf, need ≥200 chars)
  │         2) Docling convert under process lock
  │         3) extractor fallback if Docling fails
  │       DOCX:
  │         1) python-docx fast (≥80 chars)
  │         2) Docling
  │         3) python-docx fallback
  │
  └─ extracted = await extract_sections_enriched(plain_text, …)
        prefer_llm=True:
          - number lines (cap ~400)
          - LLM returns section kinds + line ranges
          - body rebuilt from source lines only
          - NVIDIA first; Groq on 429
        else:
          - structural heuristics (sections.py)
  │
  return plain_text, cleaned structured_content
```

Cleaned structure (`pipeline._clean_structured`):

```json
{
  "schema_version": "resume-extraction-v1",
  "sections": { "skills": ["…"], "experience": ["…"] },
  "warnings": [],
  "extraction_method": "…"
}
```

## Status lifecycle (where stored)

On `resume_versions` / `job_descriptions` (set by router helpers):

```text
processing → review_required → confirmed | failed
```

Confirm endpoints:

- `POST /resume-versions/{id}/confirm`  
- `POST /job-descriptions/{id}/confirm`  

User may `PATCH …/extraction` before confirm.

## Docling notes

- Env `DOCLING_INFERENCE_COMPILE_TORCH_MODELS=false` for portable CPU installs.  
- Converter cached once per process (`lru_cache`); convert serialized with a `Lock`.  
- Missing Docling → `ApiError 503 docling_not_installed`.  

## Related

- [flows.md §3–4](../flows.md)  
- [data-model.md](../data-model.md)  
- Tests: `backend/tests/document_parsing/`  
