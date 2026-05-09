#!/usr/bin/env python3

from __future__ import annotations

import json
import os
import shlex
import subprocess
import sys
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

HOST = "0.0.0.0"
PORT = int(os.environ.get("PORT", "8090"))
STATE_DIR = Path(os.environ.get("STATE_DIR", "/state")).expanduser().resolve()
STATE_DIR.mkdir(parents=True, exist_ok=True)

VAULT_PATH = Path(os.environ.get("VAULT_PATH", "/vault/obsidian")).expanduser().resolve()
IMPORT_SCRIPT = Path(os.environ.get("IMPORT_SCRIPT", "/app/import-obsidian.py")).expanduser().resolve()
STATUS_FILE = STATE_DIR / "importer-status.json"
REPORT_FILE = STATE_DIR / "import-report.md"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def tail_text(path: Path, max_lines: int = 120) -> str:
    if not path.exists():
        return ""

    try:
        with path.open("r", encoding="utf-8", errors="replace") as handle:
            lines = handle.readlines()
    except OSError as error:
        return f"Unable to read log: {error}"

    if len(lines) > max_lines:
        lines = lines[-max_lines:]

    return "".join(lines).strip()


class ImportRunner:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._process: subprocess.Popen[str] | None = None
        self._log_handle: Any | None = None
        self._state = self._load_state()

        if self._state.get("running"):
            self._state["running"] = False
            self._state["status"] = "failed"
            self._state["finished_at"] = now_iso()
            self._state["note"] = "Importer service restarted while a run was in progress."
            self._save_state()

    def _default_state(self) -> dict[str, Any]:
        return {
            "status": "idle",
            "running": False,
            "mode": None,
            "started_at": None,
            "finished_at": None,
            "exit_code": None,
            "log_path": None,
            "report_path": str(REPORT_FILE),
            "command": None,
            "note": "No import run started yet.",
        }

    def _load_state(self) -> dict[str, Any]:
        if STATUS_FILE.exists():
            try:
                with STATUS_FILE.open("r", encoding="utf-8") as handle:
                    data = json.load(handle)
                    return {**self._default_state(), **data}
            except (OSError, json.JSONDecodeError):
                pass
        return self._default_state()

    def _save_state(self) -> None:
        tmp_path = STATUS_FILE.with_suffix(".tmp")
        with tmp_path.open("w", encoding="utf-8") as handle:
            json.dump(self._state, handle, indent=2, sort_keys=True)
        tmp_path.replace(STATUS_FILE)

    def _artifacts(self) -> list[str]:
        try:
            return sorted(entry.name for entry in STATE_DIR.iterdir())
        except OSError:
            return []

    def _refresh_locked(self) -> None:
        if self._process is None:
            return

        exit_code = self._process.poll()
        if exit_code is None:
            return

        self._finalize_locked(exit_code)

    def _finalize_locked(self, exit_code: int) -> None:
        if self._log_handle is not None:
            try:
                self._log_handle.flush()
                self._log_handle.close()
            except OSError:
                pass
            self._log_handle = None

        self._process = None
        self._state["running"] = False
        self._state["status"] = "succeeded" if exit_code == 0 else "failed"
        self._state["exit_code"] = exit_code
        self._state["finished_at"] = now_iso()
        self._state["report_path"] = str(REPORT_FILE) if REPORT_FILE.exists() else None
        self._state["note"] = "Import completed successfully." if exit_code == 0 else "Import finished with errors."
        self._save_state()

    def _watch_process(self, process: subprocess.Popen[str]) -> None:
        exit_code = process.wait()
        with self._lock:
            if self._process is process:
                self._finalize_locked(exit_code)

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            self._refresh_locked()
            log_path = Path(self._state["log_path"]) if self._state.get("log_path") else None
            snapshot = dict(self._state)

        snapshot["vault_path"] = str(VAULT_PATH)
        snapshot["state_dir"] = str(STATE_DIR)
        snapshot["artifacts"] = self._artifacts()
        snapshot["log_tail"] = tail_text(log_path) if log_path else ""
        snapshot["report_path"] = str(REPORT_FILE) if REPORT_FILE.exists() else snapshot.get("report_path")
        snapshot["report_exists"] = REPORT_FILE.exists()
        snapshot["script_path"] = str(IMPORT_SCRIPT)
        return snapshot

    def start(self, payload: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        with self._lock:
            self._refresh_locked()

            if self._process is not None:
                current_state = dict(self._state)
                return 409, {
                    "error": "An import is already running.",
                    "status": current_state,
                }

            if not IMPORT_SCRIPT.exists():
                return 500, {"error": f"Import script not found at {IMPORT_SCRIPT}"}

            if not VAULT_PATH.exists():
                return 400, {"error": f"Vault path not found: {VAULT_PATH}"}

            mode = payload.get("mode", "dry-run")
            if mode not in {"dry-run", "live"}:
                return 400, {"error": "mode must be 'dry-run' or 'live'"}

            command = [sys.executable, str(IMPORT_SCRIPT), str(VAULT_PATH), "--report", "--verbose"]
            if mode == "dry-run":
                command.append("--dry-run")

            limit = payload.get("limit")
            if isinstance(limit, int) and limit > 0:
                command.extend(["--limit", str(limit)])

            min_words = payload.get("min_words")
            if isinstance(min_words, int) and min_words > 0:
                command.extend(["--min-words", str(min_words)])

            after = payload.get("after")
            if isinstance(after, str) and after.strip():
                command.extend(["--after", after.strip()])

            skip_folders = payload.get("skip_folders")
            if isinstance(skip_folders, str) and skip_folders.strip():
                command.extend(["--skip-folders", skip_folders.strip()])

            if payload.get("no_llm"):
                command.append("--no-llm")
            if payload.get("no_embed"):
                command.append("--no-embed")
            if payload.get("no_secret_scan"):
                command.append("--no-secret-scan")

            timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            log_path = STATE_DIR / f"import-{timestamp}-{mode}.log"
            log_handle = log_path.open("w", encoding="utf-8", buffering=1)

            env = os.environ.copy()
            process = subprocess.Popen(
                command,
                cwd=str(IMPORT_SCRIPT.parent),
                stdout=log_handle,
                stderr=subprocess.STDOUT,
                text=True,
                env=env,
            )

            self._process = process
            self._log_handle = log_handle
            self._state.update(
                {
                    "status": "running",
                    "running": True,
                    "mode": mode,
                    "started_at": now_iso(),
                    "finished_at": None,
                    "exit_code": None,
                    "log_path": str(log_path),
                    "report_path": str(REPORT_FILE),
                    "command": " ".join(shlex.quote(part) for part in command),
                    "note": "Import launched from the Open Brain dashboard.",
                }
            )
            self._save_state()

            watcher = threading.Thread(target=self._watch_process, args=(process,), daemon=True)
            watcher.start()

        return 202, self.snapshot()


RUNNER = ImportRunner()


class ImportRequestHandler(BaseHTTPRequestHandler):
    server_version = "OpenBrainImporter/1.0"

    def log_message(self, format: str, *args: Any) -> None:
        return

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return {}

        body = self.rfile.read(length)
        if not body:
            return {}

        try:
            return json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ValueError("Request body must be valid JSON")

    def _send_json(self, status_code: int, payload: dict[str, Any]) -> None:
        response = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            status = RUNNER.snapshot()
            self._send_json(200, {"ok": True, "running": status["running"], "status": status["status"]})
            return
        if parsed.path == "/status":
            self._send_json(200, RUNNER.snapshot())
            return
        self._send_json(404, {"error": "Not found"})

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/start":
            self._send_json(404, {"error": "Not found"})
            return

        try:
            payload = self._read_json()
        except ValueError as error:
            self._send_json(400, {"error": str(error)})
            return

        status_code, response = RUNNER.start(payload)
        self._send_json(status_code, response)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), ImportRequestHandler)
    print(f"Open Brain importer service listening on http://{HOST}:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
