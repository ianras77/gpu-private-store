"""add auditable progression and runner story feedback

Revision ID: 0008_progression_feedback
Revises: 0007_adventure_sessions
Create Date: 2026-10-03
"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0008_progression_feedback"
down_revision = "0007_adventure_sessions"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "progression_ledger",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("workout_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workouts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ledger_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("reason_code", sa.String(length=80), nullable=False),
        sa.Column("sparks", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "workout_id", "reason_code", name="uq_progression_workout_reason"),
    )
    op.create_index("ix_progression_ledger_user_id", "progression_ledger", ["user_id"])
    op.create_index("ix_progression_ledger_workout_id", "progression_ledger", ["workout_id"])
    op.execute(sa.text("""
        INSERT INTO progression_ledger
            (id, user_id, workout_id, ledger_version, reason_code, sparks, payload_json, created_at)
        SELECT id, user_id, (payload_json ->> 'workout_id')::uuid, 1, type,
            CASE WHEN type = 'run-complete' THEN COALESCE((payload_json ->> 'points')::integer, 0) ELSE 0 END,
            payload_json, earned_at
        FROM rewards
        WHERE type IN ('run-complete', 'course-discovered', 'course-familiarity', 'arcade-attraction', 'watch-link')
          AND payload_json ->> 'workout_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        ON CONFLICT (user_id, workout_id, reason_code) DO NOTHING
    """))
    op.create_table(
        "runner_feedback",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("adventure_session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("adventure_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("felt_personal", sa.Boolean(), nullable=False),
        sa.Column("style_correction", sa.String(length=32), nullable=False, server_default="default"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("adventure_session_id", name="uq_runner_feedback_session"),
    )
    op.create_index("ix_runner_feedback_user_id", "runner_feedback", ["user_id"])
    op.create_index("ix_runner_feedback_adventure_session_id", "runner_feedback", ["adventure_session_id"])


def downgrade():
    op.drop_index("ix_runner_feedback_adventure_session_id", table_name="runner_feedback")
    op.drop_index("ix_runner_feedback_user_id", table_name="runner_feedback")
    op.drop_table("runner_feedback")
    op.drop_index("ix_progression_ledger_workout_id", table_name="progression_ledger")
    op.drop_index("ix_progression_ledger_user_id", table_name="progression_ledger")
    op.drop_table("progression_ledger")
