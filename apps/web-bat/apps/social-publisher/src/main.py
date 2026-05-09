from datetime import datetime

import httpx
from fastapi import FastAPI
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    x_enabled: bool = False
    x_dry_run: bool = True
    x_api_base_url: str = "https://api.x.com"
    x_bearer_token: str = ""
    x_access_token: str = ""


settings = Settings()
app = FastAPI(title="BAT Social Publisher", version="0.1.0")


class PublishRequest(BaseModel):
    platform: str
    body: str
    metadata: dict = {}


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "dry_run": settings.x_dry_run}


@app.post("/publish")
async def publish(payload: PublishRequest) -> dict:
    if payload.platform.lower() != "x":
        return {
            "ok": False,
            "error": "Unsupported platform",
            "platform": payload.platform,
            "timestamp": datetime.utcnow().isoformat(),
        }

    force_dry_run = bool(payload.metadata.get("force_dry_run"))
    if force_dry_run or settings.x_dry_run or not settings.x_enabled:
        return {
            "ok": True,
            "mode": "dry-run",
            "platform": "x",
            "preview": payload.body,
            "timestamp": datetime.utcnow().isoformat(),
            "note": "X publishing adapter intentionally disabled, forced dry-run, or running in dry-run mode.",
        }

    token = settings.x_bearer_token.strip() or settings.x_access_token.strip()
    if not token:
        return {
            "ok": False,
            "mode": "live",
            "platform": "x",
            "timestamp": datetime.utcnow().isoformat(),
            "error": "Missing X token. Set X_BEARER_TOKEN or X_ACCESS_TOKEN.",
        }

    request_payload: dict = {"text": payload.body[:280]}
    reply_to = str(payload.metadata.get("reply_to_tweet_id") or "").strip()
    if reply_to:
        request_payload["reply"] = {"in_reply_to_tweet_id": reply_to}

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                f"{settings.x_api_base_url.rstrip('/')}/2/tweets",
                json=request_payload,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
            )
            response.raise_for_status()
            data = response.json()
        return {
            "ok": True,
            "mode": "live",
            "platform": "x",
            "tweet_id": (data.get("data") or {}).get("id"),
            "response": data,
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as exc:
        return {
            "ok": False,
            "mode": "live",
            "platform": "x",
            "timestamp": datetime.utcnow().isoformat(),
            "error": str(exc),
        }
