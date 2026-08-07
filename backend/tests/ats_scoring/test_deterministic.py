from app.features.ats.ats_score import (
    ALGORITHM_VERSION,
    _candidate_terms,
    ats_source_fingerprint,
    evidence_match_status,
    score_resume,
)


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
            assert item.resume_evidence
            assert item.resume_evidence in "Skills: JS, K8s, Postgres"
def test_no_evidence_without_source_quote() -> None:
    result = score_resume("Summary\nBackend engineer", "Required: Kubernetes, Docker")
    assert result.overall_score == 0
    assert all(not item.matched and item.resume_evidence is None for item in result.evidence)
def test_ordinary_jd_prose_does_not_become_requirements() -> None:
    result = score_resume(
        "Skills: Python, React",
        "Required: Python, React. We are looking for a collaborative person who can deliver value.",
    )
    requirements = {item.requirement for item in result.evidence}
    assert {"python", "react"} <= requirements
    assert "collaborative person who" not in requirements
    assert "deliver value" not in requirements


def test_best_match_prefers_skills_section_over_first_hit() -> None:
    """Experience mention first must not lock strength at partial when Skills has exact hit."""
    resume = """Experience
Built services with Python

Skills
Python, Docker
"""
    result = score_resume(resume, "Requirements:\n- Python\n- Docker\n")
    by_term = {item.requirement: item for item in result.evidence}
    assert by_term["python"].match_strength == "strong"
    assert by_term["python"].resume_section and "skill" in by_term["python"].resume_section.casefold()
    assert by_term["docker"].match_strength == "strong"
    assert result.overall_score == 100.0


def test_multiline_non_bullet_jd_list_extracts_known_terms() -> None:
    terms = {term for term, _ in _candidate_terms("Required skills:\nPython\nDocker\nAWS\n")}
    assert {"python", "docker", "aws"} <= terms


def test_structured_sections_union_plain_text() -> None:
    """Incomplete structured extraction must not hide skills present only in plain_text."""
    resume_pt = "Skills\nPython, AWS, Kubernetes"
    structured = {"skills": ["Java only"]}
    result = score_resume(
        resume_pt,
        "Requirements:\n- Python\n- AWS\n- Kubernetes\n",
        structured_sections=structured,
    )
    found = set(result.matched_terms) | set(result.partial_terms or [])
    assert {"python", "aws", "kubernetes"} <= found


def test_bonus_prose_does_not_reclassify_following_required_bullets() -> None:
    terms = _candidate_terms(
        "Requirements:\n- Python\nBonus culture fit notes\n- Kubernetes\n- Docker\n"
    )
    by_term = {term: kind for term, kind in terms}
    assert by_term.get("python") == "required"
    assert by_term.get("kubernetes") == "required"
    assert by_term.get("docker") == "required"


def test_go_does_not_match_go_to_market() -> None:
    result = score_resume("Led go-to-market strategy for SaaS product", "Requirements:\n- Go\n")
    assert result.matched_terms == []
    assert (result.partial_terms or []) == []
    assert "go" in result.missing_terms


def test_source_fingerprint_changes_when_resume_text_changes() -> None:
    a = ats_source_fingerprint("Skills: Python", {"sections": {}}, "Required: Python")
    b = ats_source_fingerprint("Skills: Python, Docker", {"sections": {}}, "Required: Python")
    assert a != b
    assert a == ats_source_fingerprint("Skills: Python", {"sections": {}}, "Required: Python")


def test_duplicate_required_and_preferred_term_is_deduped_as_required() -> None:
    """Same skill under Required and Preferred must count once, upgraded to required."""
    terms = _candidate_terms(
        "Required: Docker, Python\nPreferred: Docker, Kubernetes"
    )
    by_term = {term: kind for term, kind in terms}
    assert by_term.get("docker") == "required"
    assert sum(1 for term, _ in terms if term == "docker") == 1
    assert by_term.get("python") == "required"
    assert by_term.get("kubernetes") == "preferred"

    result = score_resume(
        "Skills: Docker, Python",
        "Required: Docker, Python\nPreferred: Docker, Kubernetes",
    )
    docker_hits = [item for item in result.evidence if item.requirement == "docker"]
    assert len(docker_hits) == 1
    assert docker_hits[0].requirement_type == "required"


def test_slash_compound_terms_are_not_split_into_fragments() -> None:
    """CI/CD-style compounds stay one requirement; long slash lists still split."""
    terms = {term for term, _ in _candidate_terms("Required skills: CI/CD, Python")}
    assert "ci/cd" in terms
    assert "ci" not in terms
    assert "cd" not in terms

    # Shape-based: short/short compounds (no hard-coded list) stay joined.
    tcp_terms = {term for term, _ in _candidate_terms("Required: TCP/IP, PL/SQL")}
    assert "tcp/ip" in tcp_terms or any("/" in t and "tcp" in t for t in tcp_terms)
    assert "tcp" not in tcp_terms or "tcp/ip" in tcp_terms
    assert "ip" not in {t for t in tcp_terms if t == "ip"}

    # Longer words still form a slash-delimited skill list.
    list_terms = {term for term, _ in _candidate_terms("Required: Python/Java/Go")}
    assert "python" in list_terms
    assert "java" in list_terms
    assert "go" in list_terms
    assert "python/java/go" not in list_terms


def test_dotnet_token_keeps_leading_dot_and_aliases() -> None:
    """`.NET` must extract as `.net`, not bare `net`, and match resume aliases."""
    from app.features.ats.ats_score import _tokens

    assert ".net" in _tokens("Experience with .NET Core")
    assert "net" not in _tokens(".NET")

    terms = {term for term, _ in _candidate_terms("Required: .NET, C#")}
    assert ".net" in terms
    assert "net" not in terms
    assert "c#" in terms

    # Email TLDs must not become a .NET requirement.
    email_terms = {term for term, _ in _candidate_terms("Required: contact hire@example.net")}
    assert ".net" not in email_terms

    result = score_resume("Skills: Dotnet, C#", "Required: .NET, C#")
    found = set(result.matched_terms) | set(result.partial_terms or [])
    assert ".net" in found
    assert "c#" in found
