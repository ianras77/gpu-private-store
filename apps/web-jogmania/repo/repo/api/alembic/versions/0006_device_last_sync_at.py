"""add last_sync_at to devices

Revision ID: 0006_device_last_sync_at
Revises: 0005_device_sync_fields
Create Date: 2026-03-21 00:30:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0006_device_last_sync_at"
down_revision = "0005_device_sync_fields"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    columns = {column["name"] for column in inspect(bind).get_columns("devices")}
    if "last_sync_at" not in columns:
        op.add_column("devices", sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    bind = op.get_bind()
    columns = {column["name"] for column in inspect(bind).get_columns("devices")}
    if "last_sync_at" in columns:
        op.drop_column("devices", "last_sync_at")
