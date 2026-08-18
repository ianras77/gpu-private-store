#!/usr/bin/env python3
"""Fail-closed audit for RassyMind/Cheshire configuration drift."""

from __future__ import annotations

import argparse
import hashlib
import os
import re
from pathlib import Path


STALE = ("rassy-smart", "/v1/chat/completions", "/v1/embeddings")
APP_NAMES = (
    "web-astro", "web-bat", "web-crackstack", "web-lickingvape", "web-rasies",
    "web-rassyapp", "web-rassys", "web-totallyrighteoustales", "web-usmender",
    "rassyagi", "web-jogmania",
)


def _key(path: Path) -> str:
    for line in path.read_text(errors="replace").splitlines():
        if line.startswith("RASSYMIND_API_KEY="):
            return line.partition("=")[2].strip()
    return ""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apps-root", type=Path, default=Path("/data/runtipi/runtipi-appstore/gpu-private-store/apps"))
    parser.add_argument("--managed-root", type=Path, default=Path("/data/runtipi/apps/gpu-private-store"))
    parser.add_argument("--env-root", type=Path, default=Path("/data/runtipi/user-config/gpu-private-store"))
    parser.add_argument("--canonical-env", type=Path, default=Path("/data/apps/rassymind/.env"))
    args = parser.parse_args()
    failures: list[str] = []

    canonical = _key(args.canonical_env)
    if not canonical:
        failures.append(f"missing canonical key: {args.canonical_env}")
    canonical_digest = hashlib.sha256(canonical.encode()).hexdigest() if canonical else ""

    for app in APP_NAMES:
        for root, label in ((args.apps_root, "source"), (args.managed_root, "managed")):
            compose = root / app / "docker-compose.yml"
            if not compose.exists():
                continue
            text = compose.read_text(errors="replace")
            for stale in STALE:
                if stale in text:
                    failures.append(f"{label}:{app}: stale {stale}")
        env = args.env_root / app / "app.env"
        if env.exists():
            value = _key(env)
            if not value:
                failures.append(f"env:{app}: missing RASSYMIND_API_KEY")
            elif canonical_digest and hashlib.sha256(value.encode()).hexdigest() != canonical_digest:
                failures.append(f"env:{app}: key does not match canonical key")

    if failures:
        print("RASSYMIND_DRIFT=FAIL")
        print("\n".join(failures))
        return 1
    print(f"RASSYMIND_DRIFT=PASS apps={len(APP_NAMES)} key_digest={canonical_digest[:12]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
