"""add runner profile and durable adventure sessions

Revision ID: 0007_adventure_sessions
Revises: 0006_device_last_sync_at
Create Date: 2026-10-03
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0007_adventure_sessions"
down_revision = "0006_device_last_sync_at"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "runner_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("preferences_json", sa.JSON(), nullable=False),
        sa.Column("snapshot_json", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_runner_profiles_user_id", "runner_profiles", ["user_id"], unique=True)
    op.create_table(
        "adventure_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("route_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("routes.id", ondelete="SET NULL"), nullable=True),
        sa.Column("workout_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workouts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("intent", sa.String(length=40), nullable=False, server_default="surprise"),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="prepared"),
        sa.Column("cartridge_json", sa.JSON(), nullable=False),
        sa.Column("event_log_json", sa.JSON(), nullable=False),
        sa.Column("recap_json", sa.JSON(), nullable=False),
        sa.Column("world_change_json", sa.JSON(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_adventure_sessions_user_id", "adventure_sessions", ["user_id"])
    op.create_index("ix_adventure_sessions_route_id", "adventure_sessions", ["route_id"])
    op.create_index("ix_adventure_sessions_workout_id", "adventure_sessions", ["workout_id"], unique=True)


def downgrade():
    op.drop_index("ix_adventure_sessions_workout_id", table_name="adventure_sessions")
    op.drop_index("ix_adventure_sessions_route_id", table_name="adventure_sessions")
    op.drop_index("ix_adventure_sessions_user_id", table_name="adventure_sessions")
    op.drop_table("adventure_sessions")
    op.drop_index("ix_runner_profiles_user_id", table_name="runner_profiles")
    op.drop_table("runner_profiles")
