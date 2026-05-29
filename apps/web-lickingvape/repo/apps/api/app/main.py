import hashlib
import hmac
import json
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import Body, Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from psycopg.rows import dict_row

from .db import audit, close_pool, init_db, open_pool, pool
from .moderation import policy_check
from .twilio_utils import validate_twilio_signature

INTERNAL_TOOL_TOKEN = os.getenv("INTERNAL_TOOL_TOKEN", "")
PHONE_HASH_SECRET = os.getenv("PHONE_HASH_SECRET") or INTERNAL_TOOL_TOKEN or "change-me"
ALLOW_PROFANITY = os.getenv("ALLOW_PROFANITY", "true").lower() == "true"
MAX_SMS_PER_MINUTE = int(os.getenv("MAX_SMS_PER_MINUTE", "5"))
SMS_RATE_WINDOW_SECONDS = int(os.getenv("SMS_RATE_WINDOW_SECONDS", "60"))
MAX_CHAT_MESSAGES_PER_WINDOW = int(os.getenv("MAX_CHAT_MESSAGES_PER_WINDOW", "6"))
CHAT_RATE_WINDOW_SECONDS = int(os.getenv("CHAT_RATE_WINDOW_SECONDS", "15"))
MAX_CHAT_MESSAGE_CHARS = int(os.getenv("MAX_CHAT_MESSAGE_CHARS", "800"))
MAX_SUBMISSION_BODY_CHARS = int(os.getenv("MAX_SUBMISSION_BODY_CHARS", "2000"))
WEB_ORIGIN = os.getenv("WEB_ORIGIN", "*")
REQUIRE_ADMIN_REVIEW = os.getenv("REQUIRE_ADMIN_REVIEW", "false").lower() == "true"
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "")
AUTH_SECRET = os.getenv("AUTH_SECRET") or INTERNAL_TOOL_TOKEN or PHONE_HASH_SECRET
SESSION_TTL_DAYS = int(os.getenv("SESSION_TTL_DAYS", "30"))
PASSWORD_ITERATIONS = int(os.getenv("PASSWORD_ITERATIONS", "240000"))
WORLD_CONTEXT_QUERY_LIMIT = int(os.getenv("WORLD_CONTEXT_QUERY_LIMIT", "4"))
WORLD_CONTEXT_ITEMS_LIMIT = int(os.getenv("WORLD_CONTEXT_ITEMS_LIMIT", "4"))
WORLD_CHAT_CONTEXT_ITEMS = int(os.getenv("WORLD_CHAT_CONTEXT_ITEMS", "3"))

HANDLE_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{2,23}$")
WORLD_SIGNAL_RE = re.compile(
    r"(news|headline|world|politic|election|war|economy|layoff|rent|inflation|current events|search\.rasies|doomscroll|timeline|internet)",
    re.IGNORECASE,
)
CONTENT_SIGNAL_RE = re.compile(r"(post|write|draft|caption|content|publish|share)", re.IGNORECASE)

DEFAULT_CHAT_MEMORY = {
    "name": "",
    "goal": "",
    "mood": "",
    "streakDays": 0,
    "lastCheckIn": "",
    "recentWin": "",
    "currentStruggle": "",
    "tabStack": "",
}

CAT_WELCOME_MESSAGE = (
    "Lights low, wall awake. I'm the Stripe Scribe. Pick a mode, bring the craving, the slip, "
    "the headline, or the life mess, and I will help you make one concrete next move."
)
WORLD_SEARCH_QUERY = "latest headlines anxiety nicotine today"
CHAT_MODES = {"craving", "post", "reset", "world"}

app = FastAPI()

if WEB_ORIGIN:
    origins = [origin.strip() for origin in WEB_ORIGIN.split(",") if origin.strip()]
else:
    origins = ["*"]

allow_credentials = False if "*" in origins else True
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _hash_phone(phone: str) -> str:
    return hmac.new(PHONE_HASH_SECRET.encode("utf-8"), phone.encode("utf-8"), hashlib.sha256).hexdigest()


def _require_internal_token(request: Request) -> None:
    token = request.headers.get("X-Internal-Token", "")
    if not INTERNAL_TOOL_TOKEN or token != INTERNAL_TOOL_TOKEN:
        raise HTTPException(status_code=403, detail="Forbidden")


def _require_admin_token(request: Request) -> None:
    if not ADMIN_TOKEN:
        return
    token = request.headers.get("X-Admin-Token", "")
    if token != ADMIN_TOKEN:
        raise HTTPException(status_code=403, detail="Forbidden")


def _get_public_url(request: Request) -> str:
    base = os.getenv("PUBLIC_BASE_URL")
    if not base:
        return str(request.url)
    path = request.url.path
    if request.url.query:
        path = f"{path}?{request.url.query}"
    return base.rstrip("/") + path


def _row_or_404(row: Optional[Dict[str, Any]], message: str) -> Dict[str, Any]:
    if not row:
        raise HTTPException(status_code=404, detail=message)
    return row


def _first_col(row: Any) -> Any:
    if row is None:
        return None
    if isinstance(row, dict):
        return next(iter(row.values()), None)
    return row[0]


def _extract_bearer_token(request: Request) -> str:
    auth = request.headers.get("Authorization", "").strip()
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = auth[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    return token


def _normalize_handle(handle: str) -> str:
    value = (handle or "").strip().lower()
    if not HANDLE_RE.match(value):
        raise HTTPException(
            status_code=400,
            detail="Handle must be 3-24 chars with lowercase letters, numbers, _ or -",
        )
    return value


def _hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        PASSWORD_ITERATIONS,
    ).hex()


def _verify_password(password: str, salt: str, expected_hash: str) -> bool:
    candidate = _hash_password(password, salt)
    return hmac.compare_digest(candidate, expected_hash)


def _hash_session_token(token: str) -> str:
    return hmac.new(AUTH_SECRET.encode("utf-8"), token.encode("utf-8"), hashlib.sha256).hexdigest()


def _new_session_token() -> str:
    return secrets.token_urlsafe(32)


def _public_user(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "handle": row["handle"],
        "display_name": row.get("display_name") or row["handle"],
        "created_at": row.get("created_at"),
        "last_login_at": row.get("last_login_at"),
    }


def _memory_from_row(row: Dict[str, Any]) -> Dict[str, Any]:
    raw = row.get("chat_profile_json")
    if isinstance(raw, dict):
        return {**DEFAULT_CHAT_MEMORY, **raw}
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return {**DEFAULT_CHAT_MEMORY, **parsed}
        except json.JSONDecodeError:
            pass
    return dict(DEFAULT_CHAT_MEMORY)


def _sanitize_chat_memory(current: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(DEFAULT_CHAT_MEMORY)
    merged.update(current or {})

    if "name" in incoming:
        merged["name"] = str(incoming.get("name") or "").strip()[:60]
    if "goal" in incoming:
        merged["goal"] = str(incoming.get("goal") or "").strip()[:240]
    if "mood" in incoming:
        merged["mood"] = str(incoming.get("mood") or "").strip()[:80]
    if "lastCheckIn" in incoming:
        merged["lastCheckIn"] = str(incoming.get("lastCheckIn") or "").strip()[:60]
    if "recentWin" in incoming:
        merged["recentWin"] = str(incoming.get("recentWin") or "").strip()[:220]
    if "currentStruggle" in incoming:
        merged["currentStruggle"] = str(incoming.get("currentStruggle") or "").strip()[:220]
    if "tabStack" in incoming:
        merged["tabStack"] = str(incoming.get("tabStack") or "").strip()[:220]
    if "streakDays" in incoming:
        try:
            streak = int(incoming.get("streakDays") or 0)
        except (TypeError, ValueError):
            streak = 0
        merged["streakDays"] = max(0, min(streak, 5000))

    return merged


def _infer_mood(text: str) -> Optional[str]:
    lower = text.lower()
    if re.search(r"(anxious|panic|stressed|spiral|overwhelmed)", lower):
        return "anxious"
    if re.search(r"(sad|down|empty|numb|low)", lower):
        return "low"
    if re.search(r"(proud|good|strong|better|steady)", lower):
        return "steadier"
    if re.search(r"(angry|mad|frustrated|irritated)", lower):
        return "frustrated"
    return None


def _infer_goal(text: str) -> Optional[str]:
    lower = text.lower()
    match = re.search(r"(goal is|my goal is|i want to|i'm trying to|i am trying to)\s+(.+)", lower)
    if not match or not match.group(2):
        return None
    goal = match.group(2).strip()
    if not goal:
        return None
    return goal[0].upper() + goal[1:]


def _infer_tab_stack(text: str) -> Optional[str]:
    if WORLD_SIGNAL_RE.search(text or ""):
        return text[:220]
    return None


def _is_world_message(text: str) -> bool:
    return bool(WORLD_SIGNAL_RE.search(text or ""))


def _is_content_message(text: str) -> bool:
    return bool(CONTENT_SIGNAL_RE.search(text or ""))


def _build_memory_thread(memory: Dict[str, Any]) -> str:
    reminders: List[str] = []

    goal = str(memory.get("goal") or "").strip()
    mood = str(memory.get("mood") or "").strip()
    streak = int(memory.get("streakDays") or 0)
    recent_win = str(memory.get("recentWin") or "").strip()
    struggle = str(memory.get("currentStruggle") or "").strip()
    tab_stack = str(memory.get("tabStack") or "").strip()

    if goal:
        reminders.append(f"goal: {goal}")
    if streak > 0:
        reminders.append(f"streak: {streak} day(s)")
    if mood:
        reminders.append(f"room tone: {mood}")
    if recent_win:
        reminders.append(f"recent receipt: {recent_win}")
    if struggle:
        reminders.append(f"what feels loud: {struggle}")
    if tab_stack:
        reminders.append(f"tab stack: {tab_stack}")

    return f"I still have your thread: {' | '.join(reminders)}." if reminders else ""


def _build_cat_reply(text: str, memory: Dict[str, Any], world_context: str = "", mode: Optional[str] = None) -> str:
    lower = text.lower()
    name = memory.get("name", "").strip() or memory.get("display_name", "").strip() or "friend"
    thread = _build_memory_thread(memory)
    post_frame = "Three beats. Scene, ache, next move. Rough edges are welcome."
    mode = mode if mode in CHAT_MODES else None

    if mode == "craving":
        return (
            f"{name}, beat the first stripe before you debate the whole beast. {thread} "
            "Move the vape or buying path farther away, name the stripe out loud, drink something cold, "
            "and write one wall sentence: what happened, what it promised, what you are doing instead."
        ).strip()

    if mode == "post":
        return (
            f"{name}, Draft it like a wall post. {thread} "
            "Scene / trigger / refusal. One paragraph, no apology tax. Start with: \"The stripe I am fighting is...\" "
            "and end with the next move you can prove."
        ).strip()

    if mode == "reset":
        return (
            f"{name}, one slip does not get a crown. {thread} "
            "Write the receipt while it is boring: what happened, what lit it, what changes before bed. "
            "Then do one physical reset: route, drawer, app, card, or room."
        ).strip()

    if mode == "world" or _is_world_message(lower):
        world_line = f"Latest pulse on the wall: {world_context} " if world_context else ""
        return (
            f"{name}, the outside world is in the room with us. {thread} "
            f"{world_line}"
            f'Run one tight search on search.rasies.com, not a doomscroll marathon. Try "{WORLD_SEARCH_QUERY}" '
            'or the exact headline plus "nicotine" or "stress". Then come back and give me '
            f"{post_frame.lower()}"
        ).strip()

    if _is_content_message(lower):
        world_line = f" The wall right now: {world_context}." if world_context else ""
        return (
            f"{name}, let's make it postable. {thread} "
            f"{post_frame} Start ugly. We can sharpen after it exists.{world_line}"
        ).strip()

    if re.search(r"(slip|relapse|i hit|i caved|bought a vape)", lower):
        return (
            f"{name}, no gothic shame spiral. {thread} "
            "Give me the boring true version: what happened, what lit the fuse, and what changes before tonight ends."
        ).strip()

    if re.search(r"(craving|urge|want a hit|need nicotine)", lower):
        return (
            f"{name}, keep the lights low and the plan sharp. {thread} "
            "Water. Jaw unclenched. Move the device farther away. Then post one line before you bargain with the craving."
        ).strip()

    if re.search(r"(win|proud|did it|made it|success)", lower):
        return (
            f"Archive that, {name}. {thread} "
            "Put the win in the feed so future-you has evidence on the next ugly night."
        ).strip()

    if re.search(r"(night|sleep|2am|late)", lower):
        return (
            f"{name}, late-night brain is a liar with great lighting. {thread} "
            "Let's make a short script: tea or cold water, timer, one post, phone farther away, lights lower."
        ).strip()

    return (
        f"{name}, I am here and the room is still open. {thread} "
        "Tell me the sharpest part of the scene and we will cut it down to one next move."
    ).strip()


def _load_world_context(
    limit_queries: int = WORLD_CONTEXT_QUERY_LIMIT,
    limit_items: int = WORLD_CONTEXT_ITEMS_LIMIT,
    query: Optional[str] = None,
) -> Dict[str, Any]:
    limit_queries = max(1, min(limit_queries, 12))
    limit_items = max(1, min(limit_items, 12))

    query_filter = str(query or "").strip() or None
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            if query_filter:
                runs = cur.execute(
                    """
                    SELECT id, query, topic, angle, categories, fetched_at, result_count, top_summary
                    FROM world_pulse_runs
                    WHERE status = 'ok' AND query = %s
                    ORDER BY fetched_at DESC
                    LIMIT %s;
                    """,
                    (query_filter, limit_queries),
                ).fetchall()
            else:
                runs = cur.execute(
                    """
                    SELECT id, query, topic, angle, categories, fetched_at, result_count, top_summary
                    FROM (
                        SELECT DISTINCT ON (query)
                            id, query, topic, angle, categories, fetched_at, result_count, top_summary
                        FROM world_pulse_runs
                        WHERE status = 'ok'
                        ORDER BY query, fetched_at DESC
                    ) latest_runs
                    ORDER BY fetched_at DESC
                    LIMIT %s;
                    """,
                    (limit_queries,),
                ).fetchall()

            payload_runs: List[Dict[str, Any]] = []
            summary_bits: List[str] = []

            for run in runs:
                items = cur.execute(
                    """
                    SELECT title, url, snippet, source, engine, category, published_at, score, rank
                    FROM world_pulse_items
                    WHERE last_run_id = %s
                    ORDER BY rank ASC, score DESC NULLS LAST
                    LIMIT %s;
                    """,
                    (run["id"], limit_items),
                ).fetchall()
                serialized_items = [dict(item) for item in items]

                for item in serialized_items[:2]:
                    source = item.get("source") or item.get("engine") or "source"
                    summary_bits.append(f"{source}: {item.get('title')}")

                payload_runs.append(
                    {
                        "id": run["id"],
                        "query": run["query"],
                        "topic": run["topic"],
                        "angle": run["angle"],
                        "categories": run["categories"],
                        "fetched_at": run["fetched_at"],
                        "result_count": run["result_count"],
                        "top_summary": run.get("top_summary"),
                        "items": serialized_items,
                    }
                )

            latest_post = cur.execute(
                """
                SELECT a.id, a.source_query, a.topic, a.angle, a.status, a.created_at,
                       p.id AS post_id, p.body, p.display_name, p.published_at
                FROM autopilot_posts a
                LEFT JOIN posts p ON p.id = a.post_id
                ORDER BY a.created_at DESC
                LIMIT 1;
                """
            ).fetchone()

    updated_at = payload_runs[0]["fetched_at"] if payload_runs else None
    return {
        "updated_at": updated_at,
        "summary": " | ".join(summary_bits[:4]),
        "queries": payload_runs,
        "autopilot": {"last_post": dict(latest_post) if latest_post else None},
    }


def _create_session(conn: Any, user_id: int, user_agent: str = "") -> str:
    token = _new_session_token()
    token_hash = _hash_session_token(token)
    expires_at = datetime.now(timezone.utc) + timedelta(days=SESSION_TTL_DAYS)
    conn.execute(
        """
        INSERT INTO user_sessions (user_id, token_hash, expires_at, user_agent)
        VALUES (%s, %s, %s, %s);
        """,
        (user_id, token_hash, expires_at, user_agent[:300] if user_agent else None),
    )
    return token


def _require_user_session(request: Request) -> Dict[str, Any]:
    token = _extract_bearer_token(request)
    token_hash = _hash_session_token(token)
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            row = cur.execute(
                """
                SELECT u.id, u.handle, u.display_name, u.created_at, u.last_login_at, u.chat_profile_json,
                       s.id AS session_id
                FROM user_sessions s
                JOIN users u ON u.id = s.user_id
                WHERE s.token_hash = %s
                  AND s.expires_at > NOW()
                LIMIT 1;
                """,
                (token_hash,),
            ).fetchone()
            if not row:
                raise HTTPException(status_code=401, detail="Invalid or expired session")
            cur.execute("UPDATE user_sessions SET last_seen_at = NOW() WHERE id = %s;", (row["session_id"],))
            conn.commit()
            return row


def _optional_user_session(request: Request) -> Optional[Dict[str, Any]]:
    auth = request.headers.get("Authorization", "").strip()
    if not auth:
        return None
    try:
        return _require_user_session(request)
    except HTTPException:
        return None


@app.on_event("startup")
def startup() -> None:
    open_pool()
    init_db()


@app.on_event("shutdown")
def shutdown() -> None:
    close_pool()


@app.get("/health")
@app.get("/healthz")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/auth/register")
def auth_register(request: Request, payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    handle = _normalize_handle(payload.get("handle") or "")
    password = str(payload.get("password") or "")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    display_name = str(payload.get("display_name") or "").strip() or handle
    salt = secrets.token_hex(16)
    password_hash = _hash_password(password, salt)

    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            existing = cur.execute("SELECT id FROM users WHERE handle = %s;", (handle,)).fetchone()
            if existing:
                raise HTTPException(status_code=409, detail="Handle is already taken")

            user = cur.execute(
                """
                INSERT INTO users (handle, display_name, password_hash, password_salt)
                VALUES (%s, %s, %s, %s)
                RETURNING id, handle, display_name, created_at, last_login_at, chat_profile_json;
                """,
                (handle, display_name, password_hash, salt),
            ).fetchone()
            user_id = int(user["id"])
            token = _create_session(conn, user_id, request.headers.get("user-agent", ""))
            conn.execute("UPDATE users SET last_login_at = NOW() WHERE id = %s;", (user_id,))
            audit(conn, "system", "user_registered", {"user_id": user_id, "handle": handle})
            conn.commit()

    return {"token": token, "user": _public_user(user)}


@app.post("/auth/login")
def auth_login(request: Request, payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    handle = _normalize_handle(payload.get("handle") or "")
    password = str(payload.get("password") or "")
    if not password:
        raise HTTPException(status_code=400, detail="Password is required")

    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            user = cur.execute(
                """
                SELECT id, handle, display_name, created_at, last_login_at, chat_profile_json,
                       password_hash, password_salt
                FROM users
                WHERE handle = %s
                LIMIT 1;
                """,
                (handle,),
            ).fetchone()
            if not user:
                raise HTTPException(status_code=401, detail="Invalid credentials")

            if not _verify_password(password, user["password_salt"], user["password_hash"]):
                raise HTTPException(status_code=401, detail="Invalid credentials")

            token = _create_session(conn, int(user["id"]), request.headers.get("user-agent", ""))
            cur.execute("UPDATE users SET last_login_at = NOW() WHERE id = %s;", (user["id"],))
            audit(conn, "system", "user_logged_in", {"user_id": user["id"]})
            conn.commit()

    return {"token": token, "user": _public_user(user)}


@app.get("/auth/me")
def auth_me(user: Dict[str, Any] = Depends(_require_user_session)) -> Dict[str, Any]:
    return {"user": _public_user(user)}


@app.post("/auth/logout")
def auth_logout(request: Request) -> Dict[str, Any]:
    token_hash = _hash_session_token(_extract_bearer_token(request))
    with pool.connection() as conn:
        conn.execute("DELETE FROM user_sessions WHERE token_hash = %s;", (token_hash,))
        conn.commit()
    return {"status": "ok"}


@app.get("/chat/state")
def chat_state(user: Dict[str, Any] = Depends(_require_user_session)) -> Dict[str, Any]:
    memory = _memory_from_row(user)
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            rows = cur.execute(
                """
                SELECT id, role, body, created_at
                FROM user_chat_messages
                WHERE user_id = %s
                ORDER BY created_at DESC, id DESC
                LIMIT 40;
                """,
                (user["id"],),
            ).fetchall()

    messages = [
        {"id": row["id"], "role": row["role"], "text": row["body"], "at": row["created_at"]}
        for row in reversed(rows)
    ]
    if not messages:
        messages = [
            {
                "id": "cat-welcome",
                "role": "cat",
                "text": CAT_WELCOME_MESSAGE,
                "at": datetime.now(timezone.utc).isoformat(),
            }
        ]
    return {"memory": memory, "messages": messages}


@app.post("/chat/state")
def update_chat_state(
    payload: Dict[str, Any] = Body(...),
    user: Dict[str, Any] = Depends(_require_user_session),
) -> Dict[str, Any]:
    incoming = payload.get("memory") if isinstance(payload.get("memory"), dict) else payload
    if not isinstance(incoming, dict):
        raise HTTPException(status_code=400, detail="memory must be an object")

    current = _memory_from_row(user)
    next_memory = _sanitize_chat_memory(current, incoming)

    with pool.connection() as conn:
        conn.execute(
            """
            UPDATE users
            SET chat_profile_json = %s, chat_updated_at = NOW()
            WHERE id = %s;
            """,
            (json.dumps(next_memory), user["id"]),
        )
        conn.commit()
    return {"memory": next_memory}


@app.post("/chat/reply")
def chat_reply(
    payload: Dict[str, Any] = Body(...),
    user: Dict[str, Any] = Depends(_require_user_session),
) -> Dict[str, Any]:
    message = str(payload.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="message is required")
    if len(message) > MAX_CHAT_MESSAGE_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"message must be <= {MAX_CHAT_MESSAGE_CHARS} characters",
        )

    base_memory = _memory_from_row(user)
    inferred_updates: Dict[str, Any] = {"lastCheckIn": datetime.now(timezone.utc).isoformat()}

    inferred_mood = _infer_mood(message)
    inferred_goal = _infer_goal(message)
    inferred_tab_stack = _infer_tab_stack(message)
    if inferred_mood:
        inferred_updates["mood"] = inferred_mood
    if inferred_goal:
        inferred_updates["goal"] = inferred_goal
    if inferred_tab_stack:
        inferred_updates["tabStack"] = inferred_tab_stack

    # Treat explicit success/struggle phrasing as durable context for future replies.
    if re.search(r"(win|proud|did it|made it|success)", message.lower()):
        inferred_updates["recentWin"] = message[:220]
    if re.search(r"(craving|urge|spiral|slip|hard|struggle)", message.lower()):
        inferred_updates["currentStruggle"] = message[:220]

    next_memory = _sanitize_chat_memory(base_memory, inferred_updates)
    reply_context = {
        **next_memory,
        "display_name": user.get("display_name") or user.get("handle") or "",
    }
    world_context = ""
    mode = str(payload.get("mode") or "").strip().lower()
    mode = mode if mode in CHAT_MODES else None
    if mode == "world" or _is_world_message(message) or _is_content_message(message):
        world_context = _load_world_context(limit_queries=2, limit_items=WORLD_CHAT_CONTEXT_ITEMS).get("summary", "")
    reply = _build_cat_reply(message, reply_context, world_context=world_context, mode=mode)

    with pool.connection() as conn:
        recent_message_count = _first_col(
            conn.execute(
                """
                SELECT COUNT(*)
                FROM user_chat_messages
                WHERE user_id = %s
                  AND role = 'user'
                  AND created_at > NOW() - (%s * INTERVAL '1 second');
                """,
                (user["id"], CHAT_RATE_WINDOW_SECONDS),
            ).fetchone()
        )
        if recent_message_count is not None and int(recent_message_count) >= MAX_CHAT_MESSAGES_PER_WINDOW:
            raise HTTPException(status_code=429, detail="Too many chat messages. Slow down for a few seconds.")

        conn.execute(
            "INSERT INTO user_chat_messages (user_id, role, body) VALUES (%s, 'user', %s);",
            (user["id"], message),
        )
        conn.execute(
            "INSERT INTO user_chat_messages (user_id, role, body) VALUES (%s, 'cat', %s);",
            (user["id"], reply),
        )
        conn.execute(
            """
            UPDATE users
            SET chat_profile_json = %s, chat_updated_at = NOW()
            WHERE id = %s;
            """,
            (json.dumps(next_memory), user["id"]),
        )
        conn.execute(
            """
            DELETE FROM user_chat_messages
            WHERE user_id = %s
              AND id NOT IN (
                SELECT id
                FROM user_chat_messages
                WHERE user_id = %s
                ORDER BY created_at DESC, id DESC
                LIMIT 250
              );
            """,
            (user["id"], user["id"]),
        )
        with conn.cursor(row_factory=dict_row) as cur:
            rows = cur.execute(
                """
                SELECT id, role, body, created_at
                FROM user_chat_messages
                WHERE user_id = %s
                ORDER BY created_at DESC, id DESC
                LIMIT 40;
                """,
                (user["id"],),
            ).fetchall()
        conn.commit()

    messages = [
        {"id": row["id"], "role": row["role"], "text": row["body"], "at": row["created_at"]}
        for row in reversed(rows)
    ]
    return {"reply": reply, "memory": next_memory, "messages": messages}


@app.post("/chat/reset")
def chat_reset(user: Dict[str, Any] = Depends(_require_user_session)) -> Dict[str, Any]:
    with pool.connection() as conn:
        conn.execute("DELETE FROM user_chat_messages WHERE user_id = %s;", (user["id"],))
        conn.execute(
            """
            UPDATE users
            SET chat_profile_json = %s, chat_updated_at = NOW()
            WHERE id = %s;
            """,
            (json.dumps(DEFAULT_CHAT_MEMORY), user["id"]),
        )
        conn.commit()
    return {"memory": dict(DEFAULT_CHAT_MEMORY), "messages": []}


@app.get("/posts")
def list_posts(limit: int = 20, offset: int = 0) -> Dict[str, Any]:
    limit = max(1, min(limit, 50))
    offset = max(offset, 0)
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            rows = cur.execute(
                """
                SELECT id, author_type, display_name, body, body_original, status, created_at, published_at, tags
                FROM posts
                WHERE status = 'published'
                ORDER BY published_at DESC NULLS LAST, created_at DESC
                LIMIT %s OFFSET %s;
                """,
                (limit, offset),
            ).fetchall()
    return {"posts": rows, "limit": limit, "offset": offset}


@app.get("/stats")
def stats() -> Dict[str, int]:
    with pool.connection() as conn:
        published_posts = _first_col(
            conn.execute("SELECT COUNT(*) FROM posts WHERE status = 'published';").fetchone()
        )
        queued_submissions = _first_col(
            conn.execute("SELECT COUNT(*) FROM submissions WHERE status = 'queued';").fetchone()
        )
        total_submissions = _first_col(conn.execute("SELECT COUNT(*) FROM submissions;").fetchone())
    return {
        "published_posts": published_posts,
        "queued_submissions": queued_submissions,
        "total_submissions": total_submissions,
    }


@app.get("/world/context")
def world_context(limit_queries: int = WORLD_CONTEXT_QUERY_LIMIT, limit_items: int = WORLD_CONTEXT_ITEMS_LIMIT) -> Dict[str, Any]:
    return _load_world_context(limit_queries=limit_queries, limit_items=limit_items)


@app.get("/site_settings")
def site_settings() -> Dict[str, Any]:
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            row = cur.execute(
                "SELECT theme_json, about_md, shoutout_md, updated_at FROM site_settings WHERE id=1;"
            ).fetchone()
    return row or {}


@app.post("/submit")
def submit_post(request: Request, payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    body = (payload.get("body") or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="Body is required")
    if len(body) > MAX_SUBMISSION_BODY_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Body must be <= {MAX_SUBMISSION_BODY_CHARS} characters",
        )
    anonymous = bool(payload.get("anonymous"))
    display_name = None if anonymous else payload.get("display_name")
    if display_name is not None:
        display_name = str(display_name).strip()[:60] or None
    user = _optional_user_session(request)
    if user and not display_name and not anonymous:
        display_name = user.get("display_name") or user.get("handle")

    note_payload: Dict[str, Any] = {}
    if display_name:
        note_payload["display_name"] = display_name
    if user:
        note_payload["user_id"] = user.get("id")
        note_payload["handle"] = user.get("handle")
    notes = json.dumps(note_payload) if note_payload else None

    with pool.connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO submissions (source, from_phone, body_raw, status, moderation_notes)
            VALUES ('web', NULL, %s, 'queued', %s)
            RETURNING id;
            """,
            (body, notes),
        )
        submission_id = _first_col(cursor.fetchone())
        audit(conn, "system", "submission_created", {"submission_id": submission_id, "source": "web"})
        conn.commit()
    return {"submission_id": submission_id}


@app.post("/webhooks/sms/twilio")
async def twilio_webhook(request: Request) -> PlainTextResponse:
    form = await request.form()
    form_dict = {k: str(v) for k, v in form.items()}
    signature = request.headers.get("X-Twilio-Signature", "")
    url = _get_public_url(request)

    if not validate_twilio_signature(url, form_dict, signature):
        raise HTTPException(status_code=403, detail="Invalid Twilio signature")

    body = (form_dict.get("Body") or "").strip()
    from_phone = form_dict.get("From")
    if not body:
        return PlainTextResponse("OK")

    phone_hash = _hash_phone(from_phone) if from_phone else None

    with pool.connection() as conn:
        if phone_hash:
            count_row = conn.execute(
                """
                SELECT COUNT(*) AS count
                FROM submissions
                WHERE from_phone = %s
                AND received_at > NOW() - (%s * INTERVAL '1 second');
                """,
                (phone_hash, SMS_RATE_WINDOW_SECONDS),
            ).fetchone()
            if count_row and _first_col(count_row) >= MAX_SMS_PER_MINUTE:
                raise HTTPException(status_code=429, detail="Rate limit exceeded")

        cursor = conn.execute(
            """
            INSERT INTO submissions (source, from_phone, body_raw, status, moderation_notes)
            VALUES ('sms', %s, %s, 'queued', NULL)
            RETURNING id;
            """,
            (phone_hash, body),
        )
        submission_id = _first_col(cursor.fetchone())
        audit(conn, "system", "submission_created", {"submission_id": submission_id, "source": "sms"})
        conn.commit()

    return PlainTextResponse("OK")


@app.get("/admin/queue")
def admin_queue(limit: int = 50, _: Any = Depends(_require_admin_token)) -> Dict[str, Any]:
    limit = max(1, min(limit, 100))
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            rows = cur.execute(
                """
                SELECT s.id, s.source, s.from_phone, s.body_raw, s.received_at, s.status,
                       s.moderation_notes, s.post_id, p.status AS post_status
                FROM submissions s
                LEFT JOIN posts p ON p.id = s.post_id
                WHERE s.status IN ('queued', 'flagged')
                   OR (s.status = 'approved' AND p.status = 'queued')
                ORDER BY s.received_at ASC
                LIMIT %s;
                """,
                (limit,),
            ).fetchall()

    for row in rows:
        notes = row.get("moderation_notes")
        if notes:
            try:
                row["moderation_notes"] = json.loads(notes)
            except json.JSONDecodeError:
                row["moderation_notes"] = {"notes": notes}
    return {"queue": rows, "limit": limit}


@app.post("/admin/publish/{submission_id}")
def admin_publish(
    submission_id: int,
    payload: Dict[str, Any] = Body(default=None),
    _: Any = Depends(_require_admin_token),
) -> Dict[str, Any]:
    payload = payload or {}
    body_override = payload.get("body")
    tags = payload.get("tags") or []
    display_name = payload.get("display_name")

    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            submission = cur.execute(
                "SELECT * FROM submissions WHERE id = %s;",
                (submission_id,),
            ).fetchone()
        _row_or_404(submission, "Submission not found")

        body = (body_override or submission["body_raw"]).strip()
        if not body:
            raise HTTPException(status_code=400, detail="Body is required")

        if not display_name and submission.get("moderation_notes"):
            try:
                notes = json.loads(submission["moderation_notes"])
                display_name = notes.get("display_name")
            except json.JSONDecodeError:
                pass

        post_id = submission.get("post_id")
        if post_id:
            updates = ["body = %s", "status = 'published'", "published_at = NOW()"]
            values: List[Any] = [body]
            if tags:
                updates.append("tags = %s")
                values.append(tags)
            if display_name:
                updates.append("display_name = %s")
                values.append(display_name)
            values.append(post_id)
            conn.execute(
                f"UPDATE posts SET {', '.join(updates)} WHERE id = %s;",
                values,
            )
        else:
            author_type = "sms" if submission["source"] == "sms" else "web"
            status = "published"
            published_at = datetime.now(timezone.utc)

            cursor = conn.execute(
                """
                INSERT INTO posts (author_type, display_name, body, body_original, status, published_at, tags)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id;
                """,
                (author_type, display_name, body, submission["body_raw"], status, published_at, tags),
            )
            post_id = _first_col(cursor.fetchone())

        conn.execute(
            """
            UPDATE submissions
            SET status = 'approved', post_id = %s
            WHERE id = %s;
            """,
            (post_id, submission_id),
        )
        audit(conn, "admin", "submission_published", {"submission_id": submission_id, "post_id": post_id})
        conn.commit()

    return {"post_id": post_id}


@app.post("/admin/reject/{submission_id}")
def admin_reject(
    submission_id: int,
    payload: Dict[str, Any] = Body(default=None),
    _: Any = Depends(_require_admin_token),
) -> Dict[str, Any]:
    payload = payload or {}
    reason = payload.get("reason")

    with pool.connection() as conn:
        conn.execute(
            """
            UPDATE submissions
            SET status = 'rejected', moderation_notes = %s
            WHERE id = %s;
            """,
            (json.dumps({"reason": reason}) if reason else None, submission_id),
        )
        audit(conn, "admin", "submission_rejected", {"submission_id": submission_id, "reason": reason})
        conn.commit()

    return {"status": "rejected"}


@app.post("/admin/create")
def admin_create(payload: Dict[str, Any] = Body(...), _: Any = Depends(_require_admin_token)) -> Dict[str, Any]:
    body = (payload.get("body") or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="Body is required")

    status = payload.get("status", "draft")
    if status not in {"draft", "published"}:
        raise HTTPException(status_code=400, detail="Invalid status")

    published_at = datetime.now(timezone.utc) if status == "published" else None
    tags = payload.get("tags") or []

    with pool.connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO posts (author_type, display_name, body, body_original, status, published_at, tags)
            VALUES ('admin', NULL, %s, %s, %s, %s, %s)
            RETURNING id;
            """,
            (body, body, status, published_at, tags),
        )
        post_id = _first_col(cursor.fetchone())
        audit(conn, "admin", "post_created", {"post_id": post_id, "status": status})
        conn.commit()
    return {"post_id": post_id}


@app.post("/internal/tools/create_post")
def tool_create_post(
    payload: Dict[str, Any] = Body(...),
    _: Any = Depends(_require_internal_token),
) -> Dict[str, Any]:
    body = (payload.get("body") or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="Body is required")
    author_type = payload.get("author_type", "admin")
    display_name = payload.get("display_name")
    status = payload.get("status", "draft")
    tags = payload.get("tags") or []

    with pool.connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO posts (author_type, display_name, body, body_original, status, tags)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id;
            """,
            (author_type, display_name, body, payload.get("body_original"), status, tags),
        )
        post_id = _first_col(cursor.fetchone())
        audit(conn, "cat", "post_created", {"post_id": post_id, "status": status})
        conn.commit()
    return {"post_id": post_id}


@app.post("/internal/tools/update_post")
def tool_update_post(
    payload: Dict[str, Any] = Body(...),
    _: Any = Depends(_require_internal_token),
) -> Dict[str, Any]:
    post_id = payload.get("post_id")
    if not post_id:
        raise HTTPException(status_code=400, detail="post_id is required")

    updates = []
    values = []
    for key in ("body", "status", "tags", "display_name"):
        if key in payload:
            updates.append(f"{key} = %s")
            values.append(payload[key])

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    values.append(post_id)
    with pool.connection() as conn:
        conn.execute(
            f"UPDATE posts SET {', '.join(updates)} WHERE id = %s;",
            values,
        )
        audit(conn, "cat", "post_updated", {"post_id": post_id, "fields": list(payload.keys())})
        conn.commit()

    return {"post_id": post_id}


@app.post("/internal/tools/publish_post")
def tool_publish_post(
    payload: Dict[str, Any] = Body(...),
    _: Any = Depends(_require_internal_token),
) -> Dict[str, Any]:
    post_id = payload.get("post_id")
    if not post_id:
        raise HTTPException(status_code=400, detail="post_id is required")

    with pool.connection() as conn:
        conn.execute(
            """
            UPDATE posts
            SET status = 'published', published_at = NOW()
            WHERE id = %s;
            """,
            (post_id,),
        )
        audit(conn, "cat", "post_published", {"post_id": post_id})
        conn.commit()
    return {"post_id": post_id}


@app.post("/internal/tools/reject_submission")
def tool_reject_submission(
    payload: Dict[str, Any] = Body(...),
    _: Any = Depends(_require_internal_token),
) -> Dict[str, Any]:
    submission_id = payload.get("submission_id")
    if not submission_id:
        raise HTTPException(status_code=400, detail="submission_id is required")
    reason = payload.get("reason")

    with pool.connection() as conn:
        conn.execute(
            """
            UPDATE submissions
            SET status = 'rejected', moderation_notes = %s
            WHERE id = %s;
            """,
            (json.dumps({"reason": reason}) if reason else None, submission_id),
        )
        audit(conn, "cat", "submission_rejected", {"submission_id": submission_id, "reason": reason})
        conn.commit()
    return {"submission_id": submission_id, "status": "rejected"}


@app.post("/internal/tools/world_context")
def tool_world_context(
    payload: Dict[str, Any] = Body(default=None),
    _: Any = Depends(_require_internal_token),
) -> Dict[str, Any]:
    payload = payload or {}
    try:
        limit_queries = int(payload.get("limit_queries", WORLD_CONTEXT_QUERY_LIMIT))
    except (TypeError, ValueError):
        limit_queries = WORLD_CONTEXT_QUERY_LIMIT
    try:
        limit_items = int(payload.get("limit_items", WORLD_CONTEXT_ITEMS_LIMIT))
    except (TypeError, ValueError):
        limit_items = WORLD_CONTEXT_ITEMS_LIMIT
    query = payload.get("query")
    return _load_world_context(limit_queries=limit_queries, limit_items=limit_items, query=query)


@app.post("/internal/tools/update_theme")
def tool_update_theme(
    payload: Dict[str, Any] = Body(...),
    _: Any = Depends(_require_internal_token),
) -> Dict[str, Any]:
    theme_json = payload.get("theme_json")
    if not isinstance(theme_json, dict):
        raise HTTPException(status_code=400, detail="theme_json must be an object")

    allowed_keys = {
        "body_font",
        "heading_font",
        "base_font_size",
        "line_height",
        "max_width",
        "spacing",
        "bg",
        "bg_2",
        "bg_3",
        "text",
        "muted",
        "accent",
        "accent_2",
        "accent_3",
        "surface",
        "surface_strong",
        "divider",
    }
    cleaned = {key: theme_json[key] for key in theme_json if key in allowed_keys}

    with pool.connection() as conn:
        conn.execute(
            """
            UPDATE site_settings
            SET theme_json = %s, updated_at = NOW()
            WHERE id = 1;
            """,
            (json.dumps(cleaned),),
        )
        audit(conn, "cat", "theme_updated", {"theme_json": cleaned})
        conn.commit()
    return {"status": "ok", "theme_json": cleaned}


@app.post("/internal/tools/review_submission")
def tool_review_submission(
    payload: Dict[str, Any] = Body(...),
    _: Any = Depends(_require_internal_token),
) -> Dict[str, Any]:
    """Lightweight policy check fallback when the LLM sidecar is unavailable."""
    body = (payload.get("body_raw") or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="body_raw is required")

    decision = policy_check(body, allow_profanity=ALLOW_PROFANITY)
    return {
        "decision": decision.decision,
        "reasons": decision.reasons,
        "cleaned_body": body,
        "tags": [],
        "suggested_title": None,
    }
