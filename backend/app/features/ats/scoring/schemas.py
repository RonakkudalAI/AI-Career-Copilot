from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ExperienceEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: str = Field(min_length=1, max_length=200)
    company: str = Field(min_length=1, max_length=200)
    duration: str = Field(default="", max_length=120)
    summary_bullets: list[str] = Field(default_factory=list, max_length=40)
    industry_tags: list[str] = Field(default_factory=list, max_length=20)


class EducationEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    degree: str = Field(default="", max_length=160)
    field: str = Field(default="", max_length=160)
    institution: str = Field(default="", max_length=200)
    year: str = Field(default="", max_length=40)


class ResumeParsed(BaseModel):
    model_config = ConfigDict(extra="forbid")

    skills: list[str] = Field(default_factory=list, max_length=100)
    experience: list[ExperienceEntry] = Field(default_factory=list, max_length=40)
    education: list[EducationEntry] = Field(default_factory=list, max_length=20)
    certifications: list[str] = Field(default_factory=list, max_length=40)
    total_years_exp: float = Field(default=0, ge=0, le=80)


class JDParsed(BaseModel):
    model_config = ConfigDict(extra="forbid")

    domain: str = Field(min_length=1, max_length=120)
    role_family: str = Field(min_length=1, max_length=160)
    required_skills: list[str] = Field(default_factory=list, max_length=100)
    preferred_skills: list[str] = Field(default_factory=list, max_length=100)
    min_years_exp: float = Field(default=0, ge=0, le=80)
    mandatory_criteria: list[str] = Field(default_factory=list, max_length=40)


class GateResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision: Literal["ALLOW", "REJECT"]
    reason: str = Field(min_length=1, max_length=1000)


PARAMETER_KEYS = (
    "hard_skill_match",
    "experience_relevance",
    "education_match",
    "certifications_match",
    "seniority_alignment",
)


class ScoreResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    gate: GateResult
    parameter_scores: dict[str, float]
    composite_score: float = Field(ge=0, le=100)
    reasons: dict[str, str]

    @field_validator("parameter_scores")
    @classmethod
    def validate_parameter_scores(cls, value: dict[str, float]) -> dict[str, float]:
        if set(value) != set(PARAMETER_KEYS):
            raise ValueError(f"parameter_scores must contain exactly: {', '.join(PARAMETER_KEYS)}")
        for key, score in value.items():
            if not 0 <= score <= 100:
                raise ValueError(f"{key} must be between 0 and 100")
        return {key: float(value[key]) for key in PARAMETER_KEYS}

    @field_validator("reasons")
    @classmethod
    def validate_reasons(cls, value: dict[str, str]) -> dict[str, str]:
        if set(value) != set(PARAMETER_KEYS):
            raise ValueError(f"reasons must contain exactly: {', '.join(PARAMETER_KEYS)}")
        return value

    @model_validator(mode="after")
    def validate_gate_score(self) -> "ScoreResult":
        if self.gate.decision == "REJECT" and self.composite_score != 0:
            raise ValueError("A rejected candidate must have a composite_score of 0")
        return self


class ScoreRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    resume_text: str = Field(min_length=1, max_length=200_000)
    jd_text: str = Field(min_length=1, max_length=200_000)

    @field_validator("resume_text", "jd_text")
    @classmethod
    def require_non_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Text cannot be blank")
        return value.strip()
