# Feature: Document parsing

## Purpose

Turn PDF/DOCX uploads into **plain text + structured sections** that a human can review and confirm. Downstream ATS, learning, and job matching only trust **confirmed** content.

## Why this design

| Choice | Why |
|--------|-----|
| Confirm gate | Extraction is imperfect; user is final authority |
| LLM assigns line numbers only | Model cannot invent resume body text |
| pypdf (+ optional fast backends) | Lightweight, fast, no heavy ML document stack |
| Offload sync extract to threads | Keep FastAPI event loop responsive (`pipeline.py`) |

## File map

| File | Responsibility |
|------|----------------|
| `features/document_parsing/pipeline.py` | Public entry `parse_document_bytes` |
| `features/document_parsing/service.py` | Validation, titles, skill candidates, metadata |
| `features/document_parsing/parsing/text_extract.py` | PDF/DOCX text extraction |
| `features/document_parsing/parsing/llm_sections.py` | LLM section segregation |
| `features/document_parsing/parsing/sections.py` | Heuristic sections |
| `features/document_parsing/extractors/pdf.py` | PyMuPDF → pdfplumber → pypdf blocks |
| `features/document_parsing/extractors/docx.py` | DOCX blocks |
| `features/document_parsing/schemas.py` | Schemas |
| HTTP upload/confirm | `api/router.py` |

## Pipeline flow

```text
parse_document_bytes(content, mime_type, settings)
  │
  ├─ plain_text = await asyncio.to_thread(extract_text, …)
  │     text_extract.extract_text
  │       PDF:  extractors/pdf.parse_pdf_to_blocks
  │             (PyMuPDF → pdfplumber → pypdf)
  │             quality gate ≥ MIN_PDF_TEXT_CHARS (200)
  │       DOCX: python-docx paragraphs + tables
  │             quality gate ≥ MIN_DOCX_TEXT_CHARS (80)
  │
  └─ extracted = await extract_sections_enriched(plain_text, …)
        prefer_llm=True:
          - number lines (cap ~400)
          - LLM returns section kinds + line ranges
          - body rebuilt from source lines only
          - Prefers LLM_PROVIDER (default groq); falls back to the other configured provider
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

## PDF notes

- Core dependency: **pypdf** (`backend/pyproject.toml`)
- Optional: `pip install -e "backend/.[pdf-extras]"` for **PyMuPDF** and **pdfplumber**
- Encrypted PDFs fail closed: `ApiError 400 encrypted_pdf`
- Short/empty extracts: `ApiError 422 document_has_no_text`

## Related

- [flows.md §3–4](../flows.md)  
- [data-model.md](../data-model.md)  
- Tests: `backend/tests/document_parsing/`  
