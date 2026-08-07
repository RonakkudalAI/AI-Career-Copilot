
from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

import logging

from app.agents.providers.groq_client import GroqClient
from app.core.config import Settings
from app.core.errors import ApiError
from app.features.document_parsing.service import extract_skill_candidates
from app.features.interview.question_bank import has_questions, normalize_skill, questions_for

logger = logging.getLogger(__name__)
_PROMPT_PATH = Path(__file__).resolve().parents[2] / "agents" / "prompts" / "interview_preparation_v1.txt"
_GENERIC_TERMS = {"experience", "required", "preferred", "knowledge", "team", "work", "skills", "years"}
class _GeneratedQuestion(BaseModel):
    model_config = ConfigDict(extra="ignore")
    question: str = Field(min_length=8, max_length=800)
    skill: str | None = Field(default=None, max_length=160)
    difficulty: str = Field(default="medium", max_length=20)
class _GeneratedQuestions(BaseModel):
    model_config = ConfigDict(extra="ignore")
    questions: list[_GeneratedQuestion] = Field(default_factory=list, max_length=12)
class _FullPrepSchema(BaseModel):
    model_config = ConfigDict(extra="ignore")
    technical_questions: list[_GeneratedQuestion] = Field(default_factory=list, max_length=16)
    missing_skill_questions: list[_GeneratedQuestion] = Field(default_factory=list, max_length=16)
    resume_questions: list[_GeneratedQuestion] = Field(default_factory=list, max_length=12)
    coding_questions: list[_GeneratedQuestion] = Field(default_factory=list, max_length=6)
    hr_questions: list[_GeneratedQuestion] = Field(default_factory=list, max_length=6)
def _unique(values: Iterable[object], limit: int = 24) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for raw in values:
        value = str(raw or "").strip()[:160]
        key = normalize_skill(value)
        if value and key and key not in seen and key not in _GENERIC_TERMS:
            seen.add(key)
            result.append(value)
        if len(result) >= limit:
            break
    return result
def _strings(value: object) -> list[str]:
    if isinstance(value, str):
        return [part.strip() for part in value.replace("\n", ",").replace(";", ",").split(",") if part.strip()]
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return []
def _section_values(structured: object, names: tuple[str, ...]) -> list[str]:
    if not isinstance(structured, dict):
        return []
    sources = [structured, structured.get("sections")]
    values: list[str] = []
    for source in sources:
        if not isinstance(source, dict):
            continue
        for key, value in source.items():
            if any(name in str(key).casefold() for name in names):
                values.extend(_strings(value))
    return values
def _candidate_skills(resume: dict[str, Any], profile_skills: list[dict[str, Any]]) -> list[str]:
    explicit = [row.get("name") or row.get("normalized_name") for row in profile_skills]
    structured = _section_values(resume.get("structured_content"), ("skill", "technolog", "tool"))
    plain = extract_skill_candidates(str(resume.get("plain_text") or ""))
    return _unique([*explicit, *structured, *plain])
def _job_terms(job: dict[str, Any]) -> list[str]:
    structured = _section_values(job.get("structured_content"), ("requirement", "qualification", "skill", "technolog", "tool"))
    plain = extract_skill_candidates(str(job.get("raw_text") or ""))
    return _unique([*structured, *plain])
def _question(question: str, skill: str | None, difficulty: str | None, source: str) -> dict[str, Any]:
    return {
        "question": question.strip()[:800],
        "skill": skill[:160] if skill else None,
        "difficulty": difficulty if difficulty in {"easy", "medium", "hard"} else "medium",
        "source": source,
    }
def _bank_questions(skills: list[str], per_skill: int = 1) -> list[dict[str, Any]]:
    return [
        _question(text, skill, difficulty, "question_bank")
        for skill in skills
        for text, difficulty in questions_for(skill, per_skill)
    ]
async def _ai_questions(settings: Settings, missing_skills: list[str], role: str) -> list[dict[str, Any]]:
    unknown = [skill for skill in missing_skills if not has_questions(skill)]
    if not unknown or not settings.groq_configured:
        return []
    try:
        prompt = _PROMPT_PATH.read_text(encoding="utf-8")
        response: _GeneratedQuestions = await GroqClient(settings).generate_structured(
            system_prompt=prompt,
            user_payload={"unknown_skills": unknown, "target_role": role},
            schema_model=_GeneratedQuestions,
            temperature=0.2,
        )
    except Exception:
        return []
    requested = {normalize_skill(skill) for skill in unknown}
    return [
        _question(item.question, item.skill, item.difficulty.casefold(), "ai")
        for item in response.questions
        if normalize_skill(item.skill) in requested
    ][:12]
def _project_questions(projects: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: list[dict[str, Any]] = []
    seen: set[str] = set()
    for project in projects:
        name = str(project.get("title") or project.get("name") or "").strip()[:240]
        if not name or name.casefold() in seen:
            continue
        seen.add(name.casefold())
        description = str(project.get("description") or "").strip()[:260]
        questions = [
            _question(f"Walk through the architecture of {name} and your responsibilities.", None, "medium", "candidate_context"),
            _question(f"What was the most difficult technical decision in {name}, and how did you evaluate it?", None, "medium", "candidate_context"),
            _question(f"What would you improve next in {name}?", None, "medium", "candidate_context"),
        ]
        if description:
            questions.append(_question(f"How does this project detail affect your design choices: {description}", None, "medium", "candidate_context"))
        groups.append({"project_name": name, "questions": questions})
    return groups[:8]
async def _ai_full_preparation(
    settings: Settings,
    *,
    role: str,
    matched: list[str],
    missing: list[str],
    candidate_skills: list[str],
    job_skills: list[str],
    projects: list[dict[str, Any]],
) -> dict[str, Any] | None:
    if not settings.groq_configured:
        return None
    try:
        prompt = (
            "You are an expert interview coach. Generate targeted interview practice questions "
            "based on candidate skills, job requirements, matched skills, missing skills, and candidate projects.\n"
            "Return JSON matching output_schema. Rules:\n"
            "- technical_questions: generate practice questions for candidate's matched skills and core technologies.\n"
            "- missing_skill_questions: generate questions testing concepts in missing/unmatched job requirements.\n"
            "- resume_questions: generate questions connecting candidate background to target role.\n"
            "- coding_questions: generate practical coding/design challenges for the role.\n"
            "- hr_questions: generate behavioral and HR questions tailored to role and experience.\n"
            "- Each question item must have 'question', 'skill' (optional), and 'difficulty' ('easy', 'medium', 'hard')."
        )
        payload = {
            "target_role": role,
            "matched_skills": matched[:12],
            "missing_skills": missing[:12],
            "candidate_skills": candidate_skills[:16],
            "job_skills": job_skills[:16],
            "projects": [
                {"title": p.get("title") or p.get("name"), "description": p.get("description")}
                for p in projects[:6]
            ],
        }
        client = GroqClient(settings)
        res: _FullPrepSchema = await client.generate_structured(
            system_prompt=prompt,
            user_payload=payload,
            schema_model=_FullPrepSchema,
            temperature=0.3,
        )
        return {
            "technical": [_question(item.question, item.skill, item.difficulty.casefold(), "ai") for item in res.technical_questions[:16]],
            "missing": [_question(item.question, item.skill, item.difficulty.casefold(), "ai") for item in res.missing_skill_questions[:16]],
            "resume": [_question(item.question, item.skill, item.difficulty.casefold(), "ai") for item in res.resume_questions[:12]],
            "coding": [_question(item.question, item.skill, item.difficulty.casefold(), "ai") for item in res.coding_questions[:6]],
            "hr": [_question(item.question, item.skill, item.difficulty.casefold(), "ai") for item in res.hr_questions[:6]],
        }
    except Exception as exc:
        logger.warning("ai_full_preparation_failed reason=%s", type(exc).__name__)
        return None


async def generate_interview_preparation(
    client: Any,
    settings: Settings,
    user: Any,
    *,
    resume_version_id: UUID,
    job_description_id: UUID,
) -> dict[str, Any]:
    user_id = str(user.id)
    resume_rows = client.table("resume_versions").select("*").eq("id", str(resume_version_id)).eq("user_id", user_id).limit(1).execute().data or []
    job_rows = client.table("job_descriptions").select("*").eq("id", str(job_description_id)).eq("user_id", user_id).limit(1).execute().data or []
    if not resume_rows or not job_rows:
        raise ApiError(404, "preparation_source_not_found", "The selected preparation source was not found.")
    resume, job = resume_rows[0], job_rows[0]
    if resume.get("extraction_status") != "confirmed" or job.get("extraction_status") != "confirmed":
        raise ApiError(409, "confirmed_sources_required", "Confirm both the resume and job description before preparing for an interview.")
    skills_rows = client.table("candidate_skills").select("name,normalized_name").eq("user_id", user_id).execute().data or []
    project_rows = client.table("candidate_projects").select("title,description").eq("user_id", user_id).order("display_order").execute().data or []
    candidate_skills = _candidate_skills(resume, skills_rows)
    job_skills = _job_terms(job)
    # Avoid order_by(created_at): Firestore drops docs missing that field.
    analyses = (
        client.table("ats_analyses")
        .select("id,overall_score,created_at,completed_at,started_at")
        .eq("user_id", user_id)
        .eq("resume_version_id", str(resume_version_id))
        .eq("job_description_id", str(job_description_id))
        .eq("status", "completed")
        .execute()
        .data
        or []
    )
    from app.database.repository import sort_rows_by_recency

    analyses = sort_rows_by_recency(analyses, desc=True, preferred="completed_at")[:1]
    analysis = analyses[0] if analyses else None
    matched: list[str] = []
    missing: list[str] = []
    if analysis:
        evidence = client.table("ats_evidence").select("requirement_text,match_status").eq("user_id", user_id).eq("analysis_id", str(analysis["id"])).execute().data or []
        matched = _unique(row.get("requirement_text") for row in evidence if row.get("match_status") in {"strong_match", "partial_match"})
        missing = _unique(row.get("requirement_text") for row in evidence if row.get("match_status") == "not_found")
    if not matched and not missing:
        candidate_keys = {normalize_skill(skill) for skill in candidate_skills}
        matched = [skill for skill in job_skills if normalize_skill(skill) in candidate_keys]
        missing = [skill for skill in job_skills if normalize_skill(skill) not in candidate_keys]
    role = str(job.get("role_title") or job.get("title") or "the target role").strip()[:200]

    ai_prep = await _ai_full_preparation(
        settings,
        role=role,
        matched=matched,
        missing=missing,
        candidate_skills=candidate_skills,
        job_skills=job_skills,
        projects=project_rows,
    )

    if ai_prep:
        technical = ai_prep["technical"] or _bank_questions(matched, per_skill=2)[:16]
        missing_questions = ai_prep["missing"] or _bank_questions(missing, per_skill=2)[:16]
        resume_qs = ai_prep["resume"] or _bank_questions(candidate_skills, per_skill=1)[:12]
        coding = ai_prep["coding"]
        hr_questions = ai_prep["hr"]
    else:
        technical = _bank_questions(matched, per_skill=2)[:16]
        missing_questions = _bank_questions(missing, per_skill=2)[:16]
        ai_qs = await _ai_questions(settings, missing, role)
        missing_questions.extend(ai_qs)
        resume_qs = _bank_questions(candidate_skills, per_skill=1)[:12]
        coding_skill = next((skill for skill in [*matched, *job_skills] if has_questions(skill)), None)
        coding = []
        if coding_skill:
            coding = [
                _question(f"Write a small {coding_skill} solution, then explain edge cases and complexity.", coding_skill, "easy", "candidate_context"),
                _question(f"Design a testable {coding_skill} exercise for {role} and explain the test cases first.", coding_skill, "medium", "candidate_context"),
            ]
        hr_questions = [
            _question(f"Tell me about yourself and connect only your documented experience to {role}.", None, "easy", "candidate_context"),
            _question(f"Why are you interested in {role}?", None, "easy", "candidate_context"),
            _question("Describe a team conflict and how you resolved it, using a real example.", None, "medium", "candidate_context"),
        ]

    if not coding and (matched or job_skills):
        coding_skill = next((skill for skill in [*matched, *job_skills] if has_questions(skill)), None)
        if coding_skill:
            coding = [
                _question(f"Write a small {coding_skill} solution, then explain edge cases and complexity.", coding_skill, "easy", "candidate_context"),
                _question(f"Design a testable {coding_skill} exercise for {role} and explain the test cases first.", coding_skill, "medium", "candidate_context"),
            ]

    coverage = len(matched) / max(1, len(matched) + len(missing)) * 100
    ats_score = float(analysis.get("overall_score") or 0) if analysis else 0.0
    readiness_score = round((ats_score * 0.6) + (coverage * 0.4), 1) if analysis else round(coverage, 1)
    return {
        "resume_version_id": str(resume_version_id),
        "job_description_id": str(job_description_id),
        "target_role": role,
        "resume_questions": resume_qs[:12],
        "project_questions": _project_questions(project_rows),
        "technical_questions": technical,
        "jd_questions": _bank_questions(_unique([*matched, *job_skills]), per_skill=1)[:16],
        "missing_skill_questions": missing_questions[:20],
        "coding_questions": coding,
        "hr_questions": hr_questions,
        "study_topics": [
            {"topic": skill, "priority": "high" if index < 3 else "medium" if index < 7 else "low", "reason": "This requirement was not found in the selected confirmed resume evidence."}
            for index, skill in enumerate(missing[:12])
        ],
        "interview_readiness": {
            "score": readiness_score,
            "ats_score": ats_score,
            "matched_skills": matched,
            "missing_skills": missing,
            "summary": f"Preparation uses {len(matched)} matched and {len(missing)} not-found requirements from the selected evidence.",
            "source_analysis_id": str(analysis["id"]) if analysis else None,
        },
    }
