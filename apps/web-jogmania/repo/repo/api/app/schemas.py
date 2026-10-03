import uuid
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)


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
        return value

    @model_validator(mode="after")
    def validate_gps_order(self):
        if len(self.gps_points) < 2 and self.route_id is None:
            raise ValueError("A saved course is required when a route trace is unavailable")
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


class CourseChapterOut(BaseModel):
    visits_required: int
    title: str
    story: str
    keepsake: str
    keepsake_icon: str
    item_key: str
    unlocked: bool


class CourseMasteryOut(BaseModel):
    route_id: uuid.UUID
    route_name: str
    visits: int
    level: int
    title: str
    progress_percent: int
    next_chapter: Optional[CourseChapterOut] = None
    chapters: List[CourseChapterOut]


class AdventureSummary(BaseModel):
    title: str
    seed: int
    boss_moment: bool
    obstacle_density: float
    collectibles: List[str]
    scenes: List[str]
    segments: List[Dict[str, Any]]
    route_features: Dict[str, Any] = Field(default_factory=dict)
    encounters: List[Dict[str, Any]] = Field(default_factory=list)
    map_layers: List[Dict[str, Any]] = Field(default_factory=list)


class AdventureOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    summary_json: Dict[str, Any]
    created_at: datetime


class RunnerPreferences(BaseModel):
    adventure_tone: Literal["silly", "storybook", "mystery"] = "storybook"
    run_intention: Literal["easy", "steady", "explore", "repeat", "surprise"] = "surprise"
    haptics_enabled: bool = True
    health_data_enabled: bool = False
    story_feedback: Literal["default", "more_grounded", "more_silly", "shorter"] = "default"


class RunnerProfileUpdate(BaseModel):
    adventure_tone: Optional[Literal["silly", "storybook", "mystery"]] = None
    run_intention: Optional[Literal["easy", "steady", "explore", "repeat", "surprise"]] = None
    haptics_enabled: Optional[bool] = None
    health_data_enabled: Optional[bool] = None
    story_feedback: Optional[Literal["default", "more_grounded", "more_silly", "shorter"]] = None


class AdventureFeedbackCreate(BaseModel):
    felt_personal: bool
    style_correction: Literal["default", "more_grounded", "more_silly", "shorter"] = "default"


class ProgressionLedgerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workout_id: uuid.UUID
    ledger_version: int
    reason_code: str
    sparks: int
    payload_json: Dict[str, Any]
    created_at: datetime


class RunnerProfileOut(BaseModel):
    preferences: RunnerPreferences
    snapshot: Dict[str, Any] = Field(default_factory=dict)


class CartridgeCreate(BaseModel):
    route_id: Optional[uuid.UUID] = None
    intent: Literal["easy", "steady", "explore", "repeat", "surprise"] = "surprise"


class CartridgeEvent(BaseModel):
    id: str
    trigger_kind: Literal["distance", "elapsed"]
    trigger_value: int = Field(ge=1)
    kind: Literal["discovery", "companion", "collectible", "chapter", "finish"]
    title: str
    message: str
    visual_key: str
    haptic: Literal["tap", "success", "celebration"] = "tap"


class CartridgeOut(BaseModel):
    id: uuid.UUID
    title: str
    world_name: str
    course_name: str
    intent: str
    opening_line: str
    finish_line: str
    events: List[CartridgeEvent]
    reward_preview: str
    target_distance_m: int = 3200
    haptics_enabled: bool = True
    health_data_enabled: bool = False
    intelligence: Literal["mastra", "fallback"]
    runner_snapshot: Dict[str, Any] = Field(default_factory=dict)


class AdventureSessionOut(BaseModel):
    id: uuid.UUID
    route_id: Optional[uuid.UUID] = None
    status: str
    cartridge: Dict[str, Any]
    event_log: List[Dict[str, Any]] = Field(default_factory=list)
    recap: Dict[str, Any] = Field(default_factory=dict)
    world_change: Dict[str, Any] = Field(default_factory=dict)
    workout_id: Optional[uuid.UUID] = None
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


class WorldDecorationOut(BaseModel):
    slot: str
    item_key: str
    title: str
    icon: str
    owned_by_me: bool
    placed_at: datetime


class WorldDecorationPlace(BaseModel):
    slot: Literal[
        "roof-left", "roof-center", "roof-right",
        "window-left", "window-right", "garden-left", "garden-center", "garden-right",
    ]
    item_key: Literal["lantern-arch", "prize-fox", "star-bunting", "flower-pot", "neon-puddle"]


class PartyCreate(BaseModel):
    name: str
    world_name: Optional[str] = None
    world_theme: Optional[str] = None
    members: List[PartyMemberCreate] = Field(default_factory=list)


class PartyJoin(BaseModel):
    invite_code: str = Field(min_length=6, max_length=16)
    display_name: str = Field(min_length=1, max_length=40)

    @field_validator("invite_code", "display_name")
    @classmethod
    def strip_party_join_fields(cls, value: str):
        return value.strip()


class PartyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    invite_code: str
    is_worldkeeper: bool = False
    created_at: datetime
    members: List[PartyMemberOut] = Field(default_factory=list)
    world: Optional[WorldOut] = None


class WorldEnter(BaseModel):
    route_id: uuid.UUID


class WorldPlay(BaseModel):
    workout_id: uuid.UUID
