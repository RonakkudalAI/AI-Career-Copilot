from __future__ import annotations

from app.core.errors import ApiError
from app.features.document_parsing.extractors.docx import parse_docx_to_blocks
from app.features.document_parsing.extractors.ocr import ExtractionResult, process_scanned_pdf
from app.features.document_parsing.extractors.pdf import parse_pdf_to_blocks
from app.features.document_parsing.source_blocks import SourceBlock


def extract_document_blocks(content: bytes, filename: str, mime_type: str = "") -> ExtractionResult:
    """
    Unified document extraction facade converting raw PDF or DOCX file bytes
    into a deterministic list of SourceBlock objects.
    """
    if not content:
        raise ApiError(400, "empty_document", "The selected document is empty.")

    lower_filename = filename.lower()
    is_pdf = mime_type == "application/pdf" or lower_filename.endswith(".pdf")
    is_docx = (
        mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        or lower_filename.endswith(".docx")
    )

    if is_pdf:
        blocks, is_scanned = parse_pdf_to_blocks(content)
        if is_scanned:
            return process_scanned_pdf(content)
        return ExtractionResult(
            status="SUCCESS",
            blocks=blocks,
            is_scanned=False,
            message="PDF parsed successfully.",
        )
    elif is_docx:
        blocks = parse_docx_to_blocks(content)
        return ExtractionResult(
            status="SUCCESS",
            blocks=blocks,
            is_scanned=False,
            message="DOCX parsed successfully.",
        )
    else:
        raise ApiError(415, "unsupported_document_type", "Only PDF and DOCX documents are supported.")
