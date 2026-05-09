import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from psycopg_pool import ConnectionPool

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://lickingvape:lickingvape@db:5432/lickingvape")

pool = ConnectionPool(conninfo=DATABASE_URL, min_size=1, max_size=10, open=False)

SEED_DEMO_CONTENT = os.getenv("SEED_DEMO_CONTENT", "true").lower() == "true"

DEFAULT_THEME = {
    "body_font": '"Palatino Linotype", "Book Antiqua", Georgia, serif',
    "heading_font": '"Courier New", "Lucida Sans Typewriter", "Lucida Console", monospace',
    "base_font_size": 18,
    "line_height": 1.68,
    "max_width": 1100,
    "spacing": 32,
    "bg": "#08060d",
    "bg_2": "#12101a",
    "bg_3": "#1a1522",
    "text": "#f3edf7",
    "muted": "#b6a8c1",
    "accent": "#d8b068",
    "accent_2": "#7fa69b",
    "accent_3": "#7a5263",
    "surface": "rgba(14, 10, 20, 0.82)",
    "surface_strong": "rgba(19, 14, 27, 0.94)",
    "divider": "rgba(243, 237, 247, 0.12)",
}

LEGACY_DEFAULT_THEME = {
    "body_font": "IBM Plex Sans",
    "heading_font": "Space Mono",
    "base_font_size": 18,
    "line_height": 1.65,
    "max_width": 1040,
    "spacing": 30,
}

MINIMAL_DEFAULT_THEME = {
    "body_font": "Palatino Linotype",
    "heading_font": "Courier New",
    "base_font_size": 18,
    "line_height": 1.65,
    "max_width": 1040,
    "spacing": 30,
}

DEFAULT_ABOUT = """
Licking Vape is a dimly lit feed for people quitting nicotine without pretending life is tidy.

### What this room is
- A feed-first diary for cravings, slips, rituals, money stress, weird headlines, and tiny wins.
- A place where moody posts are welcome as long as they stay human.
- A corner with a memory-keeping Cheshire Cat, a timer, and a cabinet full of backup moves.

### What the tone is
- Less health-class flyer.
- More late-night internet post with receipts.
- Honest, curated, and built for people still in the middle of it.

### What the line is
- We can be dark without being cruel.
- We can talk about the world without doomscrolling each other into the floor.
- We are not a replacement for professional care.

The name winks at old impossible-animal bravado: striped chaos, bent logic, one hard thing at a time.
""".strip()

DEFAULT_SHOUTOUT = (
    "Built on crooked-tiger bravado, nicotine-exit honesty, and late-night internet diary energy."
)

SEED_POSTS = [
    {
        "display_name": "inkblot",
        "body": "Breakfast headline spiral almost turned into a nicotine excuse. Posted here instead. Black coffee, cold sink water, open window. The craving went from feral to merely rude.",
        "tags": ["doomscroll", "morning", "held-on"],
        "days_ago": 5,
        "hours_ago": 2,
    },
    {
        "display_name": "lamplight",
        "body": "Roommate drama plus work email avalanche. I wanted the old hand ritual more than the nicotine itself. Walked the block, came back, wrote this instead.",
        "tags": ["ritual", "stress", "check-in"],
        "days_ago": 4,
        "hours_ago": 5,
    },
    {
        "display_name": None,
        "body": "Tonight I miss the pause button, not the vape. Tea in a chipped mug. Fan on. Phone face-down. My lungs feel less haunted than they did last month.",
        "tags": ["night", "ritual-swap", "body"],
        "days_ago": 4,
        "hours_ago": 1,
    },
    {
        "display_name": "J",
        "body": "Slip report: bought one yesterday, told on myself today, threw it out tonight. No myth-making, no collapse. Just receipts and a smaller radius tomorrow.",
        "tags": ["slip", "receipts", "reset"],
        "days_ago": 3,
        "hours_ago": 4,
    },
    {
        "display_name": "ravenwire",
        "body": "Rent is due, the news is weird, and every ad seems to know I am tired. Still did not buy pods. That is the whole poem tonight.",
        "tags": ["money", "world-notes", "small-win"],
        "days_ago": 2,
        "hours_ago": 8,
    },
    {
        "display_name": "thinmoon",
        "body": "Driving used to be automatic vape territory. Tonight it was gum, cracked windows, and one dramatic song on repeat. Weirdly survivable.",
        "tags": ["driving", "trigger-map", "survived"],
        "days_ago": 2,
        "hours_ago": 2,
    },
    {
        "display_name": "T",
        "body": "Left the apartment without the device and did not do the little panic-turnaround. Felt gothic and brave and mildly ridiculous. I will take it.",
        "tags": ["win", "confidence", "daylight"],
        "days_ago": 1,
        "hours_ago": 10,
    },
    {
        "display_name": None,
        "body": "Morning one without nicotine before coffee. Turns out my brain is loud but not prophetic.",
        "tags": ["day-one", "morning", "rewiring"],
        "days_ago": 1,
        "hours_ago": 2,
    },
    {
        "display_name": "L",
        "body": "Grounding trick, revised for bad-news days: name the headline, name the feeling, name one thing in the room that is actually real. It helped.",
        "tags": ["grounding", "news", "nervous-system"],
        "days_ago": 0,
        "hours_ago": 12,
    },
    {
        "display_name": "A",
        "body": "After dinner remains my villain origin story. Tonight I folded laundry and wrote a mean little list of reasons I do not want to start over.",
        "tags": ["after-dinner", "hands-busy", "resolve"],
        "days_ago": 0,
        "hours_ago": 8,
    },
    {
        "display_name": "C",
        "body": "Texted my friend: if I ask for a hit tonight, say no and remind me I am being dramatic. Outsourcing the spine a little.",
        "tags": ["boundary", "support", "humor"],
        "days_ago": 0,
        "hours_ago": 4,
    },
    {
        "display_name": None,
        "body": "Current plan: survive the night, keep the window open, let tomorrow arrive without nicotine on my tongue.",
        "tags": ["night", "plan", "still-here"],
        "days_ago": 0,
        "hours_ago": 1,
    },
]


def open_pool() -> None:
    if not pool.closed:
        return
    pool.open()


def close_pool() -> None:
    if pool.closed:
        return
    pool.close()


def init_db() -> None:
    with pool.connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS posts (
                id SERIAL PRIMARY KEY,
                author_type TEXT NOT NULL CHECK (author_type IN ('admin', 'sms', 'web')),
                display_name TEXT,
                body TEXT NOT NULL,
                body_original TEXT,
                status TEXT NOT NULL CHECK (status IN ('draft', 'queued', 'published', 'rejected')),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                published_at TIMESTAMPTZ,
                tags TEXT[]
            );
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS submissions (
                id SERIAL PRIMARY KEY,
                source TEXT NOT NULL CHECK (source IN ('sms', 'web')),
                from_phone TEXT,
                body_raw TEXT NOT NULL,
                received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                status TEXT NOT NULL CHECK (status IN ('queued', 'approved', 'rejected', 'flagged')),
                moderation_notes TEXT,
                post_id INTEGER REFERENCES posts(id)
            );
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS audit_log (
                id SERIAL PRIMARY KEY,
                actor TEXT NOT NULL CHECK (actor IN ('system', 'admin', 'cat')),
                action TEXT NOT NULL,
                payload_json JSONB NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS site_settings (
                id INTEGER PRIMARY KEY,
                theme_json JSONB NOT NULL,
                about_md TEXT NOT NULL,
                shoutout_md TEXT NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                handle TEXT NOT NULL UNIQUE,
                display_name TEXT,
                password_hash TEXT NOT NULL,
                password_salt TEXT NOT NULL,
                chat_profile_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                last_login_at TIMESTAMPTZ,
                chat_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_sessions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token_hash TEXT NOT NULL UNIQUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                expires_at TIMESTAMPTZ NOT NULL,
                last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                user_agent TEXT
            );
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_chat_messages (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                role TEXT NOT NULL CHECK (role IN ('user', 'cat')),
                body TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS world_pulse_runs (
                id SERIAL PRIMARY KEY,
                query TEXT NOT NULL,
                topic TEXT NOT NULL,
                angle TEXT NOT NULL,
                categories TEXT NOT NULL DEFAULT 'news',
                fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                status TEXT NOT NULL CHECK (status IN ('ok', 'error')),
                result_count INTEGER NOT NULL DEFAULT 0,
                top_summary TEXT,
                error TEXT,
                metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
            );
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS world_pulse_items (
                id SERIAL PRIMARY KEY,
                query TEXT NOT NULL,
                fingerprint TEXT NOT NULL,
                last_run_id INTEGER REFERENCES world_pulse_runs(id) ON DELETE SET NULL,
                topic TEXT NOT NULL,
                angle TEXT NOT NULL,
                title TEXT NOT NULL,
                url TEXT NOT NULL,
                snippet TEXT,
                source TEXT,
                engine TEXT,
                category TEXT,
                published_at TIMESTAMPTZ,
                score DOUBLE PRECISION,
                rank INTEGER NOT NULL DEFAULT 0,
                first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                UNIQUE (query, fingerprint)
            );
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS autopilot_posts (
                id SERIAL PRIMARY KEY,
                fingerprint TEXT NOT NULL UNIQUE,
                source_run_id INTEGER REFERENCES world_pulse_runs(id) ON DELETE SET NULL,
                source_query TEXT NOT NULL,
                topic TEXT NOT NULL,
                angle TEXT NOT NULL,
                body TEXT NOT NULL,
                display_name TEXT,
                tags TEXT[],
                status TEXT NOT NULL CHECK (status IN ('published', 'draft', 'queued', 'skipped', 'error')),
                post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
            );
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_posts_status_published_at ON posts (status, published_at DESC);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_submissions_status_received_at ON submissions (status, received_at DESC);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions (user_id);")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions (expires_at DESC);"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_user_chat_messages_user_id_created_at "
            "ON user_chat_messages (user_id, created_at DESC);"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_world_pulse_runs_query_fetched_at "
            "ON world_pulse_runs (query, fetched_at DESC);"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_world_pulse_items_last_run_rank "
            "ON world_pulse_items (last_run_id, rank ASC);"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_world_pulse_items_query_last_seen "
            "ON world_pulse_items (query, last_seen_at DESC);"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_autopilot_posts_created_at "
            "ON autopilot_posts (created_at DESC);"
        )

        existing = conn.execute(
            "SELECT theme_json, about_md, shoutout_md FROM site_settings WHERE id = 1;"
        ).fetchone()
        if not existing:
            conn.execute(
                """
                INSERT INTO site_settings (id, theme_json, about_md, shoutout_md)
                VALUES (1, %s, %s, %s);
                """,
                (json.dumps(DEFAULT_THEME), DEFAULT_ABOUT, DEFAULT_SHOUTOUT),
            )
        else:
            existing_theme = existing[0] if len(existing) > 0 else {}
            existing_about = str(existing[1] or "") if len(existing) > 1 else ""
            existing_shoutout = str(existing[2] or "") if len(existing) > 2 else ""

            next_theme = existing_theme
            next_about = existing_about
            next_shoutout = existing_shoutout

            if isinstance(existing_theme, dict) and (
                existing_theme == LEGACY_DEFAULT_THEME or existing_theme == MINIMAL_DEFAULT_THEME
            ):
                next_theme = DEFAULT_THEME

            if (
                "retro internet den for people quitting vapes together" in existing_about
                or "Dr. Seuss" in existing_about
                or "I can lick 30 tigers today" in existing_about
            ):
                next_about = DEFAULT_ABOUT

            if (
                existing_shoutout == "Origin spark: Dr. Seuss, I Can Lick 30 Tigers Today! One tiger or one stripe, we keep going."
                or "Dr. Seuss" in existing_shoutout
                or "One tiger or one stripe" in existing_shoutout
            ):
                next_shoutout = DEFAULT_SHOUTOUT

            if (
                next_theme != existing_theme
                or next_about != existing_about
                or next_shoutout != existing_shoutout
            ):
                conn.execute(
                    """
                    UPDATE site_settings
                    SET theme_json = %s, about_md = %s, shoutout_md = %s, updated_at = NOW()
                    WHERE id = 1;
                    """,
                    (json.dumps(next_theme), next_about, next_shoutout),
                )
        seed_demo_posts(conn)
        conn.commit()


def audit(conn, actor: str, action: str, payload: Dict[str, Any]) -> None:
    conn.execute(
        """
        INSERT INTO audit_log (actor, action, payload_json)
        VALUES (%s, %s, %s);
        """,
        (actor, action, json.dumps(payload)),
    )


def seed_demo_posts(conn) -> None:
    if not SEED_DEMO_CONTENT:
        return

    existing = conn.execute("SELECT 1 FROM posts LIMIT 1;").fetchone()
    if existing:
        return

    now = datetime.now(timezone.utc)
    for item in SEED_POSTS:
        published_at = now - timedelta(days=item["days_ago"], hours=item["hours_ago"])
        conn.execute(
            """
            INSERT INTO posts (author_type, display_name, body, body_original, status, published_at, tags)
            VALUES ('admin', %s, %s, %s, 'published', %s, %s);
            """,
            (item["display_name"], item["body"], item["body"], published_at, item["tags"]),
        )
