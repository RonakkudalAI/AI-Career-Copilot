from __future__ import annotations

import logging
from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.features.auth.service import CurrentUser, get_current_user
from app.features.rag_assistant.schemas import (
    RagChatRequest,
    RagChatResponse,
    RagIndexRequest,
    RagIndexResponse,
)
from app.features.rag_assistant.service import (
    generate_rag_career_advice,
    index_documents_for_rag,
)

router = APIRouter(prefix="/rag", tags=["RAG Assistant"])
logger = logging.getLogger(__name__)


@router.post("/index", response_model=RagIndexResponse)
def index_rag_documents(
    payload: RagIndexRequest,
    user: CurrentUser = Depends(get_current_user),
) -> RagIndexResponse:
    """Chunk and index candidate's confirmed resume and job description text."""
    logger.info("rag_index_requested user_id=%s", user.id)
    return index_documents_for_rag(payload)


@router.post("/chat", response_model=RagChatResponse)
async def chat_rag_assistant(
    payload: RagChatRequest,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> RagChatResponse:
    """Execute RAG pipeline: vector search evidence chunks + synthesize grounded career advice."""
    logger.info("rag_chat_requested user_id=%s query=%s", user.id, payload.query)
    return await generate_rag_career_advice(payload, settings=settings)
