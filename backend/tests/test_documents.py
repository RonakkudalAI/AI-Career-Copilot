from app.documents import infer_job_metadata, infer_resume_title


def test_infer_resume_title_from_filename():
    assert infer_resume_title("Priya_Resume_v2.pdf") == "Priya Resume v2"
    assert infer_resume_title(None) == "Resume"


def test_infer_job_metadata_from_labels():
    text = """
    Job Title: Senior Backend Engineer
    Company: Acme Labs

    We need Python, FastAPI, and SQL experience.
    """
    meta = infer_job_metadata(text)
    assert meta["role_title"] == "Senior Backend Engineer"
    assert meta["company"] == "Acme Labs"
    assert "Senior Backend Engineer" in (meta["title"] or "")
    assert meta["confidence"] == "high"


def test_infer_job_metadata_from_role_hint_line():
    text = """
    Data Analyst
    Location: Pune

    Requirements include SQL, Python, and dashboards for stakeholders.
    """
    meta = infer_job_metadata(text)
    assert meta["role_title"] == "Data Analyst"
    assert meta["title"] == "Data Analyst"


def test_extract_skill_candidates():
    from app.documents import extract_skill_candidates

    skills = extract_skill_candidates("Built APIs with Python, FastAPI, SQL and Docker on AWS.")
    assert "Python" in skills
    assert "SQL" in skills
    assert "Docker" in skills
    assert "AWS" in skills
