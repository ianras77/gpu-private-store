from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional
from urllib.parse import urlparse, urlunparse

import httpx

from .config import Settings


@dataclass
class GatewayStatus:
    reachable: bool
    status_code: int | None
    latency_ms: float | None
    detail: str


class OpenClawClient:
    """Adapter over OpenClaw and optional local Ollama backends."""

    def __init__(self, settings: Settings, transport: Optional[httpx.AsyncBaseTransport] = None) -> None:
        self.settings = settings
        self._gateway_client = httpx.AsyncClient(
            base_url=settings.openclaw_gateway_base_url,
            timeout=settings.request_timeout_seconds,
            verify=settings.nextcloud_verify_tls,
            transport=transport,
        )
        self._ollama_clients = {
            "general": httpx.AsyncClient(
                base_url=settings.ollama_general_base_url,
                timeout=settings.request_timeout_seconds,
                verify=settings.nextcloud_verify_tls,
                transport=transport,
            ),
            "code": httpx.AsyncClient(
                base_url=settings.ollama_code_base_url,
                timeout=settings.request_timeout_seconds,
                verify=settings.nextcloud_verify_tls,
                transport=transport,
            ),
            "embed": httpx.AsyncClient(
                base_url=settings.ollama_embed_base_url,
                timeout=settings.request_timeout_seconds,
                verify=settings.nextcloud_verify_tls,
                transport=transport,
            ),
        }

    async def close(self) -> None:
        await self._gateway_client.aclose()
        for client in self._ollama_clients.values():
            await client.aclose()

    def _gateway_headers(self) -> Dict[str, str]:
        headers = {"Accept": "application/json"}
        if self.settings.openclaw_gateway_token_auth and self.settings.openclaw_gateway_token:
            headers["Authorization"] = f"Bearer {self.settings.openclaw_gateway_token}"
        return headers

    async def health(self) -> GatewayStatus:
        start = time.perf_counter()
        for path in ("/health", "/api/health", "/"):
            try:
                response = await self._gateway_client.get(path, headers=self._gateway_headers())
                if response.status_code < 500:
                    elapsed = (time.perf_counter() - start) * 1000
                    return GatewayStatus(
                        reachable=response.status_code < 400,
                        status_code=response.status_code,
                        latency_ms=round(elapsed, 2),
                        detail=response.text[:160],
                    )
            except httpx.HTTPError:
                continue
        elapsed = (time.perf_counter() - start) * 1000
        return GatewayStatus(
            reachable=False,
            status_code=None,
            latency_ms=round(elapsed, 2),
            detail="OpenClaw gateway unreachable",
        )

    async def ollama_status(self) -> Dict[str, Any]:
        results: list[Dict[str, Any]] = []
        for name, client in self._ollama_clients.items():
            started = time.perf_counter()
            try:
                response = await client.get("/api/tags")
                latency = round((time.perf_counter() - started) * 1000, 2)
                payload = response.json() if response.status_code < 500 else {}
                model_count = len(payload.get("models") or []) if isinstance(payload, dict) else 0
                results.append(
                    {
                        "name": name,
                        "baseUrl": str(client.base_url).rstrip("/"),
                        "reachable": response.status_code < 400,
                        "statusCode": response.status_code,
                        "latencyMs": latency,
                        "modelCount": model_count,
                    }
                )
            except Exception as exc:  # noqa: BLE001
                latency = round((time.perf_counter() - started) * 1000, 2)
                results.append(
                    {
                        "name": name,
                        "baseUrl": str(client.base_url).rstrip("/"),
                        "reachable": False,
                        "statusCode": None,
                        "latencyMs": latency,
                        "modelCount": 0,
                        "detail": str(exc),
                    }
                )
        return {
            "targets": results,
            "allReachable": all(item["reachable"] for item in results),
            "chatBackend": self.settings.openclaw_chat_backend,
        }

    async def chat_history(self, session_key: str, user_id: str) -> Dict[str, Any]:
        if self.settings.openclaw_chat_backend == "ollama":
            return {"items": []}

        params = {"sessionKey": session_key, "userId": user_id}
        for path in ("/api/chat/history", "/chat/history"):
            try:
                response = await self._gateway_client.get(path, params=params, headers=self._gateway_headers())
                if response.status_code == 404:
                    continue
                response.raise_for_status()
                return response.json()
            except httpx.HTTPError:
                continue
        return {"items": []}

    async def send_prompt(
        self,
        prompt: str,
        session_key: str,
        user_id: str,
        file_context: list[dict[str, Any]] | None = None,
    ) -> Dict[str, Any]:
        payload = {
            "prompt": prompt,
            "sessionKey": session_key,
            "userId": user_id,
            "fileContext": file_context or [],
        }

        backend = self.settings.openclaw_chat_backend
        if backend == "ollama":
            return await self._send_prompt_ollama(payload)

        if backend == "openclaw":
            return await self._send_prompt_openclaw(payload)

        if backend == "auto":
            try:
                return await self._send_prompt_openclaw(payload)
            except Exception as exc:  # noqa: BLE001
                response = await self._send_prompt_ollama(payload)
                response["fallback"] = {
                    "from": "openclaw",
                    "to": "ollama",
                    "reason": str(exc),
                }
                return response

        raise ValueError(f"Unsupported OPENCLAW_CHAT_BACKEND={backend!r}")

    async def _send_prompt_openclaw(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        if self.settings.openclaw_transport == "ws":
            return await self._send_prompt_ws(payload)
        return await self._send_prompt_http(payload)

    async def _send_prompt_http(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        for path in ("/api/chat/send", "/chat/send"):
            try:
                response = await self._gateway_client.post(path, json=payload, headers=self._gateway_headers())
                if response.status_code == 404:
                    continue
                response.raise_for_status()
                data = response.json()
                reply = data.get("reply") or data.get("message") or data.get("content") or ""
                return {"reply": reply, "raw": data, "provider": "openclaw"}
            except httpx.HTTPError:
                continue

        response = await self._gateway_client.post(
            "/v1/chat/completions",
            json={
                "model": "openclaw-default",
                "messages": [{"role": "user", "content": payload["prompt"]}],
            },
            headers=self._gateway_headers(),
        )
        response.raise_for_status()
        data = response.json()
        choice = (data.get("choices") or [{}])[0]
        message = choice.get("message") or {}
        return {
            "reply": message.get("content", ""),
            "raw": data,
            "provider": "openclaw-openai-compat",
        }

    async def _send_prompt_ollama(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        primary = self._infer_ollama_profile(payload.get("prompt", ""))
        prompt_with_context = self._inject_file_context(payload["prompt"], payload.get("fileContext", []))
        profile_order = [primary]
        for fallback in ("code", "general"):
            if fallback not in profile_order:
                profile_order.append(fallback)

        errors: list[dict[str, str]] = []

        for profile in profile_order:
            client = self._ollama_clients.get(profile) or self._ollama_clients["general"]
            try:
                model = await self._resolve_ollama_model(profile, client)
            except Exception as exc:  # noqa: BLE001
                errors.append({"profile": profile, "stage": "resolve-model", "error": str(exc)})
                continue

            try:
                chat_response = await client.post(
                    "/api/chat",
                    json={
                        "model": model,
                        "messages": [{"role": "user", "content": prompt_with_context}],
                        "stream": False,
                    },
                )
                if chat_response.status_code < 400:
                    data = chat_response.json()
                    message = data.get("message") or {}
                    reply = message.get("content") or data.get("response") or ""
                    return {
                        "reply": reply,
                        "raw": data,
                        "provider": f"ollama:{profile}",
                        "model": model,
                    }

                generate_response = await client.post(
                    "/api/generate",
                    json={
                        "model": model,
                        "prompt": prompt_with_context,
                        "stream": False,
                    },
                )
                if generate_response.status_code < 400:
                    data = generate_response.json()
                    return {
                        "reply": data.get("response", ""),
                        "raw": data,
                        "provider": f"ollama:{profile}",
                        "model": model,
                    }

                errors.append(
                    {
                        "profile": profile,
                        "stage": "generate",
                        "error": f"HTTP {generate_response.status_code}",
                    }
                )
            except httpx.TimeoutException as exc:
                errors.append({"profile": profile, "stage": "inference-timeout", "error": str(exc)})
            except Exception as exc:  # noqa: BLE001
                errors.append({"profile": profile, "stage": "inference", "error": str(exc)})

        return {
            "reply": "Ollama is reachable but inference timed out. Try a smaller prompt or model.",
            "raw": {"errors": errors},
            "provider": "ollama-unavailable",
            "timedOut": True,
        }

    def _inject_file_context(self, prompt: str, file_context: list[dict[str, Any]]) -> str:
        if not file_context:
            return prompt

        lines = [prompt, "", "Nextcloud file context:"]
        for item in file_context:
            lines.append(f"- {item.get('name', 'file')} ({item.get('path', '')}, {item.get('mime', '')})")
            content = item.get("content")
            if content:
                lines.append("  Preview:")
                for row in str(content).splitlines()[:30]:
                    lines.append(f"  {row}")
        return "\n".join(lines)

    def _infer_ollama_profile(self, prompt: str) -> str:
        lowered = prompt.lower()
        code_markers = (
            "code",
            "bug",
            "stack trace",
            "exception",
            "refactor",
            "typescript",
            "javascript",
            "python",
            "fastapi",
            "vue",
            "sql",
        )
        if any(marker in lowered for marker in code_markers):
            return "code"
        return "general"

    async def _resolve_ollama_model(self, profile: str, client: httpx.AsyncClient) -> str:
        configured = {
            "general": self.settings.ollama_chat_model,
            "code": self.settings.ollama_code_model,
            "embed": self.settings.ollama_embed_model,
        }.get(profile) or self.settings.ollama_chat_model
        if configured:
            return configured

        response = await client.get("/api/tags")
        response.raise_for_status()
        data = response.json()
        models = data.get("models") or []
        for model in models:
            name = model.get("name")
            if name:
                return str(name)

        raise RuntimeError(f"No Ollama models available at {client.base_url}")

    async def _send_prompt_ws(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        try:
            import websockets
        except ImportError as exc:  # pragma: no cover - optional runtime dependency
            raise RuntimeError("websockets package is required for ws transport") from exc

        ws_url = self._resolve_ws_url()
        headers = self._gateway_headers()
        async with websockets.connect(ws_url, additional_headers=headers) as conn:
            await conn.send(json.dumps(payload))
            raw_message = await conn.recv()
            try:
                parsed = json.loads(raw_message)
            except json.JSONDecodeError:
                return {"reply": str(raw_message), "raw": {"message": raw_message}, "provider": "openclaw-ws"}

            reply = parsed.get("reply") or parsed.get("message") or parsed.get("content") or ""
            return {"reply": reply, "raw": parsed, "provider": "openclaw-ws"}

    def _resolve_ws_url(self) -> str:
        if self.settings.reverse_proxy_wss_public_url:
            return self.settings.reverse_proxy_wss_public_url
        if self.settings.openclaw_public_wss_url:
            return self.settings.openclaw_public_wss_url

        parsed = urlparse(self.settings.openclaw_gateway_base_url)
        ws_scheme = "wss" if parsed.scheme == "https" else "ws"
        return urlunparse((ws_scheme, parsed.netloc, "/ws", "", "", ""))
