"""persist player-placed arcade decorations

Revision ID: 0011_arcade_decorations
Revises: 0010_story_outbox
Create Date: 2026-10-03
"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0011_arcade_decorations"
down_revision = "0010_story_outbox"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "world_decorations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("world_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("worlds.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("item_key", sa.String(length=80), nullable=False),
        sa.Column("slot", sa.String(length=40), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("world_id", "slot", name="uq_world_decoration_slot"),
    )
    op.create_index("ix_world_decorations_world_id", "world_decorations", ["world_id"])
    op.create_index("ix_world_decorations_user_id", "world_decorations", ["user_id"])


def downgrade():
    op.drop_index("ix_world_decorations_user_id", table_name="world_decorations")
    op.drop_index("ix_world_decorations_world_id", table_name="world_decorations")
    op.drop_table("world_decorations")
