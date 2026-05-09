from fastapi import APIRouter, Depends
from app.deps import get_current_user
from app.schemas import UserOut

router = APIRouter(tags=["me"])


@router.get("/me", response_model=UserOut)
def me(user=Depends(get_current_user)):
    return user
