# ruff: noqa: E501
import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.features.document_parsing.schemas import (
    ConfidenceLevel,
    FieldWrapper,
    ParsedResumeSchema,
)
from app.features.document_parsing.source_blocks import SourceBlock


def test_18_top_level_sections_presence_and_defaults():
    schema = ParsedResumeSchema()
    dict_repr = schema.model_dump()
    expected_18_sections = {
        "contact",
        "professional_summary",
        "target_role",
        "skills",
        "experience",
        "projects",
        "education",
        "certifications",
        "licences",
        "achievements",
        "publications",
        "languages",
        "volunteer_experience",
        "training",
        "links",
        "additional_sections",
        "warnings",
        "unclassified_blocks",
    }
    assert set(dict_repr.keys()) == expected_18_sections, f"Missing or extra sections: {set(dict_repr.keys()) ^ expected_18_sections}"
    assert schema.professional_summary.value is None
    assert schema.target_role.value is None
    assert schema.skills == []
    assert schema.experience == []
    assert schema.projects == []
    assert schema.education == []
    assert schema.certifications == []
    assert schema.licences == []
    assert schema.achievements == []
    assert schema.publications == []
    assert schema.languages == []
    assert schema.volunteer_experience == []
    assert schema.training == []
    assert schema.links == []
    assert schema.additional_sections == []
    assert schema.warnings == []
    assert schema.unclassified_blocks == []
    assert schema.contact.full_name.value is None
    assert schema.contact.email.value is None
    assert schema.contact.phone.value is None
    assert schema.contact.location.value is None
    assert schema.contact.linkedin.value is None
    assert schema.contact.github.value is None
    assert schema.contact.portfolio.value is None
    assert schema.contact.other_links == []
def test_field_wrapper_extra_fields_ignored():
    data = {
        "value": "Senior Software Developer",
        "evidence_block_ids": ["page-1-block-02"],
        "confidence": "HIGH",
        "warning": None,
        "unexpected_llm_reasoning": "Extracted from header paragraph",
    }
    wrapper = FieldWrapper[str].model_validate(data)
    assert wrapper.value == "Senior Software Developer"
    assert wrapper.evidence_block_ids == ["page-1-block-02"]
    assert wrapper.confidence == ConfidenceLevel.HIGH
    assert not hasattr(wrapper, "unexpected_llm_reasoning")
def test_sparse_and_null_json_deserialization():
    parsed_empty = ParsedResumeSchema.model_validate({})
    assert parsed_empty.contact.full_name.value is None
    assert parsed_empty.skills == []
    assert parsed_empty.warnings == []
    partial_data = {
        "contact": {
            "full_name": {"value": "Jane Doe", "evidence_block_ids": ["page-1-block-01"]},
            "email": {"value": None},
        },
        "professional_summary": {"value": "Experienced Data Scientist", "evidence_block_ids": ["page-1-block-03"]},
        "skills": [
            {
                "name": {"value": "Python", "evidence_block_ids": ["page-1-block-05"]},
                "category": {"value": "Languages"},
            }
        ],
    }
    parsed_partial = ParsedResumeSchema.model_validate(partial_data)
    assert parsed_partial.contact.full_name.value == "Jane Doe"
    assert parsed_partial.contact.full_name.evidence_block_ids == ["page-1-block-01"]
    assert parsed_partial.contact.email.value is None
    assert parsed_partial.contact.phone.value is None
    assert parsed_partial.professional_summary.value == "Experienced Data Scientist"
    assert len(parsed_partial.skills) == 1
    assert parsed_partial.skills[0].name.value == "Python"
    assert parsed_partial.skills[0].candidate_confirmation_status == "unconfirmed"
def test_serialization_null_safety():
    schema = ParsedResumeSchema()
    serialized = schema.model_dump()
    assert serialized["professional_summary"]["value"] is None
    assert serialized["contact"]["full_name"]["value"] is None
    assert serialized["skills"] == []
    assert serialized["experience"] == []
    assert serialized["warnings"] == []
def test_groq_config_boundary_validation():
    base_kwargs = {
        "app_name": "Test App",
        "app_env": "test",
        "api_v1_prefix": "/api/v1",
        "public_api_base_url": "http://localhost:8000",
        "log_level": "INFO",
        "frontend_origins": ["http://localhost:3000"],
        "auth_secret": "secret",
        "local_storage_dir": "/tmp/storage",
        "document_bucket": "docs",
        "avatar_bucket": "avatars",
        "interview_bucket": "interviews",
        "nvidia_base_url": "https://api.nvidia.com",
        "nvidia_model": "deepseek",
        "nvidia_prompt_version": "v1",
        "groq_base_url": "https://api.groq.com/openai/v1",
        "groq_model": "llama-3.3-70b-versatile",
        "llm_provider": "groq",
    }
    valid_settings = Settings(
        **base_kwargs,
        groq_resume_parser_timeout_seconds=180.0,
        groq_resume_parser_max_retries=5,
        groq_resume_parser_max_input_tokens=200000,
        groq_resume_parser_temperature=1.0,
    )
    assert valid_settings.groq_resume_parser_timeout_seconds == 180.0
    assert valid_settings.groq_resume_parser_max_retries == 5
    assert valid_settings.groq_resume_parser_max_input_tokens == 200000
    assert valid_settings.groq_resume_parser_temperature == 1.0
    with pytest.raises(ValidationError):
        Settings(**base_kwargs, groq_resume_parser_timeout_seconds=0.0)
    with pytest.raises(ValidationError):
        Settings(**base_kwargs, groq_resume_parser_timeout_seconds=180.1)
    with pytest.raises(ValidationError):
        Settings(**base_kwargs, groq_resume_parser_max_retries=-1)
    with pytest.raises(ValidationError):
        Settings(**base_kwargs, groq_resume_parser_max_retries=6)
    with pytest.raises(ValidationError):
        Settings(**base_kwargs, groq_resume_parser_max_input_tokens=999)
    with pytest.raises(ValidationError):
        Settings(**base_kwargs, groq_resume_parser_max_input_tokens=200001)
    with pytest.raises(ValidationError):
        Settings(**base_kwargs, groq_resume_parser_temperature=-0.1)
    with pytest.raises(ValidationError):
        Settings(**base_kwargs, groq_resume_parser_temperature=1.1)
def test_source_block_id_determinism():
    b1 = SourceBlock.create(page=1, order=5, text="Python Developer")
    b2 = SourceBlock.create(page=1, order=5, text="Python Developer")
    assert b1.block_id == "page-1-block-05"
    assert b2.block_id == "page-1-block-05"
    assert b1.block_id == b2.block_id
    b3 = SourceBlock.create(page=12, order=104, text="Multi-digit test")
    assert b3.block_id == "page-12-block-104"
