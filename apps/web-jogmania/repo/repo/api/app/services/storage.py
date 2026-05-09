import json
import boto3
from botocore.client import Config
from app.core.config import settings


class StorageNotConfigured(Exception):
    pass


class StorageUnavailable(Exception):
    pass


def get_s3_client():
    if not settings.minio_enabled:
        raise StorageNotConfigured("MinIO disabled")
    if not (settings.minio_endpoint and settings.minio_access_key and settings.minio_secret_key and settings.minio_bucket):
        raise StorageNotConfigured("MinIO settings missing")
    return boto3.client(
        "s3",
        endpoint_url=settings.minio_endpoint,
        aws_access_key_id=settings.minio_access_key,
        aws_secret_access_key=settings.minio_secret_key,
        region_name=settings.minio_region,
        config=Config(signature_version="s3v4")
    )


def ensure_bucket(client):
    try:
        client.head_bucket(Bucket=settings.minio_bucket)
    except Exception:
        client.create_bucket(Bucket=settings.minio_bucket)


def upload_workout_export(workout_id: str, payload: dict) -> str:
    try:
        client = get_s3_client()
        ensure_bucket(client)
        key = f"exports/workout-{workout_id}.json"
        body = json.dumps(payload).encode("utf-8")
        client.put_object(Bucket=settings.minio_bucket, Key=key, Body=body, ContentType="application/json")
        base = settings.minio_public_url or settings.minio_endpoint
        url = f"{base}/{settings.minio_bucket}/{key}"
        return url
    except StorageNotConfigured:
        raise
    except Exception as exc:
        raise StorageUnavailable("MinIO unavailable") from exc
