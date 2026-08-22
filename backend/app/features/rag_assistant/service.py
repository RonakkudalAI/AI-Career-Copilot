from __future__ import annotations

import logging
from typing import Any

from app.agents.providers import GroqClient, NvidiaClient, preferred_llm_providers
from app.core.config import Settings
from app.features.rag_assistant.schemas import (
    RagChatRequest,
    RagChatResponse,
    RagIndexRequest,
    RagIndexResponse,
    RagSourceChunk,
)
from app.features.rag_assistant.vector_store import SimpleVectorStore

logger = logging.getLogger(__name__)
RAG_ALGORITHM_VERSION = "rag-semantic-retrieval-v1"


def index_documents_for_rag(request: RagIndexRequest) -> RagIndexResponse:
    """Index resume and job description text into vector chunks."""
    store = SimpleVectorStore()
    resume_chunks = store.chunk_text(request.resume_text, source_type="resume")
    job_chunks = []
    if request.job_description:
        job_chunks = store.chunk_text(request.job_description, source_type="job_description")

    return RagIndexResponse(
        indexed_chunks_count=len(resume_chunks) + len(job_chunks),
        resume_chunks_count=len(resume_chunks),
        job_chunks_count=len(job_chunks),
    )


async def _llm_completion(
    system_prompt: str, user_prompt: str, settings: Settings
) -> str | None:
    """Try preferred LLM providers (Groq primary -> NVIDIA fallback)."""
    providers = preferred_llm_providers(settings)
    for provider in providers:
        try:
            if provider == "groq":
                client = GroqClient(settings)
                return await client.chat_completion(
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    temperature=0.3,
                )
            if provider == "nvidia":
                client = NvidiaClient(settings)
                return await client.chat_completion(
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    temperature=0.3,
                )
        except Exception as exc:
            logger.warning("rag_llm_provider_failed provider=%s error=%s", provider, exc)

    return None


async def generate_rag_career_advice(
    request: RagChatRequest,
    settings: Settings,
) -> RagChatResponse:
    """RAG Service: Chunk, vector-search relevant evidence, and synthesize grounded advice."""
    store = SimpleVectorStore()
    store.chunk_text(request.resume_text, source_type="resume")
    if request.job_description:
        store.chunk_text(request.job_description, source_type="job_description")

    retrieved_pairs = store.search(request.query, top_k=request.top_k)

    retrieved_sources = [
        RagSourceChunk(
            source_type=chunk.source_type,
            text=chunk.text,
            similarity_score=score,
        )
        for chunk, score in retrieved_pairs
    ]

    context_lines = [
        f"[{source.source_type.upper()} SOURCE (Relevance: {source.similarity_score})]: {source.text}"
        for source in retrieved_sources
    ]
    context_str = "\n\n".join(context_lines) if context_lines else "No specific matching evidence found in source text."

    system_prompt = (
        "You are an expert AI Career Coach in Career Copilot. "
        "Answer the candidate's question using ONLY the provided resume and job description evidence chunks. "
        "Do NOT invent work experience, companies, or metrics not present in the evidence. "
        "Be concise, professional, and actionable."
    )
    user_prompt = (
        f"GROUNDED RETRIEVED CONTEXT:\n{context_str}\n\n"
        f"CANDIDATE QUESTION: {request.query}\n\n"
        "Provide evidence-grounded career advice based on the above context:"
    )

    llm_output = await _llm_completion(system_prompt, user_prompt, settings)

    if llm_output and llm_output.strip():
        response_text = llm_output.strip()
    else:
        # Deterministic grounded fallback when remote LLM APIs are unconfigured/unavailable
        top_evidence = [s.text for s in retrieved_sources[:2]]
        evidence_summary = " ".join(top_evidence) if top_evidence else "Review confirmed resume text."
        response_text = (
            f"Based on your confirmed document evidence for '{request.query}':\n\n"
            f"Key matching context: {evidence_summary}\n\n"
            "Actionable recommendation: Ensure your resume projects section highlights these specific skills and outcomes."
        )

    return RagChatResponse(
        query=request.query,
        response=response_text,
        algorithm_version=RAG_ALGORITHM_VERSION,
        retrieved_sources=retrieved_sources,
    )
