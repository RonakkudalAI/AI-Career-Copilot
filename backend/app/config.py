from functools import lru_cache
from pathlib import Path
from typing import Annotated
from urllib.parse import urlparse

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]
ROOT_ENV_FILE = ROOT_DIR / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Career Copilot API"
    app_env: str = "development"
    api_v1_prefix: str = "/api/v1"
    log_level: str = "INFO"
    frontend_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000"]
    )
    supabase_url: str = ""
    supabase_publishable_key: str = ""
    supabase_secret_key: str = ""
    document_max_bytes: int = 10 * 1024 * 1024
    avatar_max_bytes: int = 5 * 1024 * 1024
    interview_media_max_bytes: int = 250 * 1024 * 1024
    document_bucket: str = "candidate-documents"
    avatar_bucket: str = "candidate-avatars"
    interview_bucket: str = "interview-media"
    nvidia_api_key: str = ""
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    nvidia_model: str = ""
    nvidia_timeout_seconds: float = Field(default=90, gt=0, le=180)
    nvidia_max_retries: int = Field(default=2, ge=0, le=2)
    nvidia_max_output_tokens: int = Field(default=4096, ge=256, le=8192)
    nvidia_temperature: float = Field(default=0.2, ge=0, le=1)
    nvidia_prompt_version: str = "resume-improvement-v1"
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

    @field_validator("supabase_url", "nvidia_base_url")
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
        return self

    @property
    def supabase_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_publishable_key)

    @property
    def nvidia_configured(self) -> bool:
        return bool(self.nvidia_api_key and self.nvidia_model and self.nvidia_base_url)


@lru_cache
def get_settings() -> Settings:
    return Settings()
