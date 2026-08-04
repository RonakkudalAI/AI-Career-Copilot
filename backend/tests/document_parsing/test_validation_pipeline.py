from app.features.document_parsing.confidence import calculate_confidence
from app.features.document_parsing.contamination import find_contamination
from app.features.document_parsing.grounding import evidence_block_ids, ground_sections
from app.features.document_parsing.reconciliation import reconcile_sections
from app.features.document_parsing.source_blocks import SourceBlock


def _blocks() -> list[SourceBlock]:
    return [
        SourceBlock.create(page=1, order=1, text="SKILLS", block_type="heading", heading_context="SKILLS"),
        SourceBlock.create(page=1, order=2, text="Python, FastAPI", heading_context="SKILLS"),
        SourceBlock.create(page=1, order=3, text="Built APIs at Acme", heading_context="WORK EXPERIENCE"),
    ]


def test_grounding_keeps_source_values_and_drops_unverifiable_values():
    blocks = _blocks()
    assert evidence_block_ids("Python", blocks) == ["page-1-block-02"]
    sections, evidence, warnings = ground_sections(
        {"skills": ["Python", "Invented Framework"]}, blocks
    )
    assert sections == {"skills": ["Python"]}
    assert evidence["skills"] == [["page-1-block-02"]]
    assert len(warnings) == 1


def test_contamination_reports_clear_heading_mismatch():
    blocks = _blocks()
    issues = find_contamination({"skills": [["page-1-block-03"]]}, blocks)
    assert issues == [{"section": "skills", "source_section": "experience"}]


def test_reconciliation_is_deterministic_and_counts_duplicates():
    result, duplicates = reconcile_sections(
        {"skills": ["Python", " python "], "experience": ["Built APIs", "Python"]}
    )
    assert result == {"skills": ["Python"], "experience": ["Built APIs"]}
    assert duplicates == 2


def test_confidence_is_measurable_and_ocr_adjusted():
    result = calculate_confidence(
        total_values=4,
        grounded_values=4,
        warnings=0,
        contamination_issues=0,
        is_scanned=True,
    )
    assert result["score"] == 0.85
    assert result["level"] == "MEDIUM"
