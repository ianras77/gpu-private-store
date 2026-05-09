import uuid
from typing import List, Optional, Dict, Any
from pydantic import AliasChoices, BaseModel, Field, ConfigDict, EmailStr, field_validator, model_validator
from datetime import datetime


class AuthResponse(BaseModel):
    access_token: Optional[str] = None
    token_type: str = "bearer"
    requires_verification: bool = False
    message: Optional[str] = None


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str):
        if len(value) < 8:
            raise ValueError("Password must be at least 8 characters")
        return value


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    created_at: datetime


class DeviceRegister(BaseModel):
    platform: str
    device_id: str = Field(min_length=3, max_length=255)
    name: Optional[str] = Field(default=None, max_length=120)
    companion_device_id: Optional[str] = Field(
        default=None,
        max_length=120,
        validation_alias=AliasChoices("companion_device_id", "pairing_id"),
    )
    metadata_json: Optional[Dict[str, Any]] = None

    @field_validator("platform")
    @classmethod
    def normalize_platform(cls, value: str):
        normalized = value.strip().lower()
        aliases = {
            "iphone": "ios",
            "ios-app": "ios",
            "watchos": "watch",
            "apple-watch": "watch"
        }
        return aliases.get(normalized, normalized)

    @field_validator("device_id", "name", "companion_device_id")
    @classmethod
    def strip_strings(cls, value: Optional[str]):
        if value is None:
            return value
        stripped = value.strip()
        return stripped or None


class DeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    platform: str
    device_id: str
    name: Optional[str] = None
    companion_device_id: Optional[str] = None
    metadata_json: Optional[Dict[str, Any]] = None
    created_at: datetime
    last_seen_at: datetime
    last_sync_at: Optional[datetime] = None


class GpsPointCreate(BaseModel):
    lat: float
    lon: float
    altitude_m: Optional[float] = None
    timestamp: datetime
    accuracy_m: Optional[float] = None


class GpsPointOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    seq: int
    lat: float
    lon: float
    altitude_m: Optional[float]
    timestamp: datetime
    accuracy_m: Optional[float]


class WorkoutBase(BaseModel):
    source: str
    started_at: datetime
    ended_at: datetime
    duration_s: int
    distance_m: float
    avg_pace_s_per_km: float
    calories_kcal: Optional[float] = None
    avg_hr: Optional[float] = None
    elevation_gain_m: Optional[float] = None
    raw_payload_json: Optional[Dict[str, Any]] = None

    @field_validator("source")
    @classmethod
    def normalize_source(cls, value: str):
        return value.strip().lower()

    @model_validator(mode="after")
    def validate_workout(self):
        if self.ended_at <= self.started_at:
            raise ValueError("ended_at must be after started_at")
        if self.duration_s <= 0:
            raise ValueError("duration_s must be positive")
        if self.distance_m < 0:
            raise ValueError("distance_m must be zero or greater")
        if self.avg_pace_s_per_km < 0:
            raise ValueError("avg_pace_s_per_km must be zero or greater")
        return self


class WorkoutCreate(WorkoutBase):
    gps_points: List[GpsPointCreate]
    device: Optional[DeviceRegister] = None
    route_id: Optional[uuid.UUID] = None
    device_id: Optional[str] = None

    @field_validator("gps_points")
    @classmethod
    def validate_gps_points(cls, value: List[GpsPointCreate]):
        if len(value) < 2:
            raise ValueError("At least 2 GPS points are required")
        return value

    @model_validator(mode="after")
    def validate_gps_order(self):
        for previous, current in zip(self.gps_points, self.gps_points[1:]):
            if current.timestamp < previous.timestamp:
                raise ValueError("GPS points must be in chronological order")
        return self


class WorkoutOut(WorkoutBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime


class WorkoutDetail(WorkoutOut):
    gps_points: List[GpsPointOut]
    route_id: Optional[uuid.UUID] = None


class RouteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    route_hash: str
    created_at: datetime
    is_course: bool = False
    distance_m: Optional[float] = None
    typical_pace_s_per_km: Optional[float] = None
    frequency: Optional[int] = None
    last_run_at: Optional[datetime] = None


class RouteInstanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workout_id: uuid.UUID
    instance_seed: int
    difficulty: int
    created_at: datetime


class RouteDetail(RouteOut):
    instances: List[RouteInstanceOut]
    workouts: List[WorkoutOut]


class AdventureSummary(BaseModel):
    title: str
    seed: int
    boss_moment: bool
    obstacle_density: float
    collectibles: List[str]
    scenes: List[str]
    segments: List[Dict[str, Any]]


class AdventureOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    summary_json: Dict[str, Any]
    created_at: datetime


class RewardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: str
    payload_json: Dict[str, Any]
    earned_at: datetime


class InventoryItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    item_key: str
    quantity: int
    updated_at: datetime


class RenameRoute(BaseModel):
    name: str


class PartyMemberCreate(BaseModel):
    name: str
    role: str


class PartyMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    role: str
    created_at: datetime


class WorldOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    theme: str
    seed: int
    route_id: Optional[uuid.UUID] = None
    state_json: Dict[str, Any]
    created_at: datetime
    updated_at: datetime


class WorldEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    payload_json: Dict[str, Any]
    created_at: datetime
    workout_id: Optional[uuid.UUID] = None


class PartyCreate(BaseModel):
    name: str
    world_name: Optional[str] = None
    world_theme: Optional[str] = None
    members: List[PartyMemberCreate] = Field(default_factory=list)


class PartyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    created_at: datetime
    members: List[PartyMemberOut] = Field(default_factory=list)
    world: Optional[WorldOut] = None


class WorldEnter(BaseModel):
    route_id: uuid.UUID


class WorldPlay(BaseModel):
    workout_id: uuid.UUID
