from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import schemas, crud
from app.db import get_db
from app.auth import get_current_user

router = APIRouter(prefix="/runs", tags=["runs"])


@router.post("", response_model=schemas.RunOut)
def create_run(
    payload: schemas.RunCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    try:
        run = crud.create_run(db, user.id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return run


@router.get("", response_model=list[schemas.RunOut])
def list_runs(
    course_id: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    return crud.list_runs(db, user.id, course_id)
