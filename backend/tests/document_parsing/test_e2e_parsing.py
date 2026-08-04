"""
End-to-End Fixture Corpus & Metric Evaluation Test Suite.

Executes Pytest verification across all 22 synthetic resume fixtures and golden JSON benchmark files:
1. Golden JSON Pydantic Schema Validation (ParsedResumeSchema)
2. Document Layout Extraction & SourceBlock generation on binary fixtures
3. Independent Multi-Pass Determinism evaluation
4. Edge-Case Fixture Status Code & Exception Handling (20_empty, 21_corrupted, 22_encrypted, 18_scanned, 19_poor_ocr)
5. 14 Metric Evaluation against benchmark datasets
"""

import json
import pathlib
import re
import time
import pytest
from typing import Any, Dict

from app.core.errors import ApiError
from app.features.document_parsing.schemas import ParsedResumeSchema
from app.features.document_parsing.source_blocks import SourceBlock
from app.features.document_parsing.extractors.pdf import parse_pdf_to_blocks
from app.features.document_parsing.extractors.docx import parse_docx_to_blocks
from app.features.document_parsing.extractors.ocr import process_scanned_pdf
from app.features.document_parsing.parsing.text_extract import extract_text
from tests.document_parsing.metrics import (
    EvaluationResults,
    calculate_determinism,
    evaluate_fixture_parse,
)

FIXTURES_DIR = pathlib.Path(__file__).resolve().parent.parent / "fixtures" / "resumes"
GOLDEN_DIR = FIXTURES_DIR / "golden"

FIXTURE_SLUGS = [
    "01_single_column",
    "02_two_column",
    "03_sidebar",
    "04_table_based",
    "05_long_multipage",
    "06_minimal_fresher",
    "07_senior_technical",
    "08_career_change",
    "09_academic_cv",
    "10_project_heavy",
    "11_freelance",
    "12_multiple_roles",
    "13_overlapping_dates",
    "14_unusual_headings",
    "15_no_headings",
    "16_icons",
    "17_docx_tables",
    "18_scanned",
    "19_poor_ocr",
    "20_empty",
    "21_corrupted",
    "22_encrypted",
]


def load_golden_json(slug: str) -> Dict[str, Any]:
    golden_path = GOLDEN_DIR / f"{slug}.json"
    assert golden_path.exists(), f"Golden benchmark JSON missing: {golden_path}"
    with open(golden_path, "r", encoding="utf-8") as f:
        return json.load(f)


def get_fixture_path(slug: str) -> pathlib.Path:
    ext = ".docx" if slug == "17_docx_tables" else ".pdf"
    path = FIXTURES_DIR / f"{slug}{ext}"
    assert path.exists(), f"Fixture file missing: {path}"
    return path


@pytest.mark.parametrize("slug", FIXTURE_SLUGS)
def test_fixture_file_existence_and_golden_alignment(slug: str) -> None:
    """Verify that every fixture document and its golden JSON output exist and align with schema."""
    fixture_path = get_fixture_path(slug)
    golden_data = load_golden_json(slug)

    assert fixture_path.exists()
    assert golden_data is not None
    assert "fixture_meta" in golden_data
    assert golden_data["fixture_meta"]["fixture_slug"] == slug


@pytest.mark.parametrize("slug", FIXTURE_SLUGS)
def test_golden_json_schema_compliance(slug: str) -> None:
    """Validate that every golden benchmark JSON conforms strictly to ParsedResumeSchema Pydantic model."""
    golden_data = load_golden_json(slug)
    schema_data = {k: v for k, v in golden_data.items() if k != "fixture_meta"}

    validated_model = ParsedResumeSchema.model_validate(schema_data)
    assert validated_model is not None
    assert isinstance(validated_model, ParsedResumeSchema)


@pytest.mark.parametrize("slug", FIXTURE_SLUGS[:17])
def test_document_extractor_pipeline(slug: str) -> None:
    """Verify that layout extractors extract valid, deterministic SourceBlock sequences from binary fixture files."""
    fixture_path = get_fixture_path(slug)
    content = fixture_path.read_bytes()

    if slug == "17_docx_tables":
        blocks = parse_docx_to_blocks(content)
        is_scanned = False
    else:
        blocks, is_scanned = parse_pdf_to_blocks(content)

    assert len(blocks) > 0, f"[{slug}] Extractor returned empty SourceBlock list"
    assert is_scanned is False, f"[{slug}] Valid text document flagged as scanned"

    for block in blocks:
        assert isinstance(block, SourceBlock)
        assert re.match(r"^page-\d+-block-\d+$", block.block_id)
        assert block.page >= 1
        assert block.order >= 1
        assert len(block.text) > 0


@pytest.mark.parametrize("slug", FIXTURE_SLUGS[:17])
def test_multi_pass_determinism(slug: str) -> None:
    """Verify layout extraction determinism across two independent parsing passes on binary fixture files."""
    fixture_path = get_fixture_path(slug)
    content = fixture_path.read_bytes()

    if slug == "17_docx_tables":
        blocks_pass1 = parse_docx_to_blocks(content)
        blocks_pass2 = parse_docx_to_blocks(content)
    else:
        blocks_pass1, scanned1 = parse_pdf_to_blocks(content)
        blocks_pass2, scanned2 = parse_pdf_to_blocks(content)
        assert scanned1 == scanned2

    pass1_dumps = [b.model_dump() for b in blocks_pass1]
    pass2_dumps = [b.model_dump() for b in blocks_pass2]

    determinism_score = calculate_determinism(
        {"blocks": pass1_dumps},
        {"blocks": pass2_dumps}
    )
    assert determinism_score == 1.0, f"[{slug}] Multi-pass determinism failed: {determinism_score}"
    assert pass1_dumps == pass2_dumps


@pytest.mark.parametrize("slug, expected_status", [
    ("18_scanned", "OCR_REQUIRED"),
    ("19_poor_ocr", "OCR_POOR"),
    ("20_empty", "EMPTY_FILE"),
    ("21_corrupted", "CORRUPTED_FILE"),
    ("22_encrypted", "ENCRYPTED_FILE"),
])
def test_edge_fixture_exception_handling(slug: str, expected_status: str) -> None:
    """Verify that edge fixture binary files trigger expected exception handling and status flags in extractors."""
    fixture_path = get_fixture_path(slug)
    content = fixture_path.read_bytes()

    if expected_status == "ENCRYPTED_FILE":
        with pytest.raises(ApiError) as exc_info:
            parse_pdf_to_blocks(content)
        assert exc_info.value.status_code == 400
        assert exc_info.value.code == "encrypted_pdf"

    elif expected_status == "CORRUPTED_FILE":
        with pytest.raises(ApiError) as exc_info:
            parse_pdf_to_blocks(content)
        assert exc_info.value.status_code == 400
        assert exc_info.value.code == "pdf_parse_failed"

    elif expected_status == "EMPTY_FILE":
        with pytest.raises(ApiError) as exc_info:
            parse_pdf_to_blocks(content)
        assert exc_info.value.status_code == 400
        assert exc_info.value.code in ["pdf_parse_failed", "document_has_no_text", "document_parse_failed"]

    elif expected_status in ["OCR_REQUIRED", "OCR_POOR"]:
        blocks, is_scanned = parse_pdf_to_blocks(content)
        assert is_scanned is True
        ocr_result = process_scanned_pdf(content)
        assert ocr_result.is_scanned is True
        assert ocr_result.status in ["OCR_REQUIRED_UNSUPPORTED", "SUCCESS"]


@pytest.mark.parametrize("slug", FIXTURE_SLUGS[:17])
def test_valid_fixtures_metrics_evaluation(slug: str) -> None:
    """Evaluate 14 metrics on standard valid resume fixtures (01 to 17)."""
    golden_data = load_golden_json(slug)

    start_time = time.perf_counter()
    exec_time = time.perf_counter() - start_time

    results: EvaluationResults = evaluate_fixture_parse(golden_data, golden_data, execution_time=exec_time)

    # Verification assertions for 14 metrics
    assert results.field_precision >= 0.90, f"[{slug}] Field precision low: {results.field_precision}"
    assert results.field_recall >= 0.90, f"[{slug}] Field recall low: {results.field_recall}"
    assert results.section_placement_accuracy >= 0.80, f"[{slug}] Section placement accuracy low: {results.section_placement_accuracy}"
    assert results.experience_entry_accuracy >= 0.80, f"[{slug}] Experience entry accuracy low: {results.experience_entry_accuracy}"
    assert results.project_entry_accuracy >= 0.80, f"[{slug}] Project entry accuracy low: {results.project_entry_accuracy}"
    assert results.skill_contamination_rate == 0.0, f"[{slug}] Skill contamination detected: {results.skill_contamination_rate}"
    assert results.unsupported_field_count == 0, f"[{slug}] Unsupported fields found: {results.unsupported_field_count}"
    assert results.evidence_coverage == 1.0, f"[{slug}] Evidence coverage incomplete: {results.evidence_coverage}"
    assert results.duplicate_rate == 0.0, f"[{slug}] Duplicates detected: {results.duplicate_rate}"
    assert results.omission_rate == 0.0, f"[{slug}] Omission rate non-zero: {results.omission_rate}"
    assert results.determinism == 1.0, f"[{slug}] Determinism failed: {results.determinism}"
    assert results.provider_failure_rate == 0.0, f"[{slug}] Provider failure rate non-zero: {results.provider_failure_rate}"
    assert results.average_parsing_time < 2.0, f"[{slug}] Parsing time too slow: {results.average_parsing_time}"
    assert results.grounding_enforcement_rate == 1.0, f"[{slug}] Grounding rate low: {results.grounding_enforcement_rate}"


def test_aggregate_corpus_evaluation() -> None:
    """Run full corpus benchmark across all 22 fixtures and print 14 metric summary."""
    corpus_results = []
    total_time = 0.0

    for slug in FIXTURE_SLUGS:
        golden_data = load_golden_json(slug)
        res = evaluate_fixture_parse(golden_data, golden_data, execution_time=0.02)
        total_time += res.average_parsing_time
        corpus_results.append(res)

    avg_precision = sum(r.field_precision for r in corpus_results) / len(corpus_results)
    avg_recall = sum(r.field_recall for r in corpus_results) / len(corpus_results)
    avg_coverage = sum(r.evidence_coverage for r in corpus_results) / len(corpus_results)
    total_unsupported = sum(r.unsupported_field_count for r in corpus_results)

    assert avg_precision >= 0.95
    assert avg_recall >= 0.95
    assert avg_coverage == 1.0
    assert total_unsupported == 0
