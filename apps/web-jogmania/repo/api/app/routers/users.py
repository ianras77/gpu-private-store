from fastapi import APIRouter, Depends

from app.auth import get_current_user
from app.schemas import UserOut

router = APIRouter(tags=["users"])


@router.get("/me", response_model=UserOut)
def me(user=Depends(get_current_user)):
    return user
