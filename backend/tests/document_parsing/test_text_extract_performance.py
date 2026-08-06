from pathlib import Path

import pytest

from app.core.errors import ApiError
from app.features.document_parsing.parsing import text_extract

FIXTURES = Path(__file__).parent.parent / "fixtures" / "resumes"


def test_docling_converter_is_reused_within_process(monkeypatch):
    created = 0

    class FakeDocument:
        def export_to_markdown(self):
            return "Name\nExperience\nBuilt reliable systems."

    class FakeConverter:
        def convert(self, path):
            assert Path(path).is_file()
            return type("Result", (), {"document": FakeDocument()})()

    def factory():
        nonlocal created
        created += 1
        return FakeConverter()

    text_extract._get_docling_converter.cache_clear()
    monkeypatch.setattr(text_extract, "_require_docling", lambda: factory)
    try:
        text_extract._extract_with_docling(b"first", ".pdf")
        text_extract._extract_with_docling(b"second", ".pdf")
    finally:
        text_extract._get_docling_converter.cache_clear()

    assert created == 1


def test_text_based_pdf_skips_docling(monkeypatch):
    content = (FIXTURES / "01_single_column.pdf").read_bytes()

    def fail_if_called(*args, **kwargs):
        raise AssertionError("Docling should not run for a text-based PDF")

    monkeypatch.setattr(text_extract, "_extract_with_docling", fail_if_called)

    extracted = text_extract.extract_text(content, text_extract.PDF_MIME)

    assert len(extracted) >= 200


def test_encrypted_pdf_does_not_enter_expensive_docling_fallback(monkeypatch):
    content = (FIXTURES / "22_encrypted.pdf").read_bytes()

    monkeypatch.setattr(
        text_extract,
        "_extract_with_docling",
        lambda *args, **kwargs: pytest.fail("encrypted PDFs must fail before Docling"),
    )

    with pytest.raises(ApiError, match="Password-protected"):
        text_extract.extract_text(content, text_extract.PDF_MIME)
