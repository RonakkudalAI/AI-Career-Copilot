# Document parsing — how it works

**Canonical:** [../DOCUMENTATION.md](../DOCUMENTATION.md) §7.2.

## Goal

Turn PDF/DOCX (or pasted JD text) into **plain text + structured sections** for human review, then confirmation.

## Pipeline

```text
bytes → validate mime/size
     → extract_text (thread pool)
     → extract_sections (prefer_llm=False on upload)
     → clean structured content (links preserved)
     → persist review_required
```

Entry: `parse_document_bytes` in `features/document_parsing/pipeline.py`.

### Text extraction

`parsing/text_extract.py` tries optional fast PDF backends (PyMuPDF, pdfplumber) then pypdf. DOCX uses python-docx. Quality gates reject empty/garbage extracts.

### Sections

Upload/review paths use **structural** segregation so the candidate is not blocked on a remote model. LLM line→section mapping (`document_section_extract_v1.txt`) is available when a flow explicitly prefers LLM enrichment.

Headings become slug keys (e.g. `work_experience`). Downstream features that only look for exact keys like `experience` / `skills` may need alias handling (see known caveats in the canonical doc).

### Confirm gate

```text
review_required → (PATCH extraction) → POST confirm → confirmed
```

Only confirmed sources feed ATS, job match, interview prep evidence, and learning (via ATS).

## Key files

- `features/document_parsing/pipeline.py`  
- `features/document_parsing/parsing/text_extract.py`  
- `features/document_parsing/parsing/llm_sections.py`  
- `features/document_parsing/service.py`
