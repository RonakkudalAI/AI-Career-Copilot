from fastapi import APIRouter, Depends

from app.features.ats.scoring.schemas import ScoreRequest, ScoreResult
from app.features.ats.scoring.service import score_resume_jd
from app.features.auth.service import CurrentUser, get_current_user

router = APIRouter(prefix="/ats", tags=["ats-scoring"])


@router.post("/score", response_model=ScoreResult)
async def score(
    payload: ScoreRequest,
    _: CurrentUser = Depends(get_current_user),
) -> ScoreResult:
    return await score_resume_jd(payload.resume_text, payload.jd_text)
