import io

from docx import Document

from app.resume_evidence import build_blocks, build_fact_inventory, evidence_bundle, source_hash
from app.resume_exports import render_docx, render_pdf
from app.resume_improvements import _plain_text, _replace_block
from app.resume_validation import is_source_stale, validate_suggestion
from app.schemas import ProviderSuggestion

STRUCTURED = {
    "schema_version": "resume-extraction-v1",
    "sections": {
        "summary": ["Backend engineer building reliable APIs."],
        "skills": ["Python, FastAPI, PostgreSQL"],
        "experience": ["Built internal APIs with FastAPI for 20 users in 2025."],
    },
    "unclassified_blocks": ["Candidate Name", "candidate@example.test"],
}


def suggestion(**changes) -> ProviderSuggestion:
    values = {
        "section_key": "experience",
        "source_block_id": "experience-1",
        "source_text": STRUCTURED["sections"]["experience"][0],
        "proposed_text": "Developed internal APIs with FastAPI for 20 users in 2025.",
        "reason": "Uses clearer action language while preserving verified facts.",
        "suggestion_type": "clarity",
        "evidence_references": ["experience-1", "skills-1"],
    }
    values.update(changes)
    return ProviderSuggestion.model_validate(values)


def test_evidence_inventory_has_stable_blocks_and_facts():
    blocks = build_blocks(STRUCTURED)
    assert [block.block_id for block in blocks] == ["summary-1", "skills-1", "experience-1"]
    facts = build_fact_inventory(blocks)
    assert any(fact.normalized_value == "fastapi" for fact in facts)
    assert any(fact.normalized_value == "20" for fact in facts)


def test_evidence_bundle_limits_selected_sections_but_keeps_fact_boundary():
    blocks, facts, payload = evidence_bundle(STRUCTURED, ["experience"])
    assert len(blocks) == 3
    assert len(payload["selected_blocks"]) == 1
    assert len(payload["verified_facts"]) == len(facts)


def test_source_hash_normalizes_whitespace_and_detects_stale_text():
    expected = source_hash("Built  APIs")
    assert expected == source_hash("Built APIs")
    assert not is_source_stale(expected, "Built APIs")
    assert is_source_stale(expected, "Changed APIs")


def test_valid_grounded_suggestion_passes():
    blocks = {block.block_id: block for block in build_blocks(STRUCTURED)}
    result = validate_suggestion(suggestion(), blocks, {"experience"})
    assert result.status == "passed"
    assert result.issues == []


def test_unsupported_number_and_date_are_blocked():
    blocks = {block.block_id: block for block in build_blocks(STRUCTURED)}
    result = validate_suggestion(
        suggestion(proposed_text="Developed internal APIs with FastAPI for 500 users in 2026."),
        blocks,
        {"experience"},
    )
    assert result.status == "blocked"
    assert "unsupported_number_or_date" in result.issues


def test_unknown_skill_or_entity_is_blocked():
    blocks = {block.block_id: block for block in build_blocks(STRUCTURED)}
    result = validate_suggestion(
        suggestion(proposed_text="Developed internal APIs with Django and FastAPI for 20 users in 2025."),
        blocks,
        {"experience"},
    )
    assert result.status == "blocked"
    assert "unsupported_entity_or_skill" in result.issues


def test_contact_and_unknown_evidence_are_blocked():
    blocks = {block.block_id: block for block in build_blocks(STRUCTURED)}
    result = validate_suggestion(
        suggestion(
            proposed_text="Developed APIs; contact new@example.test.", evidence_references=["missing"]
        ),
        blocks,
        {"experience"},
    )
    assert result.status == "blocked"
    assert "contact_change_blocked" in result.issues
    assert "unsupported_evidence_reference" in result.issues


def test_source_mismatch_and_excessive_rewrite_are_blocked():
    blocks = {block.block_id: block for block in build_blocks(STRUCTURED)}
    result = validate_suggestion(
        suggestion(source_text="Different source", proposed_text="Entirely unrelated ownership claim. " * 40),
        blocks,
        {"experience"},
    )
    assert result.status == "blocked"
    assert "source_text_mismatch" in result.issues
    assert "excessive_rewrite" in result.issues


def test_deterministic_block_application_preserves_original_value():
    block = {item.block_id: item for item in build_blocks(STRUCTURED)}["experience-1"]
    edited = {**STRUCTURED, "sections": {key: list(value) for key, value in STRUCTURED["sections"].items()}}
    _replace_block(edited, block, "Candidate-confirmed replacement")
    assert edited["sections"]["experience"][0] == "Candidate-confirmed replacement"
    assert STRUCTURED["sections"]["experience"][0].startswith("Built internal")


def test_export_renderers_use_canonical_structured_content():
    docx_bytes = render_docx(STRUCTURED)
    pdf_bytes = render_pdf(STRUCTURED)
    document = Document(io.BytesIO(docx_bytes))
    assert any("Backend engineer" in paragraph.text for paragraph in document.paragraphs)
    assert pdf_bytes.startswith(b"%PDF-")
    assert "FastAPI" in _plain_text(STRUCTURED)
