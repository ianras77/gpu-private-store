"""add courses and run points

Revision ID: 20260226_000002
Revises: 20260213_000001
Create Date: 2026-02-26 00:02:00
"""
from alembic import op
import sqlalchemy as sa

revision = "20260226_000002"
down_revision = "20260213_000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "courses",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("distance_km", sa.Float(), nullable=False),
        sa.Column("theme_key", sa.String(length=64), nullable=False),
        sa.Column("best_pace_s_per_km", sa.Integer(), nullable=True),
        sa.Column("last_pace_s_per_km", sa.Integer(), nullable=True),
        sa.Column("points", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True))
    )
    op.create_index("ix_courses_user_id", "courses", ["user_id"])

    op.add_column("runs", sa.Column("course_id", sa.String(length=36), nullable=True))
    op.add_column(
        "runs",
        sa.Column("points", sa.Integer(), nullable=False, server_default=sa.text("0"))
    )
    op.add_column(
        "runs",
        sa.Column("improvement_s_per_km", sa.Integer(), nullable=True)
    )
    op.create_foreign_key("fk_runs_course_id", "runs", "courses", ["course_id"], ["id"])
    op.create_index("ix_runs_course_id", "runs", ["course_id"])


def downgrade() -> None:
    op.drop_index("ix_runs_course_id", table_name="runs")
    op.drop_constraint("fk_runs_course_id", "runs", type_="foreignkey")
    op.drop_column("runs", "improvement_s_per_km")
    op.drop_column("runs", "points")
    op.drop_column("runs", "course_id")

    op.drop_index("ix_courses_user_id", table_name="courses")
    op.drop_table("courses")
