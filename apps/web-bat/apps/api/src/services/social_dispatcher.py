import httpx

from config import settings
from models import SocialPost
from services.structured_logging import get_logger, log_event

logger = get_logger("bat.social_dispatcher")


async def dispatch_social_post(post: SocialPost, *, force_dry_run: bool = False) -> dict:
    publish_payload = {
        "platform": post.platform,
        "body": post.body,
        "metadata": {**(post.meta or {}), "force_dry_run": force_dry_run},
    }
    response_payload = {"mode": "dry-run", "ok": True}
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            resp = await client.post(f"{settings.social_publisher_url.rstrip('/')}/publish", json=publish_payload)
            resp.raise_for_status()
            response_payload = resp.json()
        log_event(
            logger,
            "social_dispatch.success",
            platform=post.platform,
            post_id=str(post.id),
            dry_run=force_dry_run,
            response=response_payload,
        )
    except Exception as exc:  # noqa: BLE001
        log_event(
            logger,
            "social_dispatch.failed",
            level=40,
            platform=post.platform,
            post_id=str(post.id),
            error=str(exc),
        )
        response_payload = {"mode": "dry-run", "ok": True, "fallback": True}
    return response_payload
