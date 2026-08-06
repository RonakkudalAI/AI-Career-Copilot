from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.core.errors import ApiError
from app.features.document_parsing.extractors.docx import parse_docx_to_blocks
from app.features.document_parsing.extractors.pdf import parse_pdf_to_blocks
from app.features.document_parsing.source_blocks import SourceBlock

ExtractionStatus = Literal["SUCCESS", "FAILED"]
class ExtractionResult(BaseModel):
    status: ExtractionStatus
    blocks: list[SourceBlock] = Field(default_factory=list)
    message: str = ""
def extract_document_blocks(content: bytes, filename: str, mime_type: str = "") -> ExtractionResult:
    if not content:
        raise ApiError(400, "empty_document", "The selected document is empty.")
    lower_filename = filename.lower()
    is_pdf = mime_type == "application/pdf" or lower_filename.endswith(".pdf")
    is_docx = (
        mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        or lower_filename.endswith(".docx")
    )
    if is_pdf:
        blocks = parse_pdf_to_blocks(content)
        return ExtractionResult(
            status="SUCCESS",
            blocks=blocks,
            message="PDF parsed successfully.",
        )
    if is_docx:
        blocks = parse_docx_to_blocks(content)
        return ExtractionResult(
            status="SUCCESS",
            blocks=blocks,
            message="DOCX parsed successfully.",
        )
    raise ApiError(415, "unsupported_document_type", "Only PDF and DOCX documents are supported.")
