from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Any


@dataclass
class DocumentChunk:
    chunk_id: str
    source_type: str  # "resume" or "job_description"
    text: str
    term_counts: dict[str, int] = field(default_factory=dict)
    vector: dict[str, float] = field(default_factory=dict)
    norm: float = 0.0


def _tokenize(text: str) -> list[str]:
    """Clean and extract normalized word tokens."""
    return [token for token in re.findall(r"(?:[a-zA-Z]|\.[a-zA-Z])[a-zA-Z0-9+#./-]*", (text or "").lower()) if len(token) >= 2]


class SimpleVectorStore:
    """In-memory Vector Store with Cosine Similarity Retrieval."""

    def __init__(self) -> None:
        self.chunks: list[DocumentChunk] = []

    def chunk_text(
        self, text: str, source_type: str, chunk_words: int = 80, overlap_words: int = 20
    ) -> list[DocumentChunk]:
        """Split document text into overlapping chunks and build term vectors."""
        lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
        full_clean = " ".join(lines)
        words = full_clean.split()
        if not words:
            return []

        chunks: list[DocumentChunk] = []
        i = 0
        idx = 1

        while i < len(words):
            segment_words = words[i : i + chunk_words]
            chunk_str = " ".join(segment_words).strip()
            if chunk_str:
                tokens = _tokenize(chunk_str)
                term_counts: dict[str, int] = {}
                for token in tokens:
                    term_counts[token] = term_counts.get(token, 0) + 1

                # Normalize TF vector
                total_terms = sum(term_counts.values()) or 1.0
                vector = {term: count / total_terms for term, count in term_counts.items()}
                norm = math.sqrt(sum(v * v for v in vector.values()))

                doc_chunk = DocumentChunk(
                    chunk_id=f"{source_type}_{idx}",
                    source_type=source_type,
                    text=chunk_str,
                    term_counts=term_counts,
                    vector=vector,
                    norm=norm,
                )
                chunks.append(doc_chunk)
                idx += 1

            i += chunk_words - overlap_words

        self.chunks.extend(chunks)
        return chunks

    def search(self, query: str, top_k: int = 4) -> list[tuple[DocumentChunk, float]]:
        """Retrieve top_k most relevant chunks using Cosine Similarity."""
        query_tokens = _tokenize(query)
        if not query_tokens or not self.chunks:
            return []

        query_counts: dict[str, int] = {}
        for token in query_tokens:
            query_counts[token] = query_counts.get(token, 0) + 1

        total_q = sum(query_counts.values()) or 1.0
        query_vector = {term: count / total_q for term, count in query_counts.items()}
        query_norm = math.sqrt(sum(v * v for v in query_vector.values()))

        if query_norm == 0.0:
            return []

        scored_chunks: list[tuple[DocumentChunk, float]] = []

        for chunk in self.chunks:
            if chunk.norm == 0.0:
                continue

            # Dot Product
            dot = sum(query_vector[t] * chunk.vector[t] for t in query_vector if t in chunk.vector)
            similarity = dot / (query_norm * chunk.norm)

            if similarity > 0.0:
                scored_chunks.append((chunk, round(similarity, 4)))

        scored_chunks.sort(key=lambda item: item[1], reverse=True)
        return scored_chunks[:top_k]
