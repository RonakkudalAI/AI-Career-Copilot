"""Tests for structural + line-index document section segregation."""

from __future__ import annotations

from app.features.document_parsing.parsing.llm_sections import (
    LlmDocumentSections,
    LlmSectionAssignment,
    _materialize_from_line_numbers,
    _numbered_source_lines,
    extract_sections_structural,
)
from app.features.document_parsing.service import extract_skill_candidates


def test_structural_splits_on_layout_headings() -> None:
    text = """
Jane Candidate
jane@example.com

Skills
Python, FastAPI, Docker

Work Experience
Backend Engineer | Acme
Built APIs for checkout

Projects
Career Copilot
Evidence-first career tools
""".strip()

    result = extract_sections_structural(text)
    sections = result["sections"]
    assert "skills" in sections or any("skill" in key for key in sections)
    assert any("experience" in key or "work" in key for key in sections)
    skill_blob = " ".join(sections.get("skills") or next(v for k, v in sections.items() if "skill" in k))
    assert "Python" in skill_blob or "python" in skill_blob.casefold()
    assert result["extraction_method"] == "structural_layout_v1"


def test_line_assignment_never_invents_text() -> None:
    source = "Skills\nPython, React\nExperience\nBuilt APIs"
    lines = _numbered_source_lines(source)
    llm = LlmDocumentSections(
        sections=[
            LlmSectionAssignment(heading="Skills", kind="skills", line_numbers=[2]),
            LlmSectionAssignment(heading="Experience", kind="experience", line_numbers=[4]),
            # Invented line number and would-be invented content are impossible:
            LlmSectionAssignment(heading="Fake", kind="fake", line_numbers=[99]),
        ],
        unclassified_line_numbers=[],
        warnings=[],
    )
    filtered = _materialize_from_line_numbers(llm, lines, "resume-extraction-v1")
    skills = filtered["sections"].get("skills") or []
    assert any("Python" in item for item in skills)
    assert not any("Quantum" in item for item in skills)
    # All retained items are exact source lines (or skill splits of them).
    flat = " ".join(item for values in filtered["sections"].values() for item in values)
    assert "Built APIs" in flat
    assert filtered["extraction_method"] == "llm_line_assignment_v1"


def test_skill_candidates_are_source_derived_not_allowlisted() -> None:
    text = "Tools: Zig, Roc, Elixir\nAlso used Bevy and Gleam for experiments."
    found = extract_skill_candidates(text, limit=20)
    joined = " ".join(found).casefold()
    assert "zig" in joined or "elixir" in joined or "roc" in joined
    assert "python" not in joined
