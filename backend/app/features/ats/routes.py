from fastapi import APIRouter, Depends

from app.features.ats.ats_score import AtsScore, score_resume
from app.features.ats.scoring.schemas import ScoreRequest
from app.features.auth.service import CurrentUser, get_current_user

router = APIRouter(prefix="/ats", tags=["ats-scoring"])
@router.post("/score")
async def score(
    payload: ScoreRequest,
    _: CurrentUser = Depends(get_current_user),
) -> AtsScore:
    return score_resume(payload.resume_text, payload.jd_text)
