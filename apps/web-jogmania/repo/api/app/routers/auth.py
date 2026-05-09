from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app import crud, schemas
from app.auth import create_access_token, hash_password, verify_password
from app.db import get_db
from app.redis_client import rate_limit_login

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=schemas.UserOut)
def register(payload: schemas.UserCreate, db: Session = Depends(get_db)):
    existing = crud.get_user_by_email(db, payload.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = crud.create_user(db, payload.email, hash_password(payload.password))
    return user


@router.post("/login", response_model=schemas.TokenOut)
def login(payload: schemas.UserCreate, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "unknown"
    try:
        rate_limit_login(payload.email, ip)
    except Exception:
        raise HTTPException(status_code=429, detail="Too many login attempts")

    user = crud.get_user_by_email(db, payload.email)
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token(user.email)
    return schemas.TokenOut(access_token=token)
