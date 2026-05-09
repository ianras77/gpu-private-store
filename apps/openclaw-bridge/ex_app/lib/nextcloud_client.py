from __future__ import annotations

import json
import mimetypes
from dataclasses import dataclass
from typing import Any, Dict, Iterable, Optional
from urllib.parse import quote

import httpx

from .config import Settings


@dataclass
class FileContextItem:
    file_id: int
    name: str
    path: str
    mime: str
    size: int | None
    content: str | None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "fileId": self.file_id,
            "name": self.name,
            "path": self.path,
            "mime": self.mime,
            "size": self.size,
            "content": self.content,
        }


class NextcloudClient:
    """Client for per-user OCS + WebDAV operations."""

    def __init__(self, settings: Settings, transport: Optional[httpx.AsyncBaseTransport] = None) -> None:
        self.settings = settings
        self._client = httpx.AsyncClient(
            base_url=settings.nextcloud_url,
            timeout=settings.request_timeout_seconds,
            verify=settings.nextcloud_verify_tls,
            transport=transport,
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def get_me(self, upstream_headers: Dict[str, str], fallback_user: str) -> Dict[str, Any]:
        headers = self._ocs_headers(upstream_headers)
        response = await self._client.get(f"{self.settings.nextcloud_ocs_path}/cloud/user", params={"format": "json"}, headers=headers)
        if response.status_code >= 400:
            return {"id": fallback_user, "displayName": fallback_user}

        data = response.json()
        payload = (
            data.get("ocs", {})
            .get("data", {})
        )
        uid = payload.get("id") or payload.get("uid") or fallback_user
        display_name = payload.get("display-name") or payload.get("displayName") or uid
        return {"id": uid, "displayName": display_name}

    async def build_file_context(
        self,
        user_id: str,
        file_ids: Iterable[int],
        upstream_headers: Dict[str, str],
        include_content: bool,
        safe_text_mime_types: Iterable[str],
        max_preview_chars: int = 4000,
    ) -> list[Dict[str, Any]]:
        safe_types = set(safe_text_mime_types)
        contexts: list[Dict[str, Any]] = []
        for raw_file_id in file_ids:
            metadata = await self.get_file_metadata(user_id, int(raw_file_id), upstream_headers)
            if not metadata:
                continue

            mime = metadata.get("mime") or "application/octet-stream"
            content: str | None = None
            if include_content and mime in safe_types:
                downloaded = await self.download_file_text(
                    user_id=user_id,
                    relative_path=metadata["path"],
                    upstream_headers=upstream_headers,
                    max_chars=max_preview_chars,
                )
                content = downloaded

            contexts.append(
                FileContextItem(
                    file_id=int(raw_file_id),
                    name=metadata.get("name") or f"file-{raw_file_id}",
                    path=metadata.get("path") or "",
                    mime=mime,
                    size=metadata.get("size"),
                    content=content,
                ).to_dict()
            )
        return contexts

    async def get_file_metadata(
        self,
        user_id: str,
        file_id: int,
        upstream_headers: Dict[str, str],
    ) -> Dict[str, Any] | None:
        headers = self._ocs_headers(upstream_headers)
        routes = (
            f"{self.settings.nextcloud_ocs_path}/apps/files/api/v1/file/{file_id}",
            f"{self.settings.nextcloud_ocs_path}/apps/files/api/v1/files/{file_id}",
        )

        for path in routes:
            response = await self._client.get(path, params={"format": "json"}, headers=headers)
            if response.status_code == 404:
                continue
            if response.status_code >= 400:
                continue
            return self._extract_file_info(response.json(), file_id, user_id)

        return None

    async def read_text_document(
        self,
        user_id: str,
        relative_path: str,
        upstream_headers: Dict[str, str],
    ) -> str | None:
        response = await self._client.get(
            self._dav_path(user_id, relative_path),
            headers=self._dav_headers(upstream_headers),
        )
        if response.status_code == 404:
            return None
        if response.status_code >= 400:
            response.raise_for_status()
        return response.text

    async def write_text_document(
        self,
        user_id: str,
        relative_path: str,
        content: str,
        upstream_headers: Dict[str, str],
        content_type: str = "text/plain; charset=utf-8",
    ) -> None:
        folder = relative_path.rsplit("/", 1)[0] if "/" in relative_path else ""
        if folder:
            await self._ensure_folder(user_id, folder, upstream_headers)

        response = await self._client.put(
            self._dav_path(user_id, relative_path),
            headers={**self._dav_headers(upstream_headers), "Content-Type": content_type},
            content=content.encode("utf-8"),
        )
        response.raise_for_status()

    async def read_json_document(
        self,
        user_id: str,
        relative_path: str,
        upstream_headers: Dict[str, str],
    ) -> Dict[str, Any] | None:
        text = await self.read_text_document(user_id, relative_path, upstream_headers)
        if text is None:
            return None
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            return None
        return payload if isinstance(payload, dict) else None

    async def write_json_document(
        self,
        user_id: str,
        relative_path: str,
        payload: Dict[str, Any],
        upstream_headers: Dict[str, str],
    ) -> None:
        await self.write_text_document(
            user_id=user_id,
            relative_path=relative_path,
            content=json.dumps(payload, indent=2, sort_keys=True),
            upstream_headers=upstream_headers,
            content_type="application/json; charset=utf-8",
        )

    async def download_file_text(
        self,
        user_id: str,
        relative_path: str,
        upstream_headers: Dict[str, str],
        max_chars: int,
    ) -> str | None:
        dav_url = self._dav_path(user_id, relative_path)
        response = await self._client.get(dav_url, headers=self._dav_headers(upstream_headers))
        if response.status_code >= 400:
            return None

        text = response.text
        if len(text) > max_chars:
            return text[:max_chars] + "\n...[truncated]"
        return text

    async def save_output(
        self,
        user_id: str,
        text: str,
        filename: str,
        folder: str,
        upstream_headers: Dict[str, str],
    ) -> Dict[str, Any]:
        await self._ensure_folder(user_id, folder, upstream_headers)
        output_path = f"{folder.strip('/')}/{filename}"
        guessed_mime = mimetypes.guess_type(filename)[0] or "text/plain"
        response = await self._client.put(
            self._dav_path(user_id, output_path),
            headers={**self._dav_headers(upstream_headers), "Content-Type": guessed_mime},
            content=text.encode("utf-8"),
        )
        response.raise_for_status()
        return {
            "path": output_path,
            "status": response.status_code,
        }

    async def _ensure_folder(self, user_id: str, folder: str, upstream_headers: Dict[str, str]) -> None:
        parts = [part for part in folder.split("/") if part]
        running = []
        for part in parts:
            running.append(part)
            response = await self._client.request(
                "MKCOL",
                self._dav_path(user_id, "/".join(running)),
                headers=self._dav_headers(upstream_headers),
            )
            if response.status_code in {200, 201, 204, 207, 301, 302, 405}:
                continue
            response.raise_for_status()

    def _extract_file_info(self, payload: Dict[str, Any], file_id: int, user_id: str) -> Dict[str, Any]:
        cursor: Any = payload
        if "ocs" in payload:
            cursor = payload.get("ocs", {}).get("data", payload)

        if isinstance(cursor, list) and cursor:
            cursor = cursor[0]

        if not isinstance(cursor, dict):
            cursor = {}

        path = (
            cursor.get("path")
            or cursor.get("file")
            or cursor.get("davPath")
            or cursor.get("filename")
            or ""
        )
        path = self._normalize_relative_path(path, user_id)

        name = cursor.get("name") or path.split("/")[-1] or f"file-{file_id}"
        mime = cursor.get("mimetype") or cursor.get("mime") or "application/octet-stream"
        size = cursor.get("size")
        return {
            "fileId": file_id,
            "path": path,
            "name": name,
            "mime": mime,
            "size": size,
        }

    def _normalize_relative_path(self, path: str, user_id: str) -> str:
        normalized = path.strip()
        normalized = normalized.lstrip("/")
        user_prefix = f"files/{user_id}/"
        if normalized.startswith(user_prefix):
            normalized = normalized[len(user_prefix):]
        return normalized

    def _ocs_headers(self, upstream_headers: Dict[str, str]) -> Dict[str, str]:
        headers = {
            "OCS-APIRequest": "true",
            "Accept": "application/json",
        }
        forwarded = self._forwardable_headers(upstream_headers)
        headers.update(forwarded)
        return headers

    def _dav_headers(self, upstream_headers: Dict[str, str]) -> Dict[str, str]:
        headers = {"Accept": "*/*"}
        headers.update(self._forwardable_headers(upstream_headers))
        return headers

    def _forwardable_headers(self, upstream_headers: Dict[str, str]) -> Dict[str, str]:
        forwarded: Dict[str, str] = {}
        for key in ("authorization", "cookie", "requesttoken"):
            if key in upstream_headers:
                forwarded[key.title() if key != "requesttoken" else "requesttoken"] = upstream_headers[key]
        return forwarded

    def _dav_path(self, user_id: str, relative_path: str) -> str:
        base = self.settings.nextcloud_webdav_root.rstrip("/")
        quoted_user = quote(user_id, safe="")
        clean_relative = "/".join(
            quote(part, safe="") for part in relative_path.split("/") if part
        )
        return f"{base}/{quoted_user}/{clean_relative}"
