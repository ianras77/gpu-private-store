"""add is_course to routes

Revision ID: 0003_route_is_course
Revises: 0002_email_verified
Create Date: 2026-02-26 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "0003_route_is_course"
down_revision = "0002_email_verified"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("routes", sa.Column("is_course", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.alter_column("routes", "is_course", server_default=None)


def downgrade():
    op.drop_column("routes", "is_course")
