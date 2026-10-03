import uuid

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    email_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    devices = relationship("Device", back_populates="user")
    workouts = relationship("Workout", back_populates="user")
    routes = relationship("Route", back_populates="user")
    rewards = relationship("Reward", back_populates="user")
    inventory_items = relationship("InventoryItem", back_populates="user")
    runner_profile = relationship("RunnerProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    adventure_sessions = relationship("AdventureSession", back_populates="user", cascade="all, delete-orphan")


class RunnerProfile(Base):
    __tablename__ = "runner_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)
    preferences_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    snapshot_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="runner_profile")


class Device(Base):
    __tablename__ = "devices"
    __table_args__ = (UniqueConstraint("user_id", "platform", "device_id", name="uq_devices_user_platform_device"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    platform: Mapped[str] = mapped_column(String(50), nullable=False)
    device_id: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str | None] = mapped_column(String(120))
    pairing_id: Mapped[str | None] = mapped_column(String(120), index=True)
    last_seen_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    last_sync_at: Mapped[str | None] = mapped_column(DateTime(timezone=True))
    metadata_json: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="devices")

    @property
    def companion_device_id(self) -> str | None:
        return self.pairing_id

    @companion_device_id.setter
    def companion_device_id(self, value: str | None):
        self.pairing_id = value


class Workout(Base):
    __tablename__ = "workouts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    source: Mapped[str] = mapped_column(String(50), nullable=False)
    started_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False)
    duration_s: Mapped[int] = mapped_column(Integer, nullable=False)
    distance_m: Mapped[float] = mapped_column(Float, nullable=False)
    avg_pace_s_per_km: Mapped[float] = mapped_column(Float, nullable=False)
    calories_kcal: Mapped[float | None] = mapped_column(Float)
    avg_hr: Mapped[float | None] = mapped_column(Float)
    elevation_gain_m: Mapped[float | None] = mapped_column(Float)
    raw_payload_json: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="workouts")
    gps_points = relationship("GpsPoint", back_populates="workout", cascade="all, delete-orphan")
    route_instances = relationship("RouteInstance", back_populates="workout")


class GpsPoint(Base):
    __tablename__ = "gps_points"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workout_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workouts.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    altitude_m: Mapped[float | None] = mapped_column(Float)
    timestamp: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False)
    accuracy_m: Mapped[float | None] = mapped_column(Float)

    workout = relationship("Workout", back_populates="gps_points")


class Route(Base):
    __tablename__ = "routes"
    __table_args__ = (UniqueConstraint("user_id", "route_hash", name="uq_route_user_hash"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    route_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    is_course: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="routes")
    instances = relationship("RouteInstance", back_populates="route")


class RouteInstance(Base):
    __tablename__ = "route_instances"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    route_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("routes.id"), index=True)
    workout_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workouts.id"), index=True)
    instance_seed: Mapped[int] = mapped_column(Integer, nullable=False)
    difficulty: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    route = relationship("Route", back_populates="instances")
    workout = relationship("Workout", back_populates="route_instances")
    adventures = relationship("Adventure", back_populates="route_instance", cascade="all, delete-orphan")


class Adventure(Base):
    __tablename__ = "adventures"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    route_instance_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("route_instances.id"), index=True)
    summary_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    route_instance = relationship("RouteInstance", back_populates="adventures")


class AdventureSession(Base):
    __tablename__ = "adventure_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    route_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("routes.id", ondelete="SET NULL"), index=True)
    workout_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("workouts.id", ondelete="SET NULL"), unique=True, index=True)
    intent: Mapped[str] = mapped_column(String(40), nullable=False, default="surprise")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="prepared")
    cartridge_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    event_log_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    recap_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    world_change_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    started_at: Mapped[str | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[str | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="adventure_sessions")


class Reward(Base):
    __tablename__ = "rewards"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    payload_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    earned_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="rewards")


class ProgressionLedgerEntry(Base):
    __tablename__ = "progression_ledger"
    __table_args__ = (UniqueConstraint("user_id", "workout_id", "reason_code", name="uq_progression_workout_reason"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    workout_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workouts.id", ondelete="CASCADE"), index=True)
    ledger_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    reason_code: Mapped[str] = mapped_column(String(80), nullable=False)
    sparks: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    payload_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class RunnerFeedback(Base):
    __tablename__ = "runner_feedback"
    __table_args__ = (UniqueConstraint("adventure_session_id", name="uq_runner_feedback_session"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    adventure_session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("adventure_sessions.id", ondelete="CASCADE"), index=True)
    felt_personal: Mapped[bool] = mapped_column(Boolean, nullable=False)
    style_correction: Mapped[str] = mapped_column(String(32), nullable=False, default="default")
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class StoryJob(Base):
    __tablename__ = "story_jobs"
    __table_args__ = (UniqueConstraint("adventure_session_id", "job_type", name="uq_story_job_session_type"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    adventure_session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("adventure_sessions.id", ondelete="CASCADE"), index=True)
    job_type: Mapped[str] = mapped_column(String(32), nullable=False, default="recap")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="pending", index=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    next_attempt_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_error: Mapped[str | None] = mapped_column(String(160))
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class InventoryItem(Base):
    __tablename__ = "inventory_items"
    __table_args__ = (UniqueConstraint("user_id", "item_key", name="uq_inventory_user_item"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    item_key: Mapped[str] = mapped_column(String(100), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="inventory_items")


class Party(Base):
    __tablename__ = "parties"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    invite_code: Mapped[str] = mapped_column(String(16), nullable=False, unique=True, default=lambda: uuid.uuid4().hex[:16].upper())
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User")
    members = relationship("PartyMember", back_populates="party", cascade="all, delete-orphan")
    world = relationship("World", back_populates="party", uselist=False, cascade="all, delete-orphan")


class PartyMember(Base):
    __tablename__ = "party_members"
    __table_args__ = (UniqueConstraint("party_id", "user_id", name="uq_party_member_user"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    party_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("parties.id"), index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(120), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    party = relationship("Party", back_populates="members")


class World(Base):
    __tablename__ = "worlds"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    party_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("parties.id"), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    theme: Mapped[str] = mapped_column(String(120), nullable=False, default="neon")
    seed: Mapped[int] = mapped_column(Integer, nullable=False)
    route_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("routes.id"), index=True)
    state_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    party = relationship("Party", back_populates="world")
    events = relationship("WorldEvent", back_populates="world", cascade="all, delete-orphan")
    decorations = relationship("WorldDecoration", back_populates="world", cascade="all, delete-orphan")


class WorldDecoration(Base):
    __tablename__ = "world_decorations"
    __table_args__ = (UniqueConstraint("world_id", "slot", name="uq_world_decoration_slot"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    world_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("worlds.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    item_key: Mapped[str] = mapped_column(String(80), nullable=False)
    slot: Mapped[str] = mapped_column(String(40), nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    world = relationship("World", back_populates="decorations")


class WorldEvent(Base):
    __tablename__ = "world_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    world_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("worlds.id"), index=True)
    workout_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("workouts.id"), index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    payload_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    world = relationship("World", back_populates="events")
