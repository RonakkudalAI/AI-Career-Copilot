from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field


class RagSourceChunk(BaseModel):
    source_type: str = Field(..., description="Type of document chunk: 'resume' or 'job_description'")
    text: str = Field(..., description="Text content of the retrieved document chunk")
    similarity_score: float = Field(0.0, description="Cosine similarity score for retrieval relevance")


class RagIndexRequest(BaseModel):
    resume_text: str = Field(..., description="Confirmed resume text to chunk and index")
    job_description: str | None = Field(None, description="Optional confirmed job description text")


class RagIndexResponse(BaseModel):
    indexed_chunks_count: int = Field(..., description="Total number of document chunks indexed")
    resume_chunks_count: int = Field(..., description="Number of chunks created from resume")
    job_chunks_count: int = Field(..., description="Number of chunks created from job description")


class RagChatRequest(BaseModel):
    query: str = Field(..., description="Candidate's question for the RAG career assistant")
    resume_text: str = Field(..., description="Confirmed resume text for grounding")
    job_description: str | None = Field(None, description="Confirmed job description text for grounding")
    top_k: int = Field(4, ge=1, le=10, description="Number of relevant chunks to retrieve for context")


class RagChatResponse(BaseModel):
    query: str = Field(..., description="Candidate's original question")
    response: str = Field(..., description="Grounded AI career advice response")
    algorithm_version: str = Field("rag-semantic-retrieval-v1", description="Version of the RAG pipeline")
    retrieved_sources: list[RagSourceChunk] = Field(default_factory=list, description="List of retrieved source chunks used as context")
