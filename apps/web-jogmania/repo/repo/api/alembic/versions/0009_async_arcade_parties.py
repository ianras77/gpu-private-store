"""enable invitation-based asynchronous party worlds

Revision ID: 0009_async_arcade_parties
Revises: 0008_progression_feedback
Create Date: 2026-10-03
"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0009_async_arcade_parties"
down_revision = "0008_progression_feedback"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("parties", sa.Column("invite_code", sa.String(length=16), nullable=True))
    op.execute(sa.text(
        "UPDATE parties SET invite_code = upper(substr(md5(random()::text || clock_timestamp()::text), 1, 16)) "
        "WHERE invite_code IS NULL"
    ))
    op.alter_column("parties", "invite_code", nullable=False)
    op.create_index("ix_parties_invite_code", "parties", ["invite_code"], unique=True)
    op.add_column("party_members", sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_party_members_user_id_users",
        "party_members",
        "users",
        ["user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_party_members_user_id", "party_members", ["user_id"])
    op.create_unique_constraint("uq_party_member_user", "party_members", ["party_id", "user_id"])


def downgrade():
    op.drop_constraint("uq_party_member_user", "party_members", type_="unique")
    op.drop_index("ix_party_members_user_id", table_name="party_members")
    op.drop_constraint("fk_party_members_user_id_users", "party_members", type_="foreignkey")
    op.drop_column("party_members", "user_id")
    op.drop_index("ix_parties_invite_code", table_name="parties")
    op.drop_column("parties", "invite_code")
