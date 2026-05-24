"""bridge legacy live schema

Revision ID: 20260523_000003
Revises: 20260226_000002
Create Date: 2026-05-23 00:03:00
"""
from alembic import op

revision = "20260523_000003"
down_revision = "20260226_000002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS hashed_password varchar(255)")
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'users' AND column_name = 'password_hash'
            ) THEN
                UPDATE users
                SET hashed_password = COALESCE(hashed_password, password_hash, 'legacy-password-disabled')
                WHERE hashed_password IS NULL;
            ELSE
                UPDATE users
                SET hashed_password = COALESCE(hashed_password, 'legacy-password-disabled')
                WHERE hashed_password IS NULL;
            END IF;
        END $$;
        """
    )
    op.execute("ALTER TABLE users ALTER COLUMN hashed_password SET DEFAULT 'legacy-password-disabled'")
    op.execute("ALTER TABLE users ALTER COLUMN hashed_password SET NOT NULL")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS courses (
            id varchar(36) PRIMARY KEY,
            user_id varchar(36) NOT NULL,
            name varchar(120) NOT NULL,
            description varchar(255) NOT NULL,
            distance_km double precision NOT NULL,
            theme_key varchar(64) NOT NULL,
            best_pace_s_per_km integer,
            last_pace_s_per_km integer,
            points integer NOT NULL DEFAULT 0,
            created_at timestamp with time zone DEFAULT now(),
            updated_at timestamp with time zone
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_courses_user_id ON courses (user_id)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS runs (
            id varchar(36) PRIMARY KEY,
            user_id varchar(36) NOT NULL,
            course_id varchar(36),
            distance_m double precision NOT NULL,
            duration_s integer NOT NULL,
            avg_pace_s_per_km integer NOT NULL,
            points integer NOT NULL DEFAULT 0,
            improvement_s_per_km integer,
            created_at timestamp with time zone DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_runs_course_id ON runs (course_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_runs_user_id ON runs (user_id)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS run_events (
            id varchar(36) PRIMARY KEY,
            run_id varchar(36) NOT NULL,
            event_type varchar(64) NOT NULL,
            ts_s integer NOT NULL,
            data json,
            created_at timestamp with time zone DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_run_events_run_id ON run_events (run_id)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS loot_items (
            id varchar(36) PRIMARY KEY,
            user_id varchar(36) NOT NULL,
            run_id varchar(36),
            name varchar(120) NOT NULL,
            rarity varchar(32) NOT NULL,
            description varchar(255) NOT NULL,
            created_at timestamp with time zone DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_loot_items_user_id ON loot_items (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_loot_items_run_id ON loot_items (run_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS loot_items")
    op.execute("DROP TABLE IF EXISTS run_events")
    op.execute("DROP TABLE IF EXISTS runs")
    op.execute("DROP TABLE IF EXISTS courses")
