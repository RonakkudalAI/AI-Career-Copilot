"""
Plain-text extraction from PDF/DOCX.

Priority for PDF:
  1) Docling (optional) — layout-aware, higher fidelity when installed
  2) pypdf — always available fallback

Never invents text; only returns what the extractor yields from the file bytes.
"""

from __future__ import annotations

import io
import logging
import re
import tempfile
from pathlib import Path

from docx import Document
from pypdf import PdfReader

from app.core.errors import ApiError

logger = logging.getLogger(__name__)

PDF_MIME = "application/pdf"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _normalize_extracted_text(text: str) -> str:
    """Preserve line structure; collapse weird whitespace without merging sections."""
    # Normalize Windows/Mac newlines
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # Soft hyphen / zero-width noise from PDFs
    text = text.replace("\u00ad", "").replace("\ufeff", "")
    lines: list[str] = []
    for raw in text.split("\n"):
        # Collapse runs of spaces/tabs inside a line only
        line = re.sub(r"[ \t]+", " ", raw).strip()
        lines.append(line)
    # Collapse 3+ blank lines to a single blank (keep one separator for entry splits)
    cleaned: list[str] = []
    blank_run = 0
    for line in lines:
        if not line:
            blank_run += 1
            if blank_run <= 1:
                cleaned.append("")
            continue
        blank_run = 0
        cleaned.append(line)
    return "\n".join(cleaned).strip()


def _extract_pdf_pypdf(content: bytes) -> str:
    reader = PdfReader(io.BytesIO(content))
    if reader.is_encrypted:
        raise ApiError(400, "encrypted_pdf", "Password-protected PDFs are not supported.")
    pages: list[str] = []
    for page in reader.pages:
        page_text = page.extract_text() or ""
        pages.append(page_text)
    return _normalize_extracted_text("\n".join(pages))


def _extract_pdf_docling(content: bytes) -> str | None:
    """
    Optional Docling path. Returns None if Docling is not installed or fails,
    so callers fall back to pypdf without breaking the app.
    """
    try:
        from docling.document_converter import DocumentConverter  # type: ignore
    except Exception:
        return None

    tmp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as handle:
            handle.write(content)
            tmp_path = handle.name
        converter = DocumentConverter()
        result = converter.convert(tmp_path)
        # Prefer markdown/export_text for clearer section headings
        doc = result.document
        text = ""
        if hasattr(doc, "export_to_markdown"):
            text = doc.export_to_markdown() or ""
        elif hasattr(doc, "export_to_text"):
            text = doc.export_to_text() or ""
        else:
            text = str(doc)
        text = _normalize_extracted_text(text)
        return text or None
    except Exception as exc:
        logger.info("docling_pdf_extract_failed error=%s", exc)
        return None
    finally:
        if tmp_path:
            try:
                Path(tmp_path).unlink(missing_ok=True)
            except Exception:
                pass


def _docx_paragraph_text(document: Document) -> list[str]:
    lines: list[str] = []
    for paragraph in document.paragraphs:
        text = (paragraph.text or "").strip()
        if text:
            lines.append(text)
    for table in document.tables:
        for row in table.rows:
            cells = [(cell.text or "").strip() for cell in row.cells]
            cells = [cell for cell in cells if cell]
            for cell in cells:
                for part in cell.splitlines():
                    part = part.strip()
                    if part:
                        lines.append(part)
    return lines


def extract_text(content: bytes, mime_type: str) -> str:
    """Extract plain text from PDF or DOCX bytes. Raises ApiError on failure/empty."""
    try:
        if mime_type == PDF_MIME:
            text = _extract_pdf_docling(content)
            if not text:
                text = _extract_pdf_pypdf(content)
        elif mime_type == DOCX_MIME:
            document = Document(io.BytesIO(content))
            text = _normalize_extracted_text("\n".join(_docx_paragraph_text(document)))
        else:
            raise ApiError(415, "unsupported_document_type", "Only PDF and DOCX documents are supported.")
    except ApiError:
        raise
    except Exception as exc:
        raise ApiError(400, "document_parse_failed", "The document could not be read.") from exc

    if not (text or "").strip():
        raise ApiError(
            422,
            "document_has_no_text",
            "No usable text was found. Scanned documents require OCR, which is not enabled.",
        )
    return text.strip()
