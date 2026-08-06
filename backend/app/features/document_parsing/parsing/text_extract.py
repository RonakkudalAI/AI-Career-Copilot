
from __future__ import annotations

import io
import logging
import re

from docx import Document

from app.core.errors import ApiError

logger = logging.getLogger(__name__)
PDF_MIME = "application/pdf"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
# Minimum usable extracted text length (chars). Applied on every accept path.
MIN_PDF_TEXT_CHARS = 200
MIN_DOCX_TEXT_CHARS = 80


def _normalize_extracted_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\u00ad", "").replace("\ufeff", "")
    lines: list[str] = []
    for raw in text.split("\n"):
        line = re.sub(r"[ \t]+", " ", raw).strip()
        if line.startswith("#"):
            line = re.sub(r"^#+\s*", "", line).strip()
        lines.append(line)
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


def _docx_paragraph_text(document: Document) -> list[str]:
    lines: list[str] = []
    for paragraph in document.paragraphs:
        text = (paragraph.text or "").strip()
        if text:
            lines.append(text)
    for table in document.tables:
        for row in table.rows:
            cells = [(cell.text or "").strip() for cell in row.cells]
            for cell in cells:
                for part in cell.splitlines():
                    part = part.strip()
                    if part:
                        lines.append(part)
    return lines


def _extract_pdf_text(content: bytes) -> str:
    """Extract PDF text via fast backends: PyMuPDF → pdfplumber → pypdf.

    Implementation lives in extractors/pdf.py (no heavy ML document converters).
    """
    from app.features.document_parsing.extractors.pdf import parse_pdf_to_blocks

    blocks = parse_pdf_to_blocks(content)
    text = _normalize_extracted_text(
        "\n".join(block.text for block in blocks if getattr(block, "text", None))
    )
    if not text:
        raise ApiError(422, "document_has_no_text", "No usable text was found in this PDF.")
    if len(text) < MIN_PDF_TEXT_CHARS:
        raise ApiError(
            422,
            "document_has_no_text",
            f"Extracted PDF text is too short to use (need at least {MIN_PDF_TEXT_CHARS} characters).",
        )
    return text


def _extract_docx_text(content: bytes) -> str:
    try:
        document = Document(io.BytesIO(content))
    except Exception as exc:
        logger.exception("docx_extract_failed")
        raise ApiError(
            400,
            "document_parse_failed",
            "Could not parse this DOCX document.",
        ) from exc
    text = _normalize_extracted_text("\n".join(_docx_paragraph_text(document)))
    if not text:
        raise ApiError(422, "document_has_no_text", "No usable text was found in the DOCX.")
    if len(text) < MIN_DOCX_TEXT_CHARS:
        raise ApiError(
            422,
            "document_has_no_text",
            f"Extracted DOCX text is too short to use (need at least {MIN_DOCX_TEXT_CHARS} characters).",
        )
    return text


def extract_text(content: bytes, mime_type: str) -> str:
    if not content:
        raise ApiError(400, "empty_document", "The selected document is empty.")
    if mime_type == PDF_MIME:
        return _extract_pdf_text(content)
    if mime_type == DOCX_MIME:
        return _extract_docx_text(content)
    raise ApiError(415, "unsupported_document_type", "Only PDF and DOCX documents are supported.")
