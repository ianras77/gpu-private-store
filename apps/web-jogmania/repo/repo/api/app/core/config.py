import json
from pydantic_settings import BaseSettings
from pydantic import Field, field_validator
from typing import List


class Settings(BaseSettings):
    app_name: str = "Jogmania API"
    env: str = "dev"
    database_url: str = Field("postgresql+psycopg2://jogmania:jogmania@postgres:5432/jogmania", alias="DATABASE_URL")
    jwt_secret: str = Field("change-me", alias="JWT_SECRET")
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7

    redis_url: str = Field("redis://redis:6379/0", alias="REDIS_URL")

    auth_cookie_name: str = Field("jm_session", alias="AUTH_COOKIE_NAME")
    auth_cookie_secure: bool = Field(False, alias="AUTH_COOKIE_SECURE")
    auth_cookie_samesite: str = Field("lax", alias="AUTH_COOKIE_SAMESITE")
    auth_cookie_domain: str | None = Field(None, alias="AUTH_COOKIE_DOMAIN")
    auth_require_email_verification: bool = Field(False, alias="AUTH_REQUIRE_EMAIL_VERIFICATION")
    email_verification_expire_hours: int = Field(48, alias="EMAIL_VERIFICATION_EXPIRE_HOURS")

    smtp_host: str | None = Field(None, alias="SMTP_HOST")
    smtp_port: int = Field(587, alias="SMTP_PORT")
    smtp_user: str | None = Field(None, alias="SMTP_USER")
    smtp_password: str | None = Field(None, alias="SMTP_PASSWORD")
    smtp_from: str | None = Field(None, alias="SMTP_FROM")
    smtp_tls: bool = Field(True, alias="SMTP_TLS")

    minio_endpoint: str = Field("http://minio:9000", alias="MINIO_ENDPOINT")
    minio_access_key: str = Field("minioadmin", alias="MINIO_ACCESS_KEY")
    minio_secret_key: str = Field("minioadmin", alias="MINIO_SECRET_KEY")
    minio_bucket: str = Field("jogmania-exports", alias="MINIO_BUCKET")
    minio_region: str = Field("us-east-1", alias="MINIO_REGION")
    minio_public_url: str | None = Field(None, alias="MINIO_PUBLIC_URL")
    minio_enabled: bool = Field(True, alias="MINIO_ENABLED")

    cors_origins: List[str] = Field(default_factory=lambda: ["http://localhost:3000", "http://localhost:19006"], alias="CORS_ORIGINS")

    llm_url: str | None = Field(None, alias="ADVENTURE_LLM_URL")
    llm_api_key: str | None = Field(None, alias="ADVENTURE_LLM_API_KEY")
    llm_model: str | None = Field(None, alias="ADVENTURE_LLM_MODEL")

    class Config:
        env_file = (".env", "../.env", "../../.env")
        case_sensitive = False
        extra = "ignore"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_cors(cls, value):
        if isinstance(value, str):
            raw = value.strip()
            if raw.startswith("["):
                try:
                    parsed = json.loads(raw)
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed if str(item).strip()]
                except json.JSONDecodeError:
                    pass
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("auth_cookie_samesite", mode="before")
    @classmethod
    def normalize_samesite(cls, value):
        if isinstance(value, str):
            return value.lower()
        return value


settings = Settings()
