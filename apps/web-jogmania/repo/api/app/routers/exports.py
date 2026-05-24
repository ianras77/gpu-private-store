from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app import crud, schemas
from app.services.exports import build_export
from app.s3_client import upload_json, presign_url

router = APIRouter(prefix="/exports", tags=["exports"])


@router.post("/run/{run_id}", response_model=schemas.ExportOut)
def export_run(run_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    run = crud.get_run(db, run_id, user.id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    payload = build_export(run)
    key = f"exports/run_{run.id}.json"
    try:
        upload_json(key, payload)
        url = presign_url(key)
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Export storage is unavailable") from exc
    return {"run_id": run.id, "url": url}
