from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


class IngestRequest(BaseModel):
    query: str | None = None
    limit: int = Field(default=10, ge=1, le=30)
    use_query_pack: bool = False
    include_x: bool | None = None


class SourceOut(BaseModel):
    id: UUID
    title: str | None
    source_url: str
    canonical_url: str | None
    fetched_at: datetime
    metadata: dict


class ThemeOut(BaseModel):
    id: UUID
    slug: str
    name: str
    description: str | None
    active_score: float | None
    last_seen_at: datetime | None


class EditorialGenerateRequest(BaseModel):
    object_type: str = "lead_story"
    theme_slug: str | None = None
    publish_now: bool = False
    immediate_social: bool = False


class EditorialOut(BaseModel):
    id: UUID
    object_type: str
    status: str
    title: str | None
    slug: str | None
    dek: str | None
    body_md: str | None
    summary: str | None
    metadata: dict
    created_at: datetime
    published_at: datetime | None


class HomepageOut(BaseModel):
    id: UUID
    status: str
    layout_json: dict
    rationale: str | None
    created_at: datetime
    published_at: datetime | None


class SocialOut(BaseModel):
    id: UUID
    platform: str
    status: str
    body: str
    thread_group: str | None
    metadata: dict
    created_at: datetime
    published_at: datetime | None


class VoiceMemoryIn(BaseModel):
    memory_type: str
    key: str
    value: str
    weight: float = 1.0


class VoiceMemoryOut(BaseModel):
    id: UUID
    memory_type: str
    key: str
    value: str
    weight: float
    updated_at: datetime


class TrendOut(BaseModel):
    id: UUID
    observation_date: date
    title: str | None
    summary: str | None
    change_type: str | None
    confidence: float | None
    metadata: dict


class SystemSettingsUpdateIn(BaseModel):
    direct_publish: bool | None = None
    x_live_posting: bool | None = None
    x_research_enabled: bool | None = None
    research_directive: str | None = None
    analysis_directive: str | None = None
    voice_blueprint: str | None = None
    live_vibe: str | None = None


class SocialLiveRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=600)
    intent: str = Field(default="response", max_length=40)
    publish_now: bool = True
    platform: str = "x"
