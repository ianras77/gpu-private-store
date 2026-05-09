from __future__ import annotations

from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from pydantic import BaseModel, ConfigDict, Field

from app.auth import get_tenant_id
from app.data import store
from app.data.sqlserver import SQLSERVER_ENABLED, SqlServerExportError, export_latest_to_sqlserver
from app.data.store import DatasetNotFound, IngestError, UnsupportedFileType

router = APIRouter(prefix="/datasets", tags=["datasets"])
FILE_REQUIRED = File(...)


class DatasetListItem(BaseModel):
    dataset_id: str
    name: str
    description: str | None = None
    rows: int = Field(ge=0)


class DatasetListResponse(BaseModel):
    datasets: list[DatasetListItem]


class SchemaColumn(BaseModel):
    name: str
    type: str
    nulls: int | None = Field(default=None, ge=0)
    distinct: int | None = Field(default=None, ge=0)
    canonical_name: str | None = None
    example_values: list[Any] = Field(default_factory=list)
    stats: dict[str, Any] | None = None


class SchemaResponse(BaseModel):
    dataset_id: str
    columns: list[SchemaColumn]


class SampleResponse(BaseModel):
    dataset_id: str
    rows: list[dict[str, Any]]


class DatasetUploadResponse(BaseModel):
    dataset_id: str
    version_id: str
    row_count: int
    name: str


class ColumnProfile(BaseModel):
    name: str
    canonical_name: str
    type: str
    nullable: bool
    example_values: list[str]
    stats: dict[str, Any]


class TableProfile(BaseModel):
    name: str
    columns: list[ColumnProfile]
    primary_key_candidates: list[str]
    notes: list[str]


class DatasetProfileResponse(BaseModel):
    dataset_id: str
    version_id: str
    row_count: int
    tables: list[TableProfile]
    inference_version: str
    sample_rows: list[dict[str, Any]] | None = None


class SqlServerExportRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    host: str
    port: int = Field(default=1433, ge=1, le=65535)
    database: str = Field(min_length=1)
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)
    schema_name: str = Field(default="dbo", min_length=1, alias="schema")
    table: str = Field(min_length=1)
    if_exists: Literal["fail", "replace", "append"] = "fail"
    batch_size: int = Field(default=10_000, ge=100, le=100_000)
    encrypt: bool = True
    trust_server_certificate: bool = False


class SqlServerExportResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    dataset_id: str
    version_id: str
    row_count: int
    table: str
    schema_name: str = Field(alias="schema")


@router.get("", response_model=DatasetListResponse)
async def list_datasets(tenant_id: str = Depends(get_tenant_id)) -> DatasetListResponse:
    return DatasetListResponse(datasets=store.list_datasets(tenant_id))


@router.get("/{dataset_id}/schema", response_model=SchemaResponse)
async def get_schema(
    dataset_id: str, tenant_id: str = Depends(get_tenant_id)
) -> SchemaResponse:
    try:
        schema = store.get_schema(tenant_id, dataset_id)
    except DatasetNotFound as exc:
        raise HTTPException(status_code=404, detail="dataset not found") from exc
    return SchemaResponse(dataset_id=dataset_id, columns=schema)


@router.get("/{dataset_id}/sample", response_model=SampleResponse)
async def sample_rows(
    dataset_id: str,
    limit: int = Query(default=5, ge=1, le=200),
    tenant_id: str = Depends(get_tenant_id),
) -> SampleResponse:
    try:
        rows = store.sample_rows(tenant_id, dataset_id, limit=limit)
    except DatasetNotFound as exc:
        raise HTTPException(status_code=404, detail="dataset not found") from exc
    return SampleResponse(dataset_id=dataset_id, rows=rows)


@router.post("/upload", response_model=DatasetUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_dataset(
    file: UploadFile = FILE_REQUIRED,
    name: str | None = Form(default=None),
    description: str | None = Form(default=None),
    tenant_id: str = Depends(get_tenant_id),
) -> DatasetUploadResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="filename is required")

    safe_name = Path(file.filename).name
    upload_dir = store.DATA_DIR / "tenants" / tenant_id / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    upload_path = upload_dir / f"{uuid4().hex}_{safe_name}"

    with upload_path.open("wb") as buffer:
        while chunk := await file.read(1024 * 1024):
            buffer.write(chunk)
    await file.close()

    try:
        result = store.ingest_upload(
            tenant_id,
            upload_path,
            original_filename=safe_name,
            name=name,
            description=description,
        )
    except UnsupportedFileType as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except IngestError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return DatasetUploadResponse(**result)


@router.post("/{dataset_id}/profile", response_model=DatasetProfileResponse)
async def create_profile(
    dataset_id: str,
    tenant_id: str = Depends(get_tenant_id),
) -> DatasetProfileResponse:
    try:
        profile = store.profile_dataset(tenant_id, dataset_id)
    except DatasetNotFound as exc:
        raise HTTPException(status_code=404, detail="dataset not found") from exc
    profile.setdefault("sample_rows", store.sample_rows(tenant_id, dataset_id, limit=5))
    return DatasetProfileResponse(**profile)


@router.get("/{dataset_id}/profile", response_model=DatasetProfileResponse)
async def get_profile(
    dataset_id: str,
    tenant_id: str = Depends(get_tenant_id),
) -> DatasetProfileResponse:
    try:
        profile = store.get_profile(tenant_id, dataset_id)
    except DatasetNotFound as exc:
        raise HTTPException(status_code=404, detail="dataset not found") from exc
    profile.setdefault("sample_rows", store.sample_rows(tenant_id, dataset_id, limit=5))
    return DatasetProfileResponse(**profile)


@router.post(
    "/{dataset_id}/export/sqlserver",
    response_model=SqlServerExportResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def export_sqlserver(
    dataset_id: str,
    payload: SqlServerExportRequest,
    tenant_id: str = Depends(get_tenant_id),
) -> SqlServerExportResponse:
    if not SQLSERVER_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SQL Server connector disabled. Set CRACKSTACK_SQLSERVER_ENABLED=1.",
        )
    try:
        result = export_latest_to_sqlserver(
            tenant_id,
            dataset_id,
            host=payload.host,
            port=payload.port,
            database=payload.database,
            username=payload.username,
            password=payload.password,
            schema=payload.schema_name,
            table=payload.table,
            if_exists=payload.if_exists,
            batch_size=payload.batch_size,
            encrypt=payload.encrypt,
            trust_server_certificate=payload.trust_server_certificate,
        )
    except DatasetNotFound as exc:
        raise HTTPException(status_code=404, detail="dataset not found") from exc
    except SqlServerExportError as exc:
        detail = str(exc)
        if "already exists" in detail:
            status_code = status.HTTP_409_CONFLICT
        else:
            status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        raise HTTPException(status_code=status_code, detail=detail) from exc

    return SqlServerExportResponse(**result)


@router.get("/{dataset_id}/download")
async def download_dataset(
    dataset_id: str,
    format: Literal["csv"] = Query(default="csv"),
    tenant_id: str = Depends(get_tenant_id),
) -> Response:
    if format != "csv":
        raise HTTPException(status_code=400, detail="unsupported format")
    try:
        payload = store.download_latest_csv(tenant_id, dataset_id)
    except DatasetNotFound as exc:
        raise HTTPException(status_code=404, detail="dataset not found") from exc

    filename = f"{dataset_id}_{payload['version_id']}.csv"
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "X-Dataset-Id": dataset_id,
        "X-Version-Id": payload["version_id"],
    }
    return Response(
        content=payload["content"],
        media_type="text/csv; charset=utf-8",
        headers=headers,
    )
