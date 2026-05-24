from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import schemas
from app.auth import get_current_user
from app.db import get_db
from app.services.courses import ensure_default_courses

router = APIRouter(prefix="/courses", tags=["courses"])


@router.get("", response_model=list[schemas.CourseOut])
def list_courses(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return ensure_default_courses(db, user.id)
