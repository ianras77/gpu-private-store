#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import dataclass


DEFAULT_PROJECT = "web-bat_gpu-private-store"
DEFAULT_NETWORK = f"{DEFAULT_PROJECT}_{DEFAULT_PROJECT}_network"
DEFAULT_SERVICES = {
    "bat-api": "bat-api",
    "bat-worker": "bat-worker",
    "bat-postgres": "bat-postgres",
    "bat-redis": "bat-redis",
    "bat-qdrant": "bat-qdrant",
}


@dataclass(frozen=True)
class ContainerNetwork:
    container: str
    network: str
    aliases: set[str]


def _docker_inspect(container: str) -> dict:
    result = subprocess.run(
        ["docker", "inspect", container],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"{container}: docker inspect failed: {result.stderr.strip() or result.stdout.strip()}")
    payload = json.loads(result.stdout)
    if not payload:
        raise RuntimeError(f"{container}: docker inspect returned no records")
    return payload[0]


def _network_for(container: str, network: str) -> ContainerNetwork:
    inspect = _docker_inspect(container)
    networks = ((inspect.get("NetworkSettings") or {}).get("Networks") or {})
    entry = networks.get(network)
    if not isinstance(entry, dict):
        joined = ", ".join(sorted(networks)) or "none"
        raise RuntimeError(f"{container}: not attached to {network}; attached networks: {joined}")
    aliases = {str(item) for item in (entry.get("Aliases") or []) if item}
    return ContainerNetwork(container=container, network=network, aliases=aliases)


def verify(project: str, network: str, services: dict[str, str]) -> list[str]:
    errors: list[str] = []
    for service, alias in services.items():
        container = f"{project}-{service}-1"
        try:
            network_state = _network_for(container, network)
        except RuntimeError as exc:
            errors.append(str(exc))
            continue
        if alias not in network_state.aliases:
            visible = ", ".join(sorted(network_state.aliases)) or "none"
            errors.append(f"{container}: missing alias {alias!r} on {network}; aliases: {visible}")
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify BAT Runtipi containers share the generated app network.")
    parser.add_argument("--project", default=DEFAULT_PROJECT)
    parser.add_argument("--network", default=DEFAULT_NETWORK)
    args = parser.parse_args(argv)

    errors = verify(args.project, args.network, DEFAULT_SERVICES)
    if errors:
        print("Runtipi network verification failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(f"ok: {len(DEFAULT_SERVICES)} containers attached to {args.network} with expected aliases")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
