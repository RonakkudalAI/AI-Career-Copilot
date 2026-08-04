"""Structured models for the learning-path YouTube crew."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator


class YoutubeLessonPlanItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    skill_gap: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=3, max_length=200)
    objective: str = Field(min_length=10, max_length=800)
    youtube_search_query: str = Field(min_length=3, max_length=200)
    estimated_minutes: int = Field(default=60, ge=15, le=240)
    difficulty: str = Field(default="foundational", max_length=40)

    @field_validator("skill_gap", "title", "objective", "youtube_search_query", "difficulty")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return (value or "").strip()


class YoutubeLessonPlanResult(BaseModel):
    model_config = ConfigDict(extra="ignore")

    recommendations: list[YoutubeLessonPlanItem] = Field(default_factory=list, max_length=12)
