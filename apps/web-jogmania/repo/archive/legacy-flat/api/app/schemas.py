from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, ConfigDict


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    created_at: datetime | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class CourseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str
    distance_km: float
    theme_key: str
    best_pace_s_per_km: int | None = None
    last_pace_s_per_km: int | None = None
    points: int
    created_at: datetime | None = None


class RunEventIn(BaseModel):
    type: str
    ts_s: int
    data: dict | None = None


class RunEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    event_type: str
    ts_s: int
    data: dict | None


class RunCreate(BaseModel):
    course_id: str
    distance_m: float
    duration_s: int
    avg_pace_s_per_km: int
    session_points: int = 0
    events: list[RunEventIn] = Field(default_factory=list)


class RunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    course_id: str | None = None
    distance_m: float
    duration_s: int
    avg_pace_s_per_km: int
    points: int
    improvement_s_per_km: int | None = None
    created_at: datetime | None = None
    events: list[RunEventOut] = Field(default_factory=list)


class QuestOut(BaseModel):
    title: str
    goal: str
    reward: str
    seed: int
    expires: str


class LootRollIn(BaseModel):
    distance_m: float
    duration_s: int
    avg_pace_s_per_km: int
    events: list[RunEventIn] = Field(default_factory=list)


class LootItemOut(BaseModel):
    name: str
    rarity: str
    description: str


class LootRollOut(BaseModel):
    items: list[LootItemOut]


class ExportOut(BaseModel):
    run_id: str
    url: str
