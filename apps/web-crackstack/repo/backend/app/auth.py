from __future__ import annotations

import os
from typing import Dict

from fastapi import Header, HTTPException, status


def _parse_api_keys() -> Dict[str, str]:
    raw = os.getenv("CRACKSTACK_API_KEYS", "local-dev-key:tenant_demo")
    mapping: Dict[str, str] = {}
    for item in raw.split(","):
        item = item.strip()
        if not item:
            continue
        if ":" not in item:
            continue
        key, tenant = item.split(":", 1)
        mapping[key.strip()] = tenant.strip()
    return mapping


API_KEYS = _parse_api_keys()
DEFAULT_USER_ID = os.getenv("CRACKSTACK_DEFAULT_USER_ID", "user_demo")


def get_tenant_id(x_api_key: str = Header(..., alias="X-API-Key")) -> str:
    tenant_id = API_KEYS.get(x_api_key)
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid API key",
        )
    return tenant_id


def get_user_id(x_user_id: str | None = Header(default=None, alias="X-User-Id")) -> str:
    if x_user_id and x_user_id.strip():
        return x_user_id.strip()
    return DEFAULT_USER_ID
