from app.features.ats.ats_score import ALGORITHM_VERSION, evidence_match_status, score_resume


def test_match_strength_maps_to_persisted_evidence_status() -> None:
    assert evidence_match_status("strong") == "strong_match"
    assert evidence_match_status("partial") == "partial_match"
    assert evidence_match_status("missing") == "not_found"
    assert evidence_match_status("unexpected") == "unverified"


def test_phrase_alias_and_section_aware_matching() -> None:
    resume = """
    Skills: JavaScript, React Native, machine learning
    Experience
    Built REST APIs with Node.js
    """
    jd = "Required skills: JavaScript, React Native, machine learning, REST APIs. Preferred: Docker and Kubernetes."

    result = score_resume(resume, jd)

    assert result.breakdown["algorithm_version"] == ALGORITHM_VERSION
    assert "react native" in result.matched_terms or "react native" in (result.partial_terms or [])
    assert "machine learning" in result.matched_terms or "machine learning" in (result.partial_terms or [])
    assert "rest api" in result.matched_terms or "rest api" in (result.partial_terms or [])
    assert result.required_score > result.preferred_score
    # Evidence always quotes exact resume lines when matched
    for item in result.evidence:
        if item.matched:
            assert item.resume_evidence
            assert item.resume_evidence in resume
        else:
            assert item.resume_evidence is None
    assert {item.requirement for item in result.evidence if not item.matched} >= {"docker", "kubernetes"}


def test_alias_matching_is_auditable() -> None:
    result = score_resume("Skills: JS, K8s, Postgres", "Required: JavaScript, Kubernetes, PostgreSQL")

    assert set(result.matched_terms) | set(result.partial_terms or []) >= {
        "javascript",
        "kubernetes",
        "postgresql",
    }
    for item in result.evidence:
        if item.matched:
            assert item.matched_alias
            assert item.resume_evidence  # exact source quote
            assert item.resume_evidence in "Skills: JS, K8s, Postgres"


def test_no_evidence_without_source_quote() -> None:
    result = score_resume("Summary\nBackend engineer", "Required: Kubernetes, Docker")
    assert result.overall_score == 0
    assert all(not item.matched and item.resume_evidence is None for item in result.evidence)
