import pytest

from app.ats import score_resume


def test_score_is_deterministic_keyword_coverage_with_evidence():
    result = score_resume(
        "Backend Engineer\nPython, FastAPI, PostgreSQL\nBuilt accessibility APIs.",
        "We need Python, FastAPI, React, PostgreSQL and accessibility.",
    )

    assert result.overall_score == 80.0
    assert result.matched_terms == ["python", "fastapi", "postgresql", "accessibility"]
    assert result.missing_terms == ["react"]
    assert result.breakdown["method"] == "keyword_coverage"
    assert next(item for item in result.evidence if item.requirement == "python").resume_evidence
    assert not next(item for item in result.evidence if item.requirement == "react").matched


def test_score_does_not_invent_terms_or_treat_substrings_as_matches():
    result = score_resume("Java developer", "JavaScript and SQL")

    assert result.overall_score == 0
    assert result.matched_terms == []
    assert result.missing_terms == ["javascript", "sql"]


def test_score_rejects_an_unscorable_job_description():
    with pytest.raises(ValueError, match="enough scorable terms"):
        score_resume("Python", "and the with")
