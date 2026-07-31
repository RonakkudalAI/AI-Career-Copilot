from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator, model_validator


class ProfilePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    full_name: str | None = Field(default=None, max_length=120)
    headline: str | None = Field(default=None, max_length=240)
    bio: str | None = Field(default=None, max_length=4000)
    phone: str | None = Field(default=None, max_length=40)
    location: str | None = Field(default=None, max_length=160)
    current_role: str | None = Field(default=None, max_length=160)
    years_experience: float | None = Field(default=None, ge=0, le=80)
    career_level: str | None = Field(default=None, max_length=80)
    career_goal: str | None = Field(default=None, max_length=2000)
    onboarding_step: int | None = Field(default=None, ge=1, le=6)
    onboarding_completed: bool | None = None


class ProfileFromResumePreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    resume_version_id: UUID | None = None


class ProfileFromResumeApplyRequest(BaseModel):
    """Apply a reviewed resume-derived draft to the candidate profile tables."""

    model_config = ConfigDict(extra="forbid")
    fill_empty_only: bool = True
    profile: dict[str, Any] = Field(default_factory=dict)
    skills: list[dict[str, Any]] = Field(default_factory=list, max_length=80)
    experiences: list[dict[str, Any]] = Field(default_factory=list, max_length=40)
    education: list[dict[str, Any]] = Field(default_factory=list, max_length=20)
    projects: list[dict[str, Any]] = Field(default_factory=list, max_length=30)
    certifications: list[dict[str, Any]] = Field(default_factory=list, max_length=30)
    languages: list[dict[str, Any]] = Field(default_factory=list, max_length=20)
    links: list[dict[str, Any]] = Field(default_factory=list, max_length=20)


class LlmProfileCore(BaseModel):
    model_config = ConfigDict(extra="ignore")
    full_name: str | None = Field(default=None, max_length=120)
    headline: str | None = Field(default=None, max_length=240)
    bio: str | None = Field(default=None, max_length=4000)
    phone: str | None = Field(default=None, max_length=40)
    location: str | None = Field(default=None, max_length=160)
    current_role: str | None = Field(default=None, max_length=160)
    years_experience: float | None = Field(default=None, ge=0, le=80)
    career_level: str | None = Field(default=None, max_length=80)


class LlmExperienceItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    company_name: str = Field(min_length=1, max_length=200)
    role_title: str = Field(min_length=1, max_length=200)
    location: str | None = Field(default=None, max_length=160)
    employment_type: str | None = Field(default=None, max_length=80)
    start_date: str | None = Field(default=None, max_length=40)
    end_date: str | None = Field(default=None, max_length=40)
    summary: str | None = Field(default=None, max_length=4000)
    is_current: bool = False


class LlmEducationItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    institution: str = Field(min_length=1, max_length=200)
    degree: str | None = Field(default=None, max_length=160)
    field_of_study: str | None = Field(default=None, max_length=160)
    grade: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=2000)


class LlmProjectItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: str = Field(min_length=1, max_length=200)
    role: str | None = Field(default=None, max_length=160)
    description: str | None = Field(default=None, max_length=4000)


class LlmCertificationItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str = Field(min_length=1, max_length=200)
    issuer: str | None = Field(default=None, max_length=160)


class LlmLanguageItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    language: str = Field(min_length=1, max_length=80)
    proficiency: str | None = Field(default=None, max_length=80)


class LlmLinkItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    link_type: Literal["linkedin", "github", "portfolio", "website", "other"] = "other"
    url: str = Field(min_length=3, max_length=500)
    label: str | None = Field(default=None, max_length=120)


class ProfileResumeExtractResult(BaseModel):
    """Structured LLM output for profile fill-from-resume (evidence-bound)."""

    model_config = ConfigDict(extra="ignore")
    profile: LlmProfileCore = Field(default_factory=LlmProfileCore)
    skills: list[str] = Field(default_factory=list, max_length=60)
    experiences: list[LlmExperienceItem] = Field(default_factory=list, max_length=25)
    education: list[LlmEducationItem] = Field(default_factory=list, max_length=15)
    projects: list[LlmProjectItem] = Field(default_factory=list, max_length=20)
    certifications: list[LlmCertificationItem] = Field(default_factory=list, max_length=20)
    languages: list[LlmLanguageItem] = Field(default_factory=list, max_length=15)
    links: list[LlmLinkItem] = Field(default_factory=list, max_length=15)
    warnings: list[str] = Field(default_factory=list, max_length=20)


class PreferencesUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    target_roles: list[str] = []
    preferred_industries: list[str] = []
    preferred_locations: list[str] = []
    work_modes: list[str] = []
    employment_types: list[str] = []
    notice_period_days: int | None = Field(default=None, ge=0)
    willing_to_relocate: bool = False
    work_authorization: str | None = Field(default=None, max_length=160)
    salary_min: float | None = Field(default=None, ge=0)
    salary_max: float | None = Field(default=None, ge=0)
    salary_currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")

    @model_validator(mode="after")
    def salary_order(self) -> "PreferencesUpdate":
        if self.salary_min is not None and self.salary_max is not None and self.salary_min > self.salary_max:
            raise ValueError("salary_min cannot exceed salary_max")
        return self


class JobDescriptionTextCreate(BaseModel):
    # Optional: when omitted, the API infers title/role/company from the JD text.
    title: str | None = Field(default=None, max_length=200)
    company: str | None = Field(default=None, max_length=200)
    role_title: str | None = Field(default=None, max_length=200)
    raw_text: str = Field(min_length=20, max_length=200_000)


class JobDescriptionMetadataPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str | None = Field(default=None, max_length=200)
    company: str | None = Field(default=None, max_length=200)
    role_title: str | None = Field(default=None, max_length=200)


class ExtractionPatch(BaseModel):
    structured_content: dict[str, Any]


class AtsAnalysisCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    resume_version_id: UUID
    job_description_id: UUID


class InterviewCreate(BaseModel):
    mode: Literal[
        "resume", "resume_and_jd", "role", "topic", "company", "behavioural", "technical", "hr", "mixed"
    ]
    resume_version_id: UUID | None = None
    job_description_id: UUID | None = None
    target_role: str | None = None
    target_company: str | None = None
    topic: str | None = None
    difficulty: str | None = None
    question_count: int = Field(default=5, ge=1, le=20)
    duration_minutes: int = Field(default=20, ge=5, le=180)
    camera_enabled: bool = False
    microphone_enabled: bool = False
    recording_consent: bool = False


class InterviewResponseCreate(BaseModel):
    question_id: UUID
    typed_response: str | None = Field(default=None, max_length=20_000)
    transcript: str | None = Field(default=None, max_length=50_000)
    duration_seconds: int | None = Field(default=None, ge=0)


class LearningPathCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    source_type: Literal["candidate_selected"] = "candidate_selected"


class SavedJobPatch(BaseModel):
    status: Literal["saved", "applied", "interviewing", "offer", "rejected", "withdrawn"] = "saved"
    notes: str | None = Field(default=None, max_length=4000)


class NotificationSettings(BaseModel):
    job_alerts: bool = False
    learning_reminders: bool = True
    interview_reminders: bool = True
    product_updates: bool = False
    email_frequency: Literal["never", "daily", "weekly"] = "weekly"


class PrivacySettings(BaseModel):
    camera_permission: Literal["ask", "allowed", "disabled"] = "ask"
    microphone_permission: Literal["ask", "allowed", "disabled"] = "ask"
    recording_retention_days: int = Field(default=0, ge=0, le=365)
    resume_processing_consent: bool = False
    job_recommendation_consent: bool = False
    profile_visibility: Literal["private", "limited"] = "private"


class AccountDeleteRequest(BaseModel):
    """Explicit confirmation required before irreversible account deletion."""

    model_config = ConfigDict(extra="forbid")
    confirmation: str = Field(min_length=1, max_length=80)
    email: str | None = Field(default=None, max_length=320)


class LinkInput(BaseModel):
    link_type: Literal["linkedin", "github", "portfolio", "website", "other"]
    label: str | None = None
    url: HttpUrl
    display_order: int = Field(default=0, ge=0)


ResumeSection = Literal[
    "summary", "skills", "experience", "projects", "education", "certifications", "languages"
]
SuggestionType = Literal[
    "rewrite", "clarity", "conciseness", "action_verb", "structure", "job_alignment", "formatting"
]


class ResumeImprovementCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    resume_version_id: UUID
    job_description_id: UUID | None = None
    ats_analysis_id: UUID | None = None
    section_keys: list[ResumeSection] = Field(min_length=1, max_length=4)

    @field_validator("section_keys")
    @classmethod
    def unique_sections(cls, value: list[ResumeSection]) -> list[ResumeSection]:
        if len(value) != len(set(value)):
            raise ValueError("section_keys must be unique")
        return value


class ProviderSuggestion(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    section_key: ResumeSection
    source_block_id: str = Field(min_length=1, max_length=160)
    source_text: str = Field(min_length=1, max_length=8_000)
    proposed_text: str = Field(min_length=1, max_length=8_000)
    reason: str = Field(min_length=1, max_length=1_000)
    suggestion_type: SuggestionType
    evidence_references: list[str] = Field(min_length=1, max_length=20)


class ProviderSuggestionResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    suggestions: list[ProviderSuggestion] = Field(max_length=40)


class ResumeSuggestionDecision(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    decision: Literal["accepted", "edited", "rejected", "pending"]
    candidate_text: str | None = Field(default=None, max_length=8_000)
    candidate_confirmed: bool = False

    @model_validator(mode="after")
    def validate_candidate_edit(self) -> "ResumeSuggestionDecision":
        if self.decision == "edited" and (not self.candidate_text or not self.candidate_confirmed):
            raise ValueError("Edited text requires candidate confirmation")
        if self.decision != "edited" and self.candidate_text is not None:
            raise ValueError("candidate_text is allowed only for edited decisions")
        return self


class ResumeExportCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    format: Literal["pdf", "docx"]


class ManualResumeVersionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    structured_content: dict[str, Any]
    candidate_confirmed: Literal[True]
    # Default: patch the existing resume version (same resume + same version id).
    # "new_version" keeps the prior content as history and is opt-in only.
    apply_mode: Literal["in_place", "new_version"] = "in_place"


class ApplyImprovementBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    apply_mode: Literal["in_place", "new_version"] = "in_place"
