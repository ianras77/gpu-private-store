import argparse
import hashlib
import json
import os
import re
import time
import traceback
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import requests
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from moderation import parse_review_payload, policy_check

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://lickingvape:lickingvape@db:5432/lickingvape")
CAT_REVIEW_ENDPOINT = os.getenv("CAT_REVIEW_ENDPOINT")
CAT_DRAFT_ENDPOINT = os.getenv("CAT_DRAFT_ENDPOINT", "http://cat:80/custom/editor/draft")
CAT_INTERNAL_TOKEN = os.getenv("CAT_INTERNAL_TOKEN", os.getenv("INTERNAL_TOOL_TOKEN", ""))
CAT_API_KEY = os.getenv("CAT_API_KEY", "")
CAT_USER_ID = os.getenv("CAT_USER_ID", "")
ALLOW_PROFANITY = os.getenv("ALLOW_PROFANITY", "true").lower() == "true"
REQUIRE_ADMIN_REVIEW = os.getenv("REQUIRE_ADMIN_REVIEW", "false").lower() == "true"
POLL_SECONDS = int(os.getenv("WORKER_POLL_SECONDS", "10"))
BATCH_SIZE = int(os.getenv("WORKER_BATCH_SIZE", "10"))

WORLD_INGEST_ENABLED = os.getenv("WORLD_INGEST_ENABLED", "true").lower() == "true"
WORLD_INGEST_INTERVAL_SECONDS = int(os.getenv("WORLD_INGEST_INTERVAL_SECONDS", "1800"))
WORLD_SEARCH_BASE_URL = os.getenv("WORLD_SEARCH_BASE_URL", "https://search.rasies.com/search")
WORLD_SEARCH_LANGUAGE = os.getenv("WORLD_SEARCH_LANGUAGE", "en-US")
WORLD_SEARCH_SAFESEARCH = int(os.getenv("WORLD_SEARCH_SAFESEARCH", "0"))
WORLD_SEARCH_RESULTS_LIMIT = int(os.getenv("WORLD_SEARCH_RESULTS_LIMIT", "6"))
WORLD_SEARCH_MAX_AGE_DAYS = int(os.getenv("WORLD_SEARCH_MAX_AGE_DAYS", "21"))
WORLD_CONTEXT_ITEMS_FOR_DRAFT = int(os.getenv("WORLD_CONTEXT_ITEMS_FOR_DRAFT", "4"))
WORLD_AUTOPUBLISH_ENABLED = os.getenv("WORLD_AUTOPUBLISH_ENABLED", "true").lower() == "true"
WORLD_AUTOPUBLISH_INTERVAL_SECONDS = int(os.getenv("WORLD_AUTOPUBLISH_INTERVAL_SECONDS", "14400"))
WORLD_AUTOPUBLISH_MAX_PER_DAY = int(os.getenv("WORLD_AUTOPUBLISH_MAX_PER_DAY", "3"))
WORLD_AUTOPUBLISH_STATUS = os.getenv("WORLD_AUTOPUBLISH_STATUS", "published").lower()
WORLD_AUTOPUBLISH_MAX_WORDS = int(os.getenv("WORLD_AUTOPUBLISH_MAX_WORDS", "150"))
WORLD_AUTOPUBLISH_DISPLAY_NAME = os.getenv("WORLD_AUTOPUBLISH_DISPLAY_NAME", "night desk").strip() or "night desk"

SELF_HARM_RESPONSE = (
    "We saw a note that sounds like self-harm. We are holding this for admin review. "
    "If you're in immediate danger or need support, consider reaching out to a trusted person or local help line."
)

DEFAULT_WORLD_QUERY_CONFIGS = [
    {
        "topic": "nicotine policy pulse",
        "query": "nicotine vaping regulation news",
        "angle": "Name one current policy or enforcement shift, then invite people to say how it lands in their body and routines.",
        "categories": "news",
        "time_range": "week",
        "keywords": ["nicotine", "vaping", "vape", "smoking", "tobacco", "pouch", "cigarette", "regulation"],
    },
    {
        "topic": "quit science pulse",
        "query": "quitting nicotine anxiety stress news",
        "angle": "Pull one fresh health or science signal into the room and ask what people are noticing in themselves.",
        "categories": "news",
        "time_range": "month",
        "keywords": ["nicotine", "quit", "smoking", "vaping", "anxiety", "stress", "craving", "health"],
    },
    {
        "topic": "world pressure pulse",
        "query": "layoffs rent inflation stress news",
        "angle": "Name the outside pressure and invite people to say how it collides with cravings, spending, or routines.",
        "categories": "news",
        "time_range": "day",
        "keywords": ["layoff", "rent", "inflation", "economy", "cost", "living", "stress", "housing", "wage"],
    },
]

VALID_AUTOPUBLISH_STATUSES = {"published", "draft", "queued"}
if WORLD_AUTOPUBLISH_STATUS not in VALID_AUTOPUBLISH_STATUSES:
    WORLD_AUTOPUBLISH_STATUS = "published"

pool = ConnectionPool(conninfo=DATABASE_URL, min_size=1, max_size=5, open=True)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _fingerprint(*parts: str) -> str:
    payload = "||".join(part.strip() for part in parts if part and str(part).strip())
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _safe_json_loads(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    if not isinstance(value, str):
        return {}
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _json_default(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, (set, tuple)):
        return list(value)
    return str(value)


def _json_dumps(value: Any) -> str:
    return json.dumps(value, default=_json_default)


def _parse_dt(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        text = str(value).strip()
        if not text:
            return None
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(text)
        except ValueError:
            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
                try:
                    dt = datetime.strptime(text, fmt)
                    break
                except ValueError:
                    continue
            else:
                return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _domain_from_url(url: str) -> str:
    parsed = urlparse(url)
    return parsed.netloc.lower()


def _cat_headers() -> Dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if CAT_INTERNAL_TOKEN:
        headers["X-Internal-Token"] = CAT_INTERNAL_TOKEN
    if CAT_API_KEY:
        headers["Authorization"] = f"Bearer {CAT_API_KEY}"
    if CAT_USER_ID:
        headers["user_id"] = CAT_USER_ID
    return headers


def _normalize_tags(tags: List[Any]) -> List[str]:
    cleaned: List[str] = []
    seen = set()
    for raw in tags:
        value = re.sub(r"[^a-z0-9]+", "-", str(raw or "").strip().lower()).strip("-")
        if not value or value in seen:
            continue
        seen.add(value)
        cleaned.append(value[:40])
    return cleaned[:8]


def _normalize_query_config(entry: Dict[str, Any], index: int) -> Optional[Dict[str, Any]]:
    query = str(entry.get("query") or "").strip()
    if not query:
        return None

    keywords = entry.get("keywords") or []
    if isinstance(keywords, str):
        keywords = [item.strip() for item in keywords.split(",") if item.strip()]
    if not isinstance(keywords, list):
        keywords = []

    return {
        "topic": str(entry.get("topic") or f"world pulse {index + 1}").strip()[:120],
        "query": query[:240],
        "angle": str(entry.get("angle") or "Invite the room to respond honestly.").strip()[:240],
        "categories": str(entry.get("categories") or "news").strip()[:80],
        "time_range": str(entry.get("time_range") or "week").strip()[:32],
        "keywords": [str(item).strip().lower()[:40] for item in keywords if str(item).strip()],
    }


def _load_world_query_configs() -> List[Dict[str, Any]]:
    raw = os.getenv("WORLD_SEARCH_QUERIES", "").strip()
    if not raw:
        return DEFAULT_WORLD_QUERY_CONFIGS

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parsed = None

    normalized: List[Dict[str, Any]] = []
    if isinstance(parsed, list):
        for index, item in enumerate(parsed):
            if isinstance(item, str):
                candidate = _normalize_query_config({"query": item}, index)
            elif isinstance(item, dict):
                candidate = _normalize_query_config(item, index)
            else:
                candidate = None
            if candidate:
                normalized.append(candidate)
    else:
        for index, chunk in enumerate(raw.split("||")):
            candidate = _normalize_query_config({"query": chunk}, index)
            if candidate:
                normalized.append(candidate)

    return normalized or DEFAULT_WORLD_QUERY_CONFIGS


WORLD_QUERY_CONFIGS = _load_world_query_configs()


def audit(conn, actor: str, action: str, payload: Dict[str, Any]) -> None:
    conn.execute(
        """
        INSERT INTO audit_log (actor, action, payload_json)
        VALUES (%s, %s, %s);
        """,
        (actor, action, _json_dumps(payload)),
    )


def fetch_queued(conn) -> List[Dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT id, source, body_raw, moderation_notes, received_at
        FROM submissions
        WHERE status = 'queued'
        ORDER BY received_at ASC
        LIMIT %s;
        """,
        (BATCH_SIZE,),
    ).fetchall()

    results = []
    for row in rows:
        results.append(
            {
                "id": row[0],
                "source": row[1],
                "body_raw": row[2],
                "moderation_notes": row[3],
                "received_at": row[4],
            }
        )
    return results


def call_cat(submission_id: int, body_raw: str) -> Optional[Dict[str, Any]]:
    if not CAT_REVIEW_ENDPOINT:
        return None
    payload = {"submission_id": submission_id, "body_raw": body_raw}
    try:
        resp = requests.post(CAT_REVIEW_ENDPOINT, json=payload, headers=_cat_headers(), timeout=30)
        resp.raise_for_status()
    except requests.RequestException:
        return None

    try:
        data = resp.json()
    except ValueError:
        data = resp.text
    return parse_review_payload(data)


def create_post(
    conn,
    submission: Dict[str, Any],
    body: str,
    tags: List[str],
    status: str,
    display_name: Optional[str],
) -> int:
    author_type = "sms" if submission["source"] == "sms" else "web"
    published_at = _utc_now() if status == "published" else None
    cursor = conn.execute(
        """
        INSERT INTO posts (author_type, display_name, body, body_original, status, published_at, tags)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING id;
        """,
        (author_type, display_name, body, submission["body_raw"], status, published_at, tags),
    )
    return cursor.fetchone()[0]


def create_editorial_post(
    conn,
    body: str,
    tags: List[str],
    status: str,
    display_name: Optional[str],
) -> int:
    published_at = _utc_now() if status == "published" else None
    cursor = conn.execute(
        """
        INSERT INTO posts (author_type, display_name, body, body_original, status, published_at, tags)
        VALUES ('admin', %s, %s, %s, %s, %s, %s)
        RETURNING id;
        """,
        (display_name, body, body, status, published_at, tags),
    )
    return cursor.fetchone()[0]


def handle_submission(conn, submission: Dict[str, Any]) -> None:
    existing_notes: Dict[str, Any] = {}
    if submission.get("moderation_notes"):
        try:
            existing_notes = json.loads(submission["moderation_notes"])
        except json.JSONDecodeError:
            existing_notes = {}
    display_name = existing_notes.get("display_name")

    decision = policy_check(submission["body_raw"], allow_profanity=ALLOW_PROFANITY)

    if decision.flagged:
        notes = {**existing_notes, "decision": "flagged", "reasons": decision.reasons, "help": SELF_HARM_RESPONSE}
        conn.execute(
            """
            UPDATE submissions
            SET status = 'flagged', moderation_notes = %s
            WHERE id = %s;
            """,
            (_json_dumps(notes), submission["id"]),
        )
        audit(conn, "system", "submission_flagged", {"submission_id": submission["id"], "reasons": decision.reasons})
        return

    if decision.decision == "reject":
        notes = {**existing_notes, "decision": "reject", "reasons": decision.reasons}
        conn.execute(
            """
            UPDATE submissions
            SET status = 'rejected', moderation_notes = %s
            WHERE id = %s;
            """,
            (_json_dumps(notes), submission["id"]),
        )
        audit(conn, "system", "submission_rejected", {"submission_id": submission["id"], "reasons": decision.reasons})
        return

    cat_review = call_cat(submission["id"], submission["body_raw"])
    if cat_review:
        if cat_review["decision"] == "flagged":
            notes = {**existing_notes, "decision": "flagged", "reasons": cat_review.get("reasons", []), "help": SELF_HARM_RESPONSE}
            conn.execute(
                """
                UPDATE submissions
                SET status = 'flagged', moderation_notes = %s
                WHERE id = %s;
                """,
                (_json_dumps(notes), submission["id"]),
            )
            audit(conn, "cat", "submission_flagged", {"submission_id": submission["id"], "reasons": notes["reasons"]})
            return
        if cat_review["decision"] == "reject":
            notes = {**existing_notes, "decision": "reject", "reasons": cat_review.get("reasons", [])}
            conn.execute(
                """
                UPDATE submissions
                SET status = 'rejected', moderation_notes = %s
                WHERE id = %s;
                """,
                (_json_dumps(notes), submission["id"]),
            )
            audit(conn, "cat", "submission_rejected", {"submission_id": submission["id"], "reasons": notes["reasons"]})
            return

        body = (cat_review.get("cleaned_body") or submission["body_raw"]).strip()
        tags = _normalize_tags(cat_review.get("tags") or [])
    else:
        body = submission["body_raw"].strip()
        tags = []

    status = "published" if not REQUIRE_ADMIN_REVIEW else "queued"
    post_id = create_post(conn, submission, body, tags, status, display_name)

    conn.execute(
        """
        UPDATE submissions
        SET status = 'approved', moderation_notes = %s, post_id = %s
        WHERE id = %s;
        """,
        (_json_dumps({**existing_notes, "decision": "approve", "tags": tags}), post_id, submission["id"]),
    )
    audit(conn, "system", "submission_approved", {"submission_id": submission["id"], "post_id": post_id})


def _extract_world_results(raw_results: List[Dict[str, Any]], keywords: List[str]) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    seen_urls = set()
    max_age_cutoff = _utc_now() - timedelta(days=WORLD_SEARCH_MAX_AGE_DAYS)

    for raw in raw_results:
        title = str(raw.get("title") or "").strip()
        url = str(raw.get("url") or "").strip()
        if not title or not url.startswith(("http://", "https://")):
            continue

        normalized_url = url.split("#", 1)[0]
        if normalized_url in seen_urls:
            continue

        snippet = str(raw.get("content") or "").strip()
        category = str(raw.get("category") or "").strip().lower()
        published_at = _parse_dt(raw.get("publishedDate") or raw.get("pubdate"))
        if published_at and published_at < max_age_cutoff:
            continue
        if not published_at and category != "news":
            continue

        haystack = f"{title} {snippet} {raw.get('source') or ''} {raw.get('engine') or ''}".lower()
        if keywords and not any(keyword in haystack for keyword in keywords):
            continue

        source = str(raw.get("source") or "").strip() or _domain_from_url(normalized_url) or str(raw.get("engine") or "").strip()
        try:
            score = float(raw.get("score")) if raw.get("score") is not None else None
        except (TypeError, ValueError):
            score = None

        results.append(
            {
                "fingerprint": _fingerprint(normalized_url, title, published_at.isoformat() if published_at else ""),
                "title": title[:400],
                "url": normalized_url,
                "snippet": snippet[:600],
                "source": source[:160],
                "engine": str(raw.get("engine") or "").strip()[:160],
                "category": category[:40],
                "published_at": published_at,
                "score": score,
                "metadata_json": {
                    "engines": raw.get("engines") or [],
                    "positions": raw.get("positions") or [],
                    "thumbnail": raw.get("thumbnail"),
                    "publishedDate": raw.get("publishedDate"),
                    "pubdate": raw.get("pubdate"),
                },
            }
        )
        seen_urls.add(normalized_url)

        if len(results) >= WORLD_SEARCH_RESULTS_LIMIT:
            break

    return results


def fetch_world_search(config: Dict[str, Any]) -> Dict[str, Any]:
    params = {
        "q": config["query"],
        "categories": config["categories"],
        "language": WORLD_SEARCH_LANGUAGE,
        "safesearch": WORLD_SEARCH_SAFESEARCH,
        "time_range": config["time_range"],
        "format": "json",
    }
    headers = {"User-Agent": "LickingVapeWorldPulse/1.0"}
    resp = requests.get(WORLD_SEARCH_BASE_URL, params=params, headers=headers, timeout=30)
    resp.raise_for_status()
    try:
        payload = resp.json()
    except ValueError as exc:
        raise RuntimeError("World search returned invalid JSON") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("World search returned an unexpected payload shape")

    raw_results = payload.get("results") or []
    if not isinstance(raw_results, list):
        raise RuntimeError("World search payload is missing a results list")

    items = _extract_world_results(raw_results, config["keywords"])
    if not items and config["keywords"]:
        items = _extract_world_results(raw_results, [])

    return {
        "query": config["query"],
        "topic": config["topic"],
        "angle": config["angle"],
        "categories": config["categories"],
        "items": items,
        "metadata_json": {
            "number_of_results": payload.get("number_of_results"),
            "unresponsive_engines": payload.get("unresponsive_engines") or [],
            "time_range": config["time_range"],
        },
    }


def store_world_run(config: Dict[str, Any], items: List[Dict[str, Any]], error: str = "", metadata_json: Optional[Dict[str, Any]] = None) -> Optional[int]:
    status = "error" if error else "ok"
    metadata_json = metadata_json or {}
    top_summary = " | ".join(item["title"] for item in items[:3]) if items else ""

    with pool.connection() as conn:
        run_id = conn.execute(
            """
            INSERT INTO world_pulse_runs (query, topic, angle, categories, status, result_count, top_summary, error, metadata_json)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id;
            """,
            (
                config["query"],
                config["topic"],
                config["angle"],
                config["categories"],
                status,
                len(items),
                top_summary or None,
                error or None,
                _json_dumps(metadata_json),
            ),
        ).fetchone()[0]

        if items:
            for index, item in enumerate(items, start=1):
                conn.execute(
                    """
                    INSERT INTO world_pulse_items (
                        query, fingerprint, last_run_id, topic, angle, title, url, snippet, source, engine,
                        category, published_at, score, rank, metadata_json
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (query, fingerprint)
                    DO UPDATE SET
                        last_run_id = EXCLUDED.last_run_id,
                        topic = EXCLUDED.topic,
                        angle = EXCLUDED.angle,
                        title = EXCLUDED.title,
                        url = EXCLUDED.url,
                        snippet = EXCLUDED.snippet,
                        source = EXCLUDED.source,
                        engine = EXCLUDED.engine,
                        category = EXCLUDED.category,
                        published_at = EXCLUDED.published_at,
                        score = EXCLUDED.score,
                        rank = EXCLUDED.rank,
                        last_seen_at = NOW(),
                        metadata_json = EXCLUDED.metadata_json;
                    """,
                    (
                        config["query"],
                        item["fingerprint"],
                        run_id,
                        config["topic"],
                        config["angle"],
                        item["title"],
                        item["url"],
                        item["snippet"],
                        item["source"],
                        item["engine"],
                        item["category"],
                        item["published_at"],
                        item["score"],
                        index,
                        _json_dumps(item["metadata_json"]),
                    ),
                )

        action = "world_pulse_ingested" if not error else "world_pulse_ingest_failed"
        audit(
            conn,
            "system",
            action,
            {
                "query": config["query"],
                "topic": config["topic"],
                "run_id": run_id,
                "result_count": len(items),
                "error": error or None,
            },
        )
        conn.commit()
    return run_id


def _world_ingest_due(conn, query: str) -> bool:
    with conn.cursor(row_factory=dict_row) as cur:
        row = cur.execute(
            """
            SELECT fetched_at
            FROM world_pulse_runs
            WHERE query = %s
            ORDER BY fetched_at DESC
            LIMIT 1;
            """,
            (query,),
        ).fetchone()
    if not row:
        return True
    fetched_at = row["fetched_at"]
    return _utc_now() - fetched_at >= timedelta(seconds=WORLD_INGEST_INTERVAL_SECONDS)


def _table_exists(conn, table_name: str) -> bool:
    row = conn.execute("SELECT to_regclass(%s);", (f"public.{table_name}",)).fetchone()
    return bool(row and row[0])


def _automation_tables_ready(conn) -> bool:
    required_tables = ("world_pulse_runs", "world_pulse_items", "autopilot_posts")
    return all(_table_exists(conn, table_name) for table_name in required_tables)


def run_world_ingest_cycle() -> None:
    if not WORLD_INGEST_ENABLED or not WORLD_QUERY_CONFIGS:
        return

    due_configs: List[Dict[str, Any]] = []
    with pool.connection() as conn:
        if not _automation_tables_ready(conn):
            return
        for config in WORLD_QUERY_CONFIGS:
            if _world_ingest_due(conn, config["query"]):
                due_configs.append(config)

    for config in due_configs:
        try:
            payload = fetch_world_search(config)
            store_world_run(config, payload["items"], metadata_json=payload["metadata_json"])
        except Exception as exc:
            try:
                store_world_run(config, [], error=str(exc), metadata_json={"exception": exc.__class__.__name__})
            except Exception:
                print(f"[worker] failed to store world ingest error for query={config['query']}: {exc}", flush=True)
                traceback.print_exc()


def _autopublish_due(conn) -> bool:
    row = conn.execute(
        """
        SELECT created_at
        FROM autopilot_posts
        WHERE status IN ('published', 'draft', 'queued')
        ORDER BY created_at DESC
        LIMIT 1;
        """
    ).fetchone()
    if not row:
        return True
    created_at = row[0]
    return _utc_now() - created_at >= timedelta(seconds=WORLD_AUTOPUBLISH_INTERVAL_SECONDS)


def _autopublish_under_daily_cap(conn) -> bool:
    row = conn.execute(
        """
        SELECT COUNT(*)
        FROM autopilot_posts
        WHERE created_at > NOW() - INTERVAL '1 day'
          AND status IN ('published', 'draft', 'queued');
        """
    ).fetchone()
    return int(row[0]) < WORLD_AUTOPUBLISH_MAX_PER_DAY


def _fetch_run_items(conn, run_id: int, limit: int) -> List[Dict[str, Any]]:
    with conn.cursor(row_factory=dict_row) as cur:
        rows = cur.execute(
            """
            SELECT title, url, snippet, source, engine, category, published_at, score, rank
            FROM world_pulse_items
            WHERE last_run_id = %s
            ORDER BY rank ASC, score DESC NULLS LAST
            LIMIT %s;
            """,
            (run_id, limit),
        ).fetchall()
    return [dict(row) for row in rows]


def _candidate_fingerprint(run: Dict[str, Any], items: List[Dict[str, Any]]) -> str:
    fetched_at = run.get("fetched_at")
    day_bucket = fetched_at.date().isoformat() if isinstance(fetched_at, datetime) else _utc_now().date().isoformat()
    parts = [run["query"], run["topic"], run["angle"], day_bucket]
    for item in items[:3]:
        parts.append(str(item.get("url") or ""))
        parts.append(str(item.get("title") or ""))
    return _fingerprint(*parts)


def _next_autopublish_candidate() -> Optional[Dict[str, Any]]:
    with pool.connection() as conn:
        if not _automation_tables_ready(conn):
            return None
        if not _autopublish_due(conn) or not _autopublish_under_daily_cap(conn):
            return None

        with conn.cursor(row_factory=dict_row) as cur:
            runs = cur.execute(
                """
                SELECT id, query, topic, angle, categories, fetched_at, result_count, top_summary
                FROM world_pulse_runs
                WHERE status = 'ok'
                  AND fetched_at > NOW() - INTERVAL '7 day'
                ORDER BY fetched_at DESC
                LIMIT 12;
                """
            ).fetchall()

        for run in runs:
            items = _fetch_run_items(conn, run["id"], WORLD_CONTEXT_ITEMS_FOR_DRAFT)
            if not items:
                continue
            fingerprint = _candidate_fingerprint(run, items)
            exists = conn.execute(
                "SELECT 1 FROM autopilot_posts WHERE fingerprint = %s LIMIT 1;",
                (fingerprint,),
            ).fetchone()
            if exists:
                continue
            return {**dict(run), "items": items, "fingerprint": fingerprint}

    return None


def _build_search_context(candidate: Dict[str, Any]) -> str:
    lines = [
        f"Topic: {candidate['topic']}",
        f"Angle: {candidate['angle']}",
        f"Query: {candidate['query']}",
        f"Fetched: {candidate['fetched_at'].isoformat()}",
    ]

    for index, item in enumerate(candidate["items"], start=1):
        source = item.get("source") or item.get("engine") or "source"
        published = item.get("published_at")
        published_label = published.date().isoformat() if isinstance(published, datetime) else "undated"
        lines.append(
            f"{index}. [{source} | {published_label}] {item.get('title')} -- {item.get('snippet')} ({item.get('url')})"
        )

    return "\n".join(lines)


def _normalize_draft_payload(payload: Any) -> Dict[str, Any]:
    data = _safe_json_loads(payload) if not isinstance(payload, dict) else payload
    body = str(data.get("body") or "").strip()
    tags = data.get("tags") or []
    if isinstance(tags, str):
        tags = [item.strip() for item in tags.split(",") if item.strip()]
    if not isinstance(tags, list):
        tags = []
    display_name = str(data.get("display_name") or WORLD_AUTOPUBLISH_DISPLAY_NAME).strip()[:60] or WORLD_AUTOPUBLISH_DISPLAY_NAME
    return {"body": body, "tags": _normalize_tags(tags), "display_name": display_name}


def call_cat_draft(candidate: Dict[str, Any], search_context: str) -> Optional[Dict[str, Any]]:
    if not CAT_DRAFT_ENDPOINT:
        return None

    payload = {
        "topic": candidate["topic"],
        "angle": candidate["angle"],
        "search_context": search_context,
        "max_words": WORLD_AUTOPUBLISH_MAX_WORDS,
    }
    try:
        resp = requests.post(CAT_DRAFT_ENDPOINT, json=payload, headers=_cat_headers(), timeout=60)
        resp.raise_for_status()
    except requests.RequestException:
        return None

    try:
        data = resp.json()
    except ValueError:
        data = resp.text
    try:
        return _normalize_draft_payload(data)
    except Exception:
        return None


def build_fallback_draft(candidate: Dict[str, Any]) -> Dict[str, Any]:
    top_item = candidate["items"][0]
    source = top_item.get("source") or top_item.get("engine") or "the world feed"
    body = (
        f"Night desk note: {top_item.get('title')}. {source} is the kind of headline that can make the day feel louder than it already was. "
        "If the outside world is turning your nicotine brain up tonight, leave a note with the scene, the urge, and what you are doing instead."
    )
    return {
        "body": body[:700].strip(),
        "tags": _normalize_tags(["autopilot", "world-pulse", candidate["topic"]]),
        "display_name": WORLD_AUTOPUBLISH_DISPLAY_NAME,
    }


def _record_autopilot(
    conn,
    candidate: Dict[str, Any],
    draft: Dict[str, Any],
    status: str,
    post_id: Optional[int] = None,
    metadata_json: Optional[Dict[str, Any]] = None,
) -> None:
    conn.execute(
        """
        INSERT INTO autopilot_posts (
            fingerprint, source_run_id, source_query, topic, angle, body, display_name, tags, status, post_id, metadata_json
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
        """,
        (
            candidate["fingerprint"],
            candidate["id"],
            candidate["query"],
            candidate["topic"],
            candidate["angle"],
            draft.get("body") or "",
            draft.get("display_name") or WORLD_AUTOPUBLISH_DISPLAY_NAME,
            draft.get("tags") or [],
            status,
            post_id,
            _json_dumps(metadata_json or {}),
        ),
    )


def run_autopublish_cycle() -> None:
    if not WORLD_AUTOPUBLISH_ENABLED:
        return

    candidate = _next_autopublish_candidate()
    if not candidate:
        return

    search_context = _build_search_context(candidate)
    draft = call_cat_draft(candidate, search_context)
    fallback_used = False
    if not draft or not draft.get("body"):
        draft = build_fallback_draft(candidate)
        fallback_used = True

    body = str(draft.get("body") or "").strip()
    tags = _normalize_tags((draft.get("tags") or []) + ["autopilot", "world-pulse"])
    display_name = str(draft.get("display_name") or WORLD_AUTOPUBLISH_DISPLAY_NAME).strip()[:60] or WORLD_AUTOPUBLISH_DISPLAY_NAME

    if len(body) < 40:
        with pool.connection() as conn:
            _record_autopilot(
                conn,
                candidate,
                {"body": body, "tags": tags, "display_name": display_name},
                status="skipped",
                metadata_json={"reason": "empty_body", "fallback_used": fallback_used},
            )
            audit(conn, "cat", "autopilot_post_skipped", {"run_id": candidate["id"], "reason": "empty_body"})
            conn.commit()
        return

    decision = policy_check(body, allow_profanity=ALLOW_PROFANITY)
    if decision.flagged or decision.decision == "reject":
        with pool.connection() as conn:
            _record_autopilot(
                conn,
                candidate,
                {"body": body, "tags": tags, "display_name": display_name},
                status="skipped",
                metadata_json={"reason": "policy", "reasons": decision.reasons, "fallback_used": fallback_used},
            )
            audit(
                conn,
                "cat",
                "autopilot_post_skipped",
                {"run_id": candidate["id"], "reason": "policy", "reasons": decision.reasons},
            )
            conn.commit()
        return

    with pool.connection() as conn:
        post_id = create_editorial_post(conn, body, tags, WORLD_AUTOPUBLISH_STATUS, display_name)
        _record_autopilot(
            conn,
            candidate,
            {"body": body, "tags": tags, "display_name": display_name},
            status=WORLD_AUTOPUBLISH_STATUS,
            post_id=post_id,
            metadata_json={
                "fallback_used": fallback_used,
                "search_context": search_context,
                "items": candidate["items"],
                "fetched_at": candidate["fetched_at"].isoformat(),
            },
        )
        audit(
            conn,
            "cat",
            "autopilot_post_published",
            {
                "run_id": candidate["id"],
                "post_id": post_id,
                "status": WORLD_AUTOPUBLISH_STATUS,
                "query": candidate["query"],
                "topic": candidate["topic"],
            },
        )
        conn.commit()


def run_submission_cycle() -> None:
    with pool.connection() as conn:
        submissions = fetch_queued(conn)
        if not submissions:
            return

        for submission in submissions:
            handle_submission(conn, submission)
        conn.commit()


def run_once() -> None:
    phases = [
        ("submission cycle", run_submission_cycle),
        ("world ingest", run_world_ingest_cycle),
        ("autopublish", run_autopublish_cycle),
    ]

    for label, fn in phases:
        try:
            fn()
        except Exception as exc:
            print(f"[worker] {label} failed: {exc}", flush=True)
            traceback.print_exc()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="Run one full cycle and exit")
    parser.add_argument("--world-once", action="store_true", help="Run world ingest once and exit")
    parser.add_argument("--autopublish-once", action="store_true", help="Run autopublish once and exit")
    args = parser.parse_args()

    if args.world_once:
        run_world_ingest_cycle()
        return

    if args.autopublish_once:
        run_autopublish_cycle()
        return

    if args.once:
        run_once()
        return

    while True:
        run_once()
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
