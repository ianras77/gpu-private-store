import time
import redis
from app.core.config import settings


client = redis.Redis.from_url(settings.redis_url, decode_responses=True)


def rate_limit(key: str, limit: int, window_s: int) -> bool:
    try:
        now = int(time.time())
        window_key = f"rate:{key}:{now // window_s}"
        pipe = client.pipeline()
        pipe.incr(window_key, 1)
        pipe.expire(window_key, window_s)
        count, _ = pipe.execute()
        return count <= limit
    except Exception:
        return True
