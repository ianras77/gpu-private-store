from fastapi import FastAPI, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.db import SessionLocal
from sqlalchemy import text
from app.services.rate_limit import client as redis_client
from app.services.storage import get_s3_client, StorageNotConfigured
from app.api.routes.auth import router as auth_router
from app.api.routes.me import router as me_router
from app.api.routes.workouts import router as workouts_router
from app.api.routes.routes import router as routes_router
from app.api.routes.adventures import router as adventures_router
from app.api.routes.rewards import router as rewards_router
from app.api.routes.exports import router as exports_router
from app.api.routes.parties import router as parties_router
from app.api.routes.devices import router as devices_router

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"] ,
    allow_headers=["*"]
)

app.include_router(auth_router)
app.include_router(me_router)
app.include_router(workouts_router)
app.include_router(routes_router)
app.include_router(adventures_router)
app.include_router(rewards_router)
app.include_router(exports_router)
app.include_router(parties_router)
app.include_router(devices_router)


@app.get("/health")
@app.get("/healthz")
def health():
    checks = {}
    overall = "ok"

    db = None
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        checks["db"] = "ok"
    except Exception:
        checks["db"] = "error"
        overall = "degraded"
    finally:
        if db:
            try:
                db.close()
            except Exception:
                pass

    try:
        redis_client.ping()
        checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "error"
        overall = "degraded"

    try:
        client = get_s3_client()
        client.list_buckets()
        checks["minio"] = "ok"
    except StorageNotConfigured:
        checks["minio"] = "disabled"
    except Exception:
        checks["minio"] = "error"
        overall = "degraded"

    status_code = status.HTTP_200_OK if checks.get("db") == "ok" else status.HTTP_503_SERVICE_UNAVAILABLE
    return JSONResponse(
        status_code=status_code,
        content={"status": overall, "checks": checks, "env": settings.env}
    )
