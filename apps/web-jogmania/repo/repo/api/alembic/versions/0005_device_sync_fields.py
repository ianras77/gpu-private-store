"""add device sync fields

Revision ID: 0005_device_sync_fields
Revises: 0004_parties_worlds
Create Date: 2026-03-21 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "0005_device_sync_fields"
down_revision = "0004_parties_worlds"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("devices", sa.Column("name", sa.String(length=120), nullable=True))
    op.add_column("devices", sa.Column("pairing_id", sa.String(length=120), nullable=True))
    op.add_column(
        "devices",
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()"))
    )
    op.add_column("devices", sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("devices", sa.Column("metadata_json", sa.JSON(), nullable=True))
    op.create_index("ix_devices_pairing_id", "devices", ["pairing_id"], unique=False)
    op.create_unique_constraint(
        "uq_devices_user_platform_device",
        "devices",
        ["user_id", "platform", "device_id"]
    )
    op.alter_column("devices", "last_seen_at", server_default=None)


def downgrade():
    op.drop_constraint("uq_devices_user_platform_device", "devices", type_="unique")
    op.drop_index("ix_devices_pairing_id", table_name="devices")
    op.drop_column("devices", "metadata_json")
    op.drop_column("devices", "last_sync_at")
    op.drop_column("devices", "last_seen_at")
    op.drop_column("devices", "pairing_id")
    op.drop_column("devices", "name")
