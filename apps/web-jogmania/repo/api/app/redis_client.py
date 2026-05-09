from typing import Optional
import redis

from app.settings import get_settings

settings = get_settings()


class DummyRedis:
    def __init__(self):
        self.store: dict[str, int] = {}

    def incr(self, key: str) -> int:
        self.store[key] = self.store.get(key, 0) + 1
        return self.store[key]

    def expire(self, key: str, seconds: int) -> None:
        return None


def get_redis() -> Optional[redis.Redis]:
    try:
        client = redis.from_url(settings.REDIS_URL, decode_responses=True)
        client.ping()
        return client
    except Exception:
        return None


def rate_limit_login(email: str, ip: str, limit: int = 5, window_seconds: int = 600) -> None:
    client = get_redis()
    if client is None:
        client = DummyRedis()

    key = f"rl:login:{email}:{ip}"
    try:
        count = client.incr(key)
        if count == 1:
            client.expire(key, window_seconds)
        if count > limit:
            raise ValueError("rate_limited")
    except Exception as exc:
        if str(exc) == "rate_limited":
            raise
        return None
