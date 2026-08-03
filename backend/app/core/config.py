from functools import lru_cache
from pathlib import Path
from typing import Annotated
from urllib.parse import urlparse

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[3]
ROOT_ENV_FILE = ROOT_DIR / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    app_name: str
    app_env: str
    api_v1_prefix: str
    public_api_base_url: str
    log_level: str
    frontend_origins: Annotated[list[str], NoDecode]
    database_path: str
    auth_secret: str
    local_storage_dir: str
    crewai_storage_dir: str = Field(default_factory=lambda: str(ROOT_DIR / ".data" / "crewai"))
    document_max_bytes: int = 10 * 1024 * 1024
    # Profile pictures must stay under 3 MB (enforced in API + storage bucket policy).
    avatar_max_bytes: int = 3 * 1024 * 1024
    interview_media_max_bytes: int = 250 * 1024 * 1024
    document_bucket: str
    avatar_bucket: str
    interview_bucket: str
    nvidia_api_key: str = ""
    nvidia_base_url: str
    nvidia_model: str
    nvidia_timeout_seconds: float = Field(default=90, gt=0, le=180)
    nvidia_max_retries: int = Field(default=2, ge=0, le=2)
    nvidia_max_output_tokens: int = Field(default=4096, ge=256, le=8192)
    nvidia_temperature: float = Field(default=0.2, ge=0, le=1)
    nvidia_prompt_version: str
    # Groq — separate provider for interview questions (not an NVIDIA fallback).
    groq_api_key: str = ""
    groq_base_url: str
    groq_model: str
    groq_timeout_seconds: float = Field(default=45, gt=0, le=180)
    groq_max_retries: int = Field(default=2, ge=0, le=2)
    groq_max_output_tokens: int = Field(default=2048, ge=256, le=8192)
    groq_temperature: float = Field(default=0.4, ge=0, le=1)
    llm_provider: str
    improvement_max_sections: int = Field(default=4, ge=1, le=8)
    improvement_max_source_chars: int = Field(default=30_000, ge=1_000, le=100_000)
    improvement_max_jd_chars: int = Field(default=12_000, ge=1_000, le=50_000)
    export_signed_url_seconds: int = Field(default=300, ge=30, le=3600)

    @field_validator("frontend_origins", mode="before")
    @classmethod
    def parse_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("crewai_storage_dir", mode="before")
    @classmethod
    def normalize_crewai_storage_dir(cls, value: object) -> str:
        if value is None or not str(value).strip():
            return str(ROOT_DIR / ".data" / "crewai")
        return str(value).strip()

    @field_validator("nvidia_base_url", "groq_base_url")
    @classmethod
    def validate_server_url(cls, value: str) -> str:
        if not value:
            return value
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("must be an absolute HTTP or HTTPS URL")
        return value.rstrip("/")

    @field_validator("frontend_origins")
    @classmethod
    def validate_origins(cls, value: list[str]) -> list[str]:
        if not value:
            raise ValueError("must contain at least one frontend origin")
        for origin in value:
            parsed = urlparse(origin)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                raise ValueError("contains an invalid frontend origin")
        return value

    @model_validator(mode="after")
    def validate_provider_pair(self) -> "Settings":
        if self.nvidia_api_key and not self.nvidia_model:
            raise ValueError("NVIDIA_MODEL is required when NVIDIA_API_KEY is configured")
        if self.groq_api_key and not self.groq_model:
            raise ValueError("GROQ_MODEL is required when GROQ_API_KEY is configured")
        return self

    @property
    def database_configured(self) -> bool:
        return bool(self.database_path)

    @property
    def nvidia_configured(self) -> bool:
        return bool(self.nvidia_api_key and self.nvidia_model and self.nvidia_base_url)

    @property
    def groq_configured(self) -> bool:
        return bool(self.groq_api_key and self.groq_model and self.groq_base_url)


@lru_cache
def get_settings() -> Settings:
    return Settings()
