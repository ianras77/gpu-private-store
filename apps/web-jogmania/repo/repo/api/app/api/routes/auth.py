import uuid

from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from sqlalchemy.orm import Session
from app.core.security import (
    get_password_hash,
    verify_password,
    create_access_token,
    create_email_verification_token,
    decode_email_verification_token
)
from app.deps import get_db
from app.models import User
from app.schemas import UserCreate, AuthResponse
from app.services.rate_limit import rate_limit
from app.core.config import settings
from app.services.email import send_verification_email, smtp_ready
from app.services.starter_content import ensure_user_baseline

router = APIRouter(prefix="/auth", tags=["auth"])


def _rate_key(request: Request, label: str) -> str:
    client = request.client.host if request.client else "unknown"
    return f"{label}:{client}"


def _email_verification_enabled() -> bool:
    return settings.auth_require_email_verification and smtp_ready()


def _set_auth_cookie(response: Response, token: str):
    response.set_cookie(
        settings.auth_cookie_name,
        token,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite=settings.auth_cookie_samesite,
        domain=settings.auth_cookie_domain,
        max_age=settings.access_token_expire_minutes * 60
    )


@router.post("/register", response_model=AuthResponse)
def register(payload: UserCreate, request: Request, response: Response, db: Session = Depends(get_db)):
    if not rate_limit(_rate_key(request, "register"), limit=5, window_s=60):
        raise HTTPException(status_code=429, detail="Too many attempts")

    email = payload.email.strip().lower()
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    verification_enabled = _email_verification_enabled()
    user = User(
        email=email,
        password_hash=get_password_hash(payload.password),
        email_verified=not verification_enabled
    )
    db.add(user)
    db.flush()
    ensure_user_baseline(db, user.id)

    if verification_enabled:
        token = create_email_verification_token(str(user.id))
        try:
            send_verification_email(user.email, token)
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Verification email could not be sent"
            )

    db.commit()
    db.refresh(user)

    if verification_enabled:
        return AuthResponse(
            requires_verification=True,
            message="Verification email sent. Check your inbox to finish setup."
        )

    token = create_access_token(str(user.id))
    _set_auth_cookie(response, token)

    warning = None
    if settings.auth_require_email_verification and not smtp_ready():
        warning = "Verification disabled in dev (SMTP not configured)."

    return AuthResponse(access_token=token, message=warning)


@router.post("/login", response_model=AuthResponse)
def login(payload: UserCreate, request: Request, response: Response, db: Session = Depends(get_db)):
    if not rate_limit(_rate_key(request, "login"), limit=10, window_s=60):
        raise HTTPException(status_code=429, detail="Too many attempts")

    email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if _email_verification_enabled() and not user.email_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email not verified")

    if ensure_user_baseline(db, user.id):
        db.commit()
        db.refresh(user)

    token = create_access_token(str(user.id))
    _set_auth_cookie(response, token)
    return AuthResponse(access_token=token)


@router.post("/logout", status_code=204)
def logout(response: Response):
    response.delete_cookie(settings.auth_cookie_name, domain=settings.auth_cookie_domain)
    return None


@router.get("/verify")
def verify_email(token: str, response: Response, db: Session = Depends(get_db)):
    user_id = decode_email_verification_token(token)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")

    try:
        user_uuid = uuid.UUID(str(user_id))
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")

    user = db.query(User).filter(User.id == user_uuid).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.email_verified = True
    db.commit()
    db.refresh(user)

    session_token = create_access_token(str(user.id))
    _set_auth_cookie(response, session_token)
    return {"status": "verified"}
