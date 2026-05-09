"""add parties and worlds

Revision ID: 0004_parties_worlds
Revises: 0003_route_is_course
Create Date: 2026-02-26 00:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0004_parties_worlds"
down_revision = "0003_route_is_course"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "parties",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False)
    )
    op.create_index("ix_parties_user_id", "parties", ["user_id"])

    op.create_table(
        "party_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("party_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("parties.id"), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False)
    )
    op.create_index("ix_party_members_party_id", "party_members", ["party_id"])

    op.create_table(
        "worlds",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("party_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("parties.id"), nullable=False, unique=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("theme", sa.String(length=120), nullable=False, server_default="neon"),
        sa.Column("seed", sa.Integer(), nullable=False),
        sa.Column("route_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("routes.id"), nullable=True),
        sa.Column("state_json", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False)
    )
    op.create_index("ix_worlds_party_id", "worlds", ["party_id"])
    op.create_index("ix_worlds_route_id", "worlds", ["route_id"])

    op.create_table(
        "world_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("world_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("worlds.id"), nullable=False),
        sa.Column("workout_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workouts.id"), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False)
    )
    op.create_index("ix_world_events_world_id", "world_events", ["world_id"])
    op.create_index("ix_world_events_workout_id", "world_events", ["workout_id"])


def downgrade():
    op.drop_index("ix_world_events_workout_id", table_name="world_events")
    op.drop_index("ix_world_events_world_id", table_name="world_events")
    op.drop_table("world_events")

    op.drop_index("ix_worlds_route_id", table_name="worlds")
    op.drop_index("ix_worlds_party_id", table_name="worlds")
    op.drop_table("worlds")

    op.drop_index("ix_party_members_party_id", table_name="party_members")
    op.drop_table("party_members")

    op.drop_index("ix_parties_user_id", table_name="parties")
    op.drop_table("parties")
