import json
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.settings import get_settings

settings = get_settings()


def get_s3_client(endpoint_url: str | None = None):
    return boto3.client(
        "s3",
        endpoint_url=endpoint_url or settings.S3_ENDPOINT_URL,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        region_name=settings.S3_REGION,
        config=Config(s3={"addressing_style": "path"})
    )


def ensure_bucket():
    client = get_s3_client()
    try:
        client.head_bucket(Bucket=settings.S3_BUCKET)
    except ClientError:
        client.create_bucket(Bucket=settings.S3_BUCKET)
    except Exception:
        # In tests or offline mode, MinIO might be unavailable.
        return


def upload_json(key: str, payload: dict) -> str:
    client = get_s3_client()
    body = json.dumps(payload, indent=2).encode("utf-8")
    client.put_object(Bucket=settings.S3_BUCKET, Key=key, Body=body, ContentType="application/json")
    return key


def presign_url(key: str, expires_in: int = 3600) -> str:
    public_endpoint = settings.S3_PUBLIC_BASE or settings.S3_ENDPOINT_URL
    client = get_s3_client(endpoint_url=public_endpoint)
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.S3_BUCKET, "Key": key},
        ExpiresIn=expires_in
    )
