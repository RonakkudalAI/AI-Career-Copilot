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
    app_name: str = "Career Copilot API"
    app_env: str = "production"
    api_v1_prefix: str = "/api/v1"
    public_api_base_url: str = "http://127.0.0.1:8000"
    log_level: str = "INFO"
    frontend_origins: Annotated[list[str], NoDecode] = Field(default_factory=lambda: ["*"])
    firebase_project_id: str = ""
    firebase_database_id: str = "(default)"
    firebase_credentials_path: str = ""
    # Supabase Storage is the only production object-storage provider.
    supabase_url: str = ""
    supabase_publishable_key: str = ""
    supabase_secret_key: str = ""
    supabase_service_role_key: str = ""
    supabase_storage_bucket: str = "career-copilot-files"
    supabase_jwks_url: str = ""
    firebase_clock_skew_seconds: int = Field(default=60, ge=0, le=300)
    # Revocation checks call Firebase Auth after signature verification.
    # Default False for local Admin setups that lack Auth lookup; production
    # forces True via model_validator unless explicitly overridden.
    firebase_check_revoked: bool = False
    auth_secret: str = "fVYHCLthk5xoxBkf4UkAWky8DVQ7Db0HfaAD2v1UadBSn4QOPOFqHjfqzQJ1QFeZ"
    jwt_ttl_seconds: int = Field(default=60 * 60 * 24 * 7, ge=60, le=60 * 60 * 24 * 30)
    llm_allow_repair: bool = True
    document_max_bytes: int = 10 * 1024 * 1024
    avatar_max_bytes: int = 3 * 1024 * 1024
    interview_media_max_bytes: int = 0
    # Logical prefixes inside the single Supabase Storage bucket.
    document_bucket: str = "candidate-documents"
    avatar_bucket: str = "candidate-avatars"
    nvidia_api_key: str = ""
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    nvidia_model: str = "deepseek-ai/deepseek-v4-flash"
    nvidia_timeout_seconds: float = Field(default=90, gt=0, le=180)
    nvidia_max_retries: int = Field(default=2, ge=0, le=2)
    nvidia_max_output_tokens: int = Field(default=4096, ge=256, le=8192)
    nvidia_temperature: float = Field(default=0.2, ge=0, le=1)
    nvidia_prompt_version: str = "resume-improvement-v1"
    groq_api_key: str = ""
    groq_base_url: str = "https://api.groq.com/openai/v1"
    groq_model: str = "llama-3.3-70b-versatile"
    groq_timeout_seconds: float = Field(default=45, gt=0, le=180)
    groq_max_retries: int = Field(default=2, ge=0, le=2)
    groq_max_output_tokens: int = Field(default=2048, ge=256, le=8192)
    groq_temperature: float = Field(default=0.4, ge=0, le=1)
    groq_resume_parser_enabled: bool = True
    groq_resume_parser_model: str = "llama-3.3-70b-versatile"
    groq_resume_parser_fallback_model: str = "llama-3.3-70b-versatile"
    groq_resume_parser_timeout_seconds: float = Field(default=60.0, gt=0, le=180)
    groq_resume_parser_max_retries: int = Field(default=2, ge=0, le=5)
    groq_resume_parser_max_input_tokens: int = Field(default=110000, ge=1000, le=200000)
    groq_resume_parser_temperature: float = Field(default=0.0, ge=0.0, le=1.0)
    llm_provider: str = "groq"
    # Optional local OpenAI-compatible OmniRoute sidecar. It is deliberately
    # disabled by default so deleting integrations/omniroute cannot affect the app.
    omniroute_enabled: bool = False
    omniroute_base_url: str = "http://127.0.0.1:20128/v1"
    omniroute_api_key: str = ""
    omniroute_model: str = "auto"
    omniroute_timeout_seconds: float = Field(default=30.0, gt=0, le=180)
    omniroute_max_retries: int = Field(default=1, ge=0, le=2)
    improvement_max_sections: int = Field(default=4, ge=1, le=8)
    improvement_max_source_chars: int = Field(default=30_000, ge=1_000, le=100_000)
    improvement_max_jd_chars: int = Field(default=12_000, ge=1_000, le=50_000)
    export_signed_url_seconds: int = Field(default=300, ge=30, le=3600)
    youtube_api_key: str = ""
    youtube_api_base_url: str = "https://www.googleapis.com/youtube/v3"
    youtube_search_max_results: int = Field(default=3, ge=1, le=5)
    youtube_timeout_seconds: float = Field(default=20.0, gt=0, le=60)
    llm_rpm_limit: float = Field(default=40.0, ge=1.0, le=600.0)
    adzuna_app_id: str = ""
    adzuna_app_key: str = ""
    adzuna_country: str = "us"
    adzuna_timeout_seconds: float = Field(default=15.0, gt=0, le=60)
    adzuna_results_per_page: int = Field(default=50, ge=1, le=50)
    adzuna_max_days_old: int | None = Field(default=30, ge=1, le=365)
    # Fish Audio TTS for mock-interview interviewer voice (server-side key only).
    fish_audio_api_key: str = ""
    fish_audio_base_url: str = "https://api.fish.audio"
    # Free developer tier model; override with s2.1-pro / s1 when paid.
    fish_audio_model: str = "s2.1-pro-free"
    # Optional public/custom voice model id (Fish Voice Library). Empty = provider default.
    fish_audio_reference_id: str = "bf322df2096a46f18c579d0baa36f41d"
    fish_audio_timeout_seconds: float = Field(default=45.0, gt=5, le=120)
    @field_validator("frontend_origins", mode="before")
    @classmethod
    def parse_origins(cls, value: object) -> object:
        if not value:
            return ["*"]
        if isinstance(value, str):
            items = [item.strip() for item in value.split(",") if item.strip()]
            return items or ["*"]
        return value
    @field_validator("nvidia_base_url", "groq_base_url", "omniroute_base_url")
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
            return ["*"]
        valid_origins = []
        for origin in value:
            if origin == "*":
                valid_origins.append("*")
                continue
            parsed = urlparse(origin)
            if parsed.scheme in {"http", "https"} and parsed.netloc:
                valid_origins.append(origin)
        return valid_origins or ["*"]
    @model_validator(mode="after")
    def validate_provider_pair(self) -> "Settings":
        if self.nvidia_api_key and not self.nvidia_model:
            raise ValueError("NVIDIA_MODEL is required when NVIDIA_API_KEY is configured")
        if self.groq_api_key and not self.groq_model:
            raise ValueError("GROQ_MODEL is required when GROQ_API_KEY is configured")
        if self.groq_resume_parser_enabled and self.groq_api_key:
            if not self.groq_resume_parser_model:
                raise ValueError("GROQ_RESUME_PARSER_MODEL is required when Groq resume parser is enabled")
            if not self.groq_resume_parser_fallback_model:
                raise ValueError("GROQ_RESUME_PARSER_FALLBACK_MODEL is required when Groq resume parser is enabled")
        return self
    @property
    def database_configured(self) -> bool:
        return self.firebase_configured

    @property
    def firebase_configured(self) -> bool:
        return bool(self.firebase_project_id and self.firebase_credentials_path)

    @property
    def effective_firebase_check_revoked(self) -> bool:
        """Production always checks revocation; development uses the env flag."""
        if str(self.app_env).lower() == "production":
            return True
        return bool(self.firebase_check_revoked)

    @property
    def resolved_supabase_url(self) -> str:
        value = (self.supabase_url or "").strip().rstrip("/")
        if value.endswith("/rest/v1"):
            return value[: -len("/rest/v1")]
        return value

    @property
    def supabase_storage_configured(self) -> bool:
        return bool(
            self.resolved_supabase_url
            and self.supabase_server_key
            and self.supabase_storage_bucket
        )

    @property
    def supabase_server_key(self) -> str:
        """Prefer the legacy name while accepting Supabase's new secret-key name."""
        return (self.supabase_service_role_key or self.supabase_secret_key or "").strip()

    @property
    def storage_configured(self) -> bool:
        return self.supabase_storage_configured
    @property
    def nvidia_configured(self) -> bool:
        return bool(self.nvidia_api_key and self.nvidia_model and self.nvidia_base_url)
    @property
    def groq_configured(self) -> bool:
        return bool(self.groq_api_key and self.groq_model and self.groq_base_url)

    @property
    def omniroute_configured(self) -> bool:
        return bool(self.omniroute_enabled and self.omniroute_model and self.omniroute_base_url)
    @property
    def groq_resume_parser_configured(self) -> bool:
        return bool(
            self.groq_api_key
            and self.groq_resume_parser_enabled
            and self.groq_resume_parser_model
            and self.groq_base_url
        )
    @property
    def youtube_configured(self) -> bool:
        return bool(self.youtube_api_key and self.youtube_api_base_url)

    @property
    def adzuna_configured(self) -> bool:
        return bool(self.adzuna_app_id and self.adzuna_app_key)

    @property
    def fish_audio_configured(self) -> bool:
        return bool((self.fish_audio_api_key or "").strip())
@lru_cache
def get_settings() -> Settings:
    return Settings()
