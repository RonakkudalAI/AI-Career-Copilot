import asyncio
from types import SimpleNamespace

import pytest

from app.core.errors import ApiError
from app.features.interview.preparation import generate_interview_preparation
from app.features.interview.question_bank import normalize_skill, questions_for


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, table, data):
        self.table = table
        self.data = data
        self.filters = []

    def select(self, *_args):
        return self

    def eq(self, key, value):
        self.filters.append((key, str(value)))
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args):
        return self

    def execute(self):
        rows = [dict(row) for row in self.data.get(self.table, [])]
        for key, value in self.filters:
            rows = [row for row in rows if str(row.get(key)) == value]
        return _Result(rows)


class _Client:
    def __init__(self, data):
        self.data = data

    def table(self, table):
        return _Query(table, self.data)


def _client(resume_status="confirmed", job_status="confirmed"):
    return _Client(
        {
            "resume_versions": [{
                "id": "resume-version", "user_id": "candidate", "extraction_status": resume_status,
                "plain_text": "Python FastAPI React", "structured_content": {"sections": {"skills": "Python, FastAPI, React"}},
            }],
            "job_descriptions": [{
                "id": "job-description", "user_id": "candidate", "extraction_status": job_status,
                "role_title": "Backend Engineer", "raw_text": "Python FastAPI Docker SQL", "structured_content": {},
            }],
            "candidate_skills": [{"user_id": "candidate", "name": "Python", "normalized_name": "python"}],
            "candidate_projects": [{"user_id": "candidate", "title": "Career Copilot", "description": "A FastAPI project", "display_order": 0}],
            "ats_analyses": [{"id": "analysis", "user_id": "candidate", "resume_version_id": "resume-version", "job_description_id": "job-description", "status": "completed", "overall_score": 72}],
            "ats_evidence": [
                {"analysis_id": "analysis", "user_id": "candidate", "requirement_text": "Python", "match_status": "strong_match"},
                {"analysis_id": "analysis", "user_id": "candidate", "requirement_text": "Docker", "match_status": "not_found"},
            ],
        }
    )


def test_question_bank_normalizes_next_js():
    assert normalize_skill("Next.js") == "next js"
    assert questions_for("Next.js")


def test_preparation_uses_owned_ats_evidence_without_ai():
    result = asyncio.run(
        generate_interview_preparation(
            _client(),
            SimpleNamespace(groq_configured=False),
            SimpleNamespace(id="candidate"),
            resume_version_id="resume-version",
            job_description_id="job-description",
        )
    )
    assert result["interview_readiness"]["matched_skills"] == ["Python"]
    assert result["interview_readiness"]["missing_skills"] == ["Docker"]
    assert result["interview_readiness"]["source_analysis_id"] == "analysis"
    assert result["project_questions"][0]["project_name"] == "Career Copilot"
    assert result["missing_skill_questions"][0]["source"] == "question_bank"


def test_preparation_requires_confirmed_sources():
    with pytest.raises(ApiError) as error:
        asyncio.run(
            generate_interview_preparation(
                _client(resume_status="review_required"),
                SimpleNamespace(groq_configured=False),
                SimpleNamespace(id="candidate"),
                resume_version_id="resume-version",
                job_description_id="job-description",
            )
        )
    assert error.value.code == "confirmed_sources_required"
