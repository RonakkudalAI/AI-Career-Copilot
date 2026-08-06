from pathlib import Path

import pytest

from app.core.errors import ApiError
from app.features.document_parsing.parsing import text_extract

FIXTURES = Path(__file__).parent.parent / "fixtures" / "resumes"


def test_text_based_pdf_extracts_quickly():
    content = (FIXTURES / "01_single_column.pdf").read_bytes()
    extracted = text_extract.extract_text(content, text_extract.PDF_MIME)
    assert len(extracted) >= text_extract.MIN_PDF_TEXT_CHARS


def test_encrypted_pdf_fails_closed():
    content = (FIXTURES / "22_encrypted.pdf").read_bytes()
    with pytest.raises(ApiError, match="Password-protected"):
        text_extract.extract_text(content, text_extract.PDF_MIME)


def test_empty_document_rejected():
    with pytest.raises(ApiError) as exc_info:
        text_extract.extract_text(b"", text_extract.PDF_MIME)
    assert exc_info.value.code == "empty_document"


def test_unsupported_mime_rejected():
    with pytest.raises(ApiError) as exc_info:
        text_extract.extract_text(b"%PDF-1.4", "text/plain")
    assert exc_info.value.code == "unsupported_document_type"
