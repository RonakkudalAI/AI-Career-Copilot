from __future__ import annotations

import pytest
from app.core.config import Settings
from app.features.rag_assistant.schemas import (
    RagChatRequest,
    RagIndexRequest,
)
from app.features.rag_assistant.service import (
    generate_rag_career_advice,
    index_documents_for_rag,
)
from app.features.rag_assistant.vector_store import SimpleVectorStore


def test_simple_vector_store_chunking_and_search():
    store = SimpleVectorStore()

    resume_text = (
        "Senior Backend Engineer with 5 years of Python experience. "
        "Built event-driven streaming microservices using Apache Kafka processing 100k events/sec. "
        "Proficient in Docker, Kubernetes, and FastAPI REST APIs."
    )
    job_description = (
        "Looking for a Senior Software Engineer with strong Python and event streaming experience. "
        "Must have hands-on experience with Kafka, Kubernetes, and high-throughput microservices."
    )

    store.chunk_text(resume_text, source_type="resume", chunk_words=20, overlap_words=5)
    store.chunk_text(job_description, source_type="job_description", chunk_words=20, overlap_words=5)

    assert len(store.chunks) > 0

    # Search for Kafka & Streaming
    results = store.search("Kafka streaming microservices", top_k=3)
    assert len(results) > 0

    top_chunk, score = results[0]
    assert score > 0.0
    assert "kafka" in top_chunk.text.lower() or "streaming" in top_chunk.text.lower()


def test_index_documents_for_rag():
    request = RagIndexRequest(
        resume_text="Experienced Full Stack Developer skilled in React, TypeScript, Python, and PostgreSQL.",
        job_description="We are hiring a Full Stack Developer experienced in React and Python.",
    )

    response = index_documents_for_rag(request)
    assert response.indexed_chunks_count > 0
    assert response.resume_chunks_count > 0
    assert response.job_chunks_count > 0


@pytest.mark.anyio
async def test_generate_rag_career_advice(monkeypatch):
    settings = Settings()

    request = RagChatRequest(
        query="How does my experience with Apache Kafka match the JD streaming requirements?",
        resume_text="Engineered distributed real-time pipeline using Apache Kafka and FastAPI.",
        job_description="Seeking backend developer with Apache Kafka and distributed systems background.",
        top_k=2,
    )

    response = await generate_rag_career_advice(request, settings=settings)

    assert response.query == request.query
    assert response.algorithm_version == "rag-semantic-retrieval-v1"
    assert len(response.retrieved_sources) > 0
    assert any("kafka" in source.text.lower() for source in response.retrieved_sources)
