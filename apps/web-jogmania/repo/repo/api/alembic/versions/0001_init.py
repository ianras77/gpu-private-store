"""init

Revision ID: 0001_init
Revises: 
Create Date: 2026-02-15 00:00:00
"""
from alembic import op
import sqlalchemy as sa
import sqlalchemy.dialects.postgresql as pg

revision = "0001_init"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "users",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "devices",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", pg.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("platform", sa.String(length=50), nullable=False),
        sa.Column("device_id", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_devices_user_id", "devices", ["user_id"], unique=False)

    op.create_table(
        "workouts",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", pg.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("source", sa.String(length=50), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_s", sa.Integer(), nullable=False),
        sa.Column("distance_m", sa.Float(), nullable=False),
        sa.Column("avg_pace_s_per_km", sa.Float(), nullable=False),
        sa.Column("calories_kcal", sa.Float(), nullable=True),
        sa.Column("avg_hr", sa.Float(), nullable=True),
        sa.Column("elevation_gain_m", sa.Float(), nullable=True),
        sa.Column("raw_payload_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_workouts_user_id", "workouts", ["user_id"], unique=False)

    op.create_table(
        "gps_points",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("workout_id", pg.UUID(as_uuid=True), sa.ForeignKey("workouts.id"), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lon", sa.Float(), nullable=False),
        sa.Column("altitude_m", sa.Float(), nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accuracy_m", sa.Float(), nullable=True),
    )
    op.create_index("ix_gps_points_workout_id", "gps_points", ["workout_id"], unique=False)

    op.create_table(
        "routes",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", pg.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("route_hash", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("user_id", "route_hash", name="uq_route_user_hash")
    )
    op.create_index("ix_routes_user_id", "routes", ["user_id"], unique=False)

    op.create_table(
        "route_instances",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("route_id", pg.UUID(as_uuid=True), sa.ForeignKey("routes.id"), nullable=False),
        sa.Column("workout_id", pg.UUID(as_uuid=True), sa.ForeignKey("workouts.id"), nullable=False),
        sa.Column("instance_seed", sa.Integer(), nullable=False),
        sa.Column("difficulty", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_route_instances_route_id", "route_instances", ["route_id"], unique=False)
    op.create_index("ix_route_instances_workout_id", "route_instances", ["workout_id"], unique=False)

    op.create_table(
        "adventures",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("route_instance_id", pg.UUID(as_uuid=True), sa.ForeignKey("route_instances.id"), nullable=False),
        sa.Column("summary_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_adventures_route_instance_id", "adventures", ["route_instance_id"], unique=False)

    op.create_table(
        "rewards",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", pg.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("type", sa.String(length=50), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("earned_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_rewards_user_id", "rewards", ["user_id"], unique=False)

    op.create_table(
        "inventory_items",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", pg.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("item_key", sa.String(length=100), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("user_id", "item_key", name="uq_inventory_user_item")
    )
    op.create_index("ix_inventory_items_user_id", "inventory_items", ["user_id"], unique=False)


def downgrade():
    op.drop_index("ix_inventory_items_user_id", table_name="inventory_items")
    op.drop_table("inventory_items")
    op.drop_index("ix_rewards_user_id", table_name="rewards")
    op.drop_table("rewards")
    op.drop_index("ix_adventures_route_instance_id", table_name="adventures")
    op.drop_table("adventures")
    op.drop_index("ix_route_instances_workout_id", table_name="route_instances")
    op.drop_index("ix_route_instances_route_id", table_name="route_instances")
    op.drop_table("route_instances")
    op.drop_index("ix_routes_user_id", table_name="routes")
    op.drop_table("routes")
    op.drop_index("ix_gps_points_workout_id", table_name="gps_points")
    op.drop_table("gps_points")
    op.drop_index("ix_workouts_user_id", table_name="workouts")
    op.drop_table("workouts")
    op.drop_index("ix_devices_user_id", table_name="devices")
    op.drop_table("devices")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
