"""add email_verified to users

Revision ID: 0002_email_verified
Revises: 0001_init
Create Date: 2026-02-16 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_email_verified"
down_revision = "0001_init"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.text("true")))
    op.alter_column("users", "email_verified", server_default=None)


def downgrade():
    op.drop_column("users", "email_verified")
