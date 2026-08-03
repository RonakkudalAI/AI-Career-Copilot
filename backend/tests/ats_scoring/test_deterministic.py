from app.features.ats.deterministic import ALGORITHM_VERSION, evidence_match_status, score_resume


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
    assert "react native" in result.matched_terms
    assert "machine learning" in result.matched_terms
    assert "rest api" in result.partial_terms
    assert result.required_score > result.preferred_score
    assert {item.resume_section for item in result.evidence if item.matched} >= {"skills", "experience"}
    assert {item.requirement for item in result.evidence if not item.matched} == {"docker", "kubernetes"}


def test_alias_matching_is_auditable() -> None:
    result = score_resume("Skills: JS, K8s, Postgres", "Required: JavaScript, Kubernetes, PostgreSQL")

    assert set(result.matched_terms) >= {"javascript", "kubernetes", "postgresql"}
    assert all(item.matched_alias for item in result.evidence if item.matched)
