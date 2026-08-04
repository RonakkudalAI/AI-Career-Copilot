from __future__ import annotations

from enum import Enum
from typing import Generic, TypeVar
from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class ConfidenceLevel(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    NEEDS_REVIEW = "NEEDS_REVIEW"


class FieldWrapper(BaseModel, Generic[T]):
    """
    Universal metadata wrapper for source-grounded resume fields.
    """
    model_config = ConfigDict(extra="ignore")

    value: T | None = Field(default=None, description="Extracted value, or None if absent/unsupported")
    evidence_block_ids: list[str] = Field(default_factory=list, description="IDs of SourceBlocks supporting this exact value")
    confidence: ConfidenceLevel = Field(default=ConfidenceLevel.HIGH, description="Measurable confidence level")
    warning: str | None = Field(default=None, description="Field-specific warning or ambiguity explanation")


def create_empty_field_wrapper(warning: str | None = None) -> FieldWrapper[T]:
    return FieldWrapper(value=None, evidence_block_ids=[], confidence=ConfidenceLevel.HIGH, warning=warning)


# --- Section Models ---

class ContactSection(BaseModel):
    model_config = ConfigDict(extra="ignore")

    full_name: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    email: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    phone: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    location: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    linkedin: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    github: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    portfolio: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    other_links: list[FieldWrapper[str]] = Field(default_factory=list)


class SkillItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    category: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    candidate_confirmation_status: str = Field(default="unconfirmed", description="Candidate review status ('unconfirmed', 'confirmed', 'edited')")


class ExperienceItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    employer: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    role: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    location: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    start_date: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    end_date: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    is_current: FieldWrapper[bool] = Field(default_factory=FieldWrapper[bool])
    responsibilities: list[FieldWrapper[str]] = Field(default_factory=list)
    achievements: list[FieldWrapper[str]] = Field(default_factory=list)
    technologies: list[FieldWrapper[str]] = Field(default_factory=list)


class ProjectItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    project_type: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    description: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    role: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    technologies: list[FieldWrapper[str]] = Field(default_factory=list)
    responsibilities: list[FieldWrapper[str]] = Field(default_factory=list)
    outcomes: list[FieldWrapper[str]] = Field(default_factory=list)
    start_date: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    end_date: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    links: list[FieldWrapper[str]] = Field(default_factory=list)


class EducationItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    institution: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    degree: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    field_of_study: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    start_date: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    end_date: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    grade: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    location: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])


class CertificationItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    issuer: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    issue_date: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    expiration_date: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    credential_id: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    credential_url: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])


class LicenceItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    issuer: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    licence_number: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    state_or_region: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    issue_date: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    expiration_date: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])


class AchievementItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    description: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    date: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    issuer: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])


class PublicationItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    publisher: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    date: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    url: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    description: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])


class LanguageItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    language: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    proficiency: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])


class VolunteerItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    organization: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    role: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    start_date: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    end_date: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    description: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])


class TrainingItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    provider: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    date: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    details: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])


class LinkItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    link_type: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    url: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    label: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])


class AdditionalSectionItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    heading: str = Field(..., description="Original section heading title from document")
    items: list[FieldWrapper[str]] = Field(default_factory=list, description="Extracted content items under this section")


class UnclassifiedBlock(BaseModel):
    model_config = ConfigDict(extra="ignore")

    block_id: str | None = Field(default=None, description="Source block ID if available")
    text: str = Field(..., description="Raw unclassified text block content")
    reason: str | None = Field(default=None, description="Reason why block was unclassified or quarantined")


# --- Top-Level Root Model ---

class ParsedResumeSchema(BaseModel):
    """
    Complete 18-section structured resume representation.
    """
    model_config = ConfigDict(extra="ignore")

    contact: ContactSection = Field(default_factory=ContactSection)
    professional_summary: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    target_role: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    skills: list[SkillItem] = Field(default_factory=list)
    experience: list[ExperienceItem] = Field(default_factory=list)
    projects: list[ProjectItem] = Field(default_factory=list)
    education: list[EducationItem] = Field(default_factory=list)
    certifications: list[CertificationItem] = Field(default_factory=list)
    licences: list[LicenceItem] = Field(default_factory=list)
    achievements: list[AchievementItem] = Field(default_factory=list)
    publications: list[PublicationItem] = Field(default_factory=list)
    languages: list[LanguageItem] = Field(default_factory=list)
    volunteer_experience: list[VolunteerItem] = Field(default_factory=list)
    training: list[TrainingItem] = Field(default_factory=list)
    links: list[LinkItem] = Field(default_factory=list)
    additional_sections: list[AdditionalSectionItem] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    unclassified_blocks: list[UnclassifiedBlock] = Field(default_factory=list)


# --- Multi-Stage Sub-Schemas (Stages 1–6) ---

class Stage1DocumentStructure(BaseModel):
    model_config = ConfigDict(extra="ignore")
    detected_sections: list[str] = Field(default_factory=list)
    heading_block_map: dict[str, list[str]] = Field(default_factory=dict)


class Stage2ContactAndSummary(BaseModel):
    model_config = ConfigDict(extra="ignore")
    contact: ContactSection = Field(default_factory=ContactSection)
    professional_summary: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])
    target_role: FieldWrapper[str] = Field(default_factory=FieldWrapper[str])


class Stage3Skills(BaseModel):
    model_config = ConfigDict(extra="ignore")
    skills: list[SkillItem] = Field(default_factory=list)


class Stage4Experience(BaseModel):
    model_config = ConfigDict(extra="ignore")
    experience: list[ExperienceItem] = Field(default_factory=list)


class Stage5Projects(BaseModel):
    model_config = ConfigDict(extra="ignore")
    projects: list[ProjectItem] = Field(default_factory=list)


class Stage6EducationAndCredentials(BaseModel):
    model_config = ConfigDict(extra="ignore")
    education: list[EducationItem] = Field(default_factory=list)
    certifications: list[CertificationItem] = Field(default_factory=list)
    licences: list[LicenceItem] = Field(default_factory=list)
    achievements: list[AchievementItem] = Field(default_factory=list)
    publications: list[PublicationItem] = Field(default_factory=list)
    languages: list[LanguageItem] = Field(default_factory=list)
    volunteer_experience: list[VolunteerItem] = Field(default_factory=list)
    training: list[TrainingItem] = Field(default_factory=list)
    links: list[LinkItem] = Field(default_factory=list)
    additional_sections: list[AdditionalSectionItem] = Field(default_factory=list)
