"""queue optional Mastra recap enrichment durably

Revision ID: 0010_story_outbox
Revises: 0009_async_arcade_parties
Create Date: 2026-10-03
"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0010_story_outbox"
down_revision = "0009_async_arcade_parties"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "story_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("adventure_session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("adventure_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("job_type", sa.String(length=32), nullable=False, server_default="recap"),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_error", sa.String(length=160), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("adventure_session_id", "job_type", name="uq_story_job_session_type"),
    )
    op.create_index("ix_story_jobs_user_id", "story_jobs", ["user_id"])
    op.create_index("ix_story_jobs_adventure_session_id", "story_jobs", ["adventure_session_id"])
    op.create_index("ix_story_jobs_status", "story_jobs", ["status"])


def downgrade():
    op.drop_index("ix_story_jobs_status", table_name="story_jobs")
    op.drop_index("ix_story_jobs_adventure_session_id", table_name="story_jobs")
    op.drop_index("ix_story_jobs_user_id", table_name="story_jobs")
    op.drop_table("story_jobs")
