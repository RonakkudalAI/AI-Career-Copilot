from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field


class LangChainRagRequest(BaseModel):
    query: str = Field(..., description="Candidate's question for the LangChain RAG pipeline")
    resume_text: str = Field(..., description="Confirmed resume text")
    job_description: str | None = Field(None, description="Confirmed job description text")
    chunk_size: int = Field(400, ge=100, le=1000, description="LangChain RecursiveCharacterTextSplitter chunk size")
    chunk_overlap: int = Field(50, ge=0, le=200, description="LangChain chunk overlap size")


class LangChainRagResponse(BaseModel):
    query: str = Field(..., description="Original user query")
    response: str = Field(..., description="LangChain grounded answer")
    framework: str = Field("LangChain v0.3", description="Framework used for RAG orchestration")
    retrieved_chunks: list[dict[str, Any]] = Field(default_factory=list, description="Retrieved document chunks with metadata")


class LangGraphWorkflowRequest(BaseModel):
    resume_text: str = Field(..., description="Confirmed resume text")
    job_description: str = Field(..., description="Target job description")
    selected_sections: list[str] = Field(default_factory=lambda: ["experience", "projects", "skills"], description="Sections to rephrase")


class LangGraphWorkflowResponse(BaseModel):
    status: str = Field(..., description="Final state of the LangGraph execution")
    framework: str = Field("LangGraph v0.2 (StateGraph DAG)", description="Framework used for stateful graph orchestration")
    iteration_count: int = Field(..., description="Total state graph cycles executed")
    missing_keywords: list[str] = Field(default_factory=list, description="Keywords isolated by GAP_ANALYST node")
    validated_suggestions: list[dict[str, Any]] = Field(default_factory=list, description="Suggestions that passed the EVIDENCE_VALIDATOR node")
    state_history: list[str] = Field(default_factory=list, description="Ordered sequence of executed graph state nodes")
