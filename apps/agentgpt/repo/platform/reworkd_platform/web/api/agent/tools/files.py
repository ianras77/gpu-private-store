import asyncio
import os
import re
from pathlib import Path
from typing import Any, Iterable

from fastapi.responses import StreamingResponse as FastAPIStreamingResponse
from loguru import logger

from reworkd_platform.web.api.agent.stream_mock import stream_string
from reworkd_platform.web.api.agent.tools.tool import Tool

_ALLOWED_ROOTS = (Path("/runtipi"), Path("/workspace"))
_SKIP_DIRS = {".git", ".next", "node_modules", "__pycache__", ".venv", "venv"}
_LIST_ENTRY_LIMIT = 80
_FIND_RESULT_LIMIT = 80
_SEARCH_RESULT_LIMIT = 40
_SEARCH_FILE_LIMIT = 2000
_TEXT_FILE_SIZE_LIMIT = 512_000
_READ_CHAR_LIMIT = 20_000


class Files(Tool):
    description = (
        "Use this tool to inspect local files and directories from the mounted RunTipi environment. "
        "It can list directories, read text files, find files by glob pattern, and search text inside files "
        "under /runtipi or /workspace. Always include an absolute path under /runtipi or /workspace."
    )
    public_description = (
        "Read and search the mounted RunTipi filesystem and app workspace."
    )
    arg_description = (
        "A filesystem instruction. Examples: `list /runtipi/media/data`, "
        "`read /runtipi/media/data/obsidian/note.md`, "
        "`find *.md in /runtipi/media/data/obsidian`, "
        "`search postgres in /runtipi/apps`."
    )
    image_url = "/icons/icon-docs.svg"

    @staticmethod
    def available() -> bool:
        return any(root.exists() for root in _ALLOWED_ROOTS)

    async def call(
        self, goal: str, task: str, input_str: str, *args: Any, **kwargs: Any
    ) -> FastAPIStreamingResponse:
        try:
            output = await asyncio.to_thread(_handle_instruction, input_str)
            return stream_string(output)
        except ValueError as exc:
            return stream_string(str(exc))
        except Exception:
            logger.exception("Files tool failed")
            return stream_string(
                "Files tool failed while reading the mounted filesystem."
            )


def _handle_instruction(instruction: str) -> str:
    text = instruction.strip()
    if not text:
        raise ValueError(
            "Files tool needs a filesystem instruction like `list /runtipi/media/data`."
        )

    find_match = re.match(
        r"^(?:find|glob)\s+(.+?)\s+(?:in|under)\s+(.+)$",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if find_match:
        pattern, path = find_match.groups()
        return _find_files(pattern.strip(), _normalize_path(path))

    search_match = re.match(
        r"^(?:search|grep)\s+(.+?)\s+(?:in|under)\s+(.+)$",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if search_match:
        query, path = search_match.groups()
        return _search_text(query.strip(), _normalize_path(path))

    lowered = text.lower()
    if lowered.startswith("list "):
        return _list_directory(_normalize_path(text[5:]))

    if lowered.startswith("read "):
        return _read_file(_normalize_path(text[5:]))

    if lowered.startswith("/runtipi") or lowered.startswith("/workspace"):
        path = _normalize_path(text)
        if path.is_dir():
            return _list_directory(path)
        return _read_file(path)

    if lowered.startswith("write ") or lowered.startswith("append "):
        raise ValueError(
            "Files tool currently supports `list`, `read`, `find`, and `search`."
        )

    raise ValueError(
        "Files tool could not understand that instruction. Use `list PATH`, `read PATH`, "
        "`find PATTERN in PATH`, or `search TEXT in PATH` with a path under /runtipi or /workspace."
    )


def _normalize_path(raw_path: str) -> Path:
    cleaned = raw_path.strip().strip("\"'")
    if not cleaned:
        raise ValueError("Files tool requires a non-empty path.")

    candidate = Path(cleaned).expanduser()
    if not candidate.is_absolute():
        raise ValueError(
            "Files tool paths must be absolute and start with /runtipi or /workspace."
        )

    resolved = candidate.resolve(strict=False)
    if not any(resolved == root or resolved.is_relative_to(root) for root in _ALLOWED_ROOTS):
        raise ValueError("Files tool only allows paths under /runtipi or /workspace.")

    if not resolved.exists():
        raise ValueError(f"Path does not exist: {resolved}")

    return resolved


def _list_directory(path: Path) -> str:
    if not path.is_dir():
        raise ValueError(f"Cannot list a non-directory path: {path}")

    entries = sorted(
        path.iterdir(),
        key=lambda entry: (entry.is_file(), entry.name.lower()),
    )

    lines = [f"Directory listing for {path}:"]
    for entry in entries[:_LIST_ENTRY_LIMIT]:
        suffix = "/" if entry.is_dir() else ""
        try:
            size = entry.stat().st_size if entry.is_file() else 0
        except OSError:
            size = 0
        descriptor = "dir" if entry.is_dir() else f"file {size} bytes"
        lines.append(f"- {entry.name}{suffix} ({descriptor})")

    remaining = len(entries) - _LIST_ENTRY_LIMIT
    if remaining > 0:
        lines.append(f"- ... {remaining} more entries omitted")

    return "\n".join(lines)


def _read_file(path: Path) -> str:
    if not path.is_file():
        raise ValueError(f"Cannot read a non-file path: {path}")

    try:
        with path.open("rb") as handle:
            sample = handle.read(2048)
    except OSError as exc:
        raise ValueError(f"Unable to read file: {exc}") from exc

    if b"\x00" in sample:
        return f"{path} appears to be a binary file and is not shown as text."

    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        raise ValueError(f"Unable to read file: {exc}") from exc

    truncated = len(text) > _READ_CHAR_LIMIT
    if truncated:
        text = text[:_READ_CHAR_LIMIT]

    header = [f"Contents of {path}:"]
    if truncated:
        header.append("")
        header.append(f"[truncated to {_READ_CHAR_LIMIT} characters]")
    header.append("")
    header.append(text)
    return "\n".join(header)


def _find_files(pattern: str, path: Path) -> str:
    cleaned_pattern = pattern.strip().strip("\"'")
    if not cleaned_pattern:
        raise ValueError("Files tool requires a non-empty glob pattern.")

    matches = []
    if path.is_file():
        if path.match(cleaned_pattern):
            matches.append(path)
    else:
        for match in path.rglob(cleaned_pattern):
            matches.append(match)
            if len(matches) >= _FIND_RESULT_LIMIT:
                break

    if not matches:
        return f"No files matching `{cleaned_pattern}` were found under {path}."

    lines = [f"Files matching `{cleaned_pattern}` under {path}:"]
    lines.extend(f"- {match}" for match in matches)
    if len(matches) >= _FIND_RESULT_LIMIT:
        lines.append(f"- ... result list capped at {_FIND_RESULT_LIMIT} matches")
    return "\n".join(lines)


def _search_text(query: str, path: Path) -> str:
    cleaned_query = query.strip().strip("\"'")
    if not cleaned_query:
        raise ValueError("Files tool requires non-empty search text.")

    matches = []
    files_scanned = 0

    for file_path in _iter_text_files(path):
        files_scanned += 1
        if files_scanned > _SEARCH_FILE_LIMIT:
            break

        try:
            content = file_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue

        for line_number, line in enumerate(content.splitlines(), start=1):
            if cleaned_query.lower() not in line.lower():
                continue

            snippet = line.strip()
            if len(snippet) > 220:
                snippet = snippet[:217] + "..."

            matches.append(f"- {file_path}:{line_number}: {snippet}")
            if len(matches) >= _SEARCH_RESULT_LIMIT:
                break

        if len(matches) >= _SEARCH_RESULT_LIMIT:
            break

    if not matches:
        return f"No matches for `{cleaned_query}` were found under {path}."

    lines = [f"Search results for `{cleaned_query}` under {path}:"]
    lines.extend(matches)

    if files_scanned > _SEARCH_FILE_LIMIT:
        lines.append(f"- ... file scan capped at {_SEARCH_FILE_LIMIT} files")
    elif len(matches) >= _SEARCH_RESULT_LIMIT:
        lines.append(f"- ... match list capped at {_SEARCH_RESULT_LIMIT} results")

    return "\n".join(lines)


def _iter_text_files(path: Path) -> Iterable[Path]:
    if path.is_file():
        if _looks_like_text(path):
            yield path
        return

    for root, dirs, files in os.walk(path):
        dirs[:] = [dirname for dirname in dirs if dirname not in _SKIP_DIRS]
        root_path = Path(root)

        for file_name in files:
            file_path = root_path / file_name
            if not _looks_like_text(file_path):
                continue
            yield file_path


def _looks_like_text(path: Path) -> bool:
    try:
        if path.stat().st_size > _TEXT_FILE_SIZE_LIMIT:
            return False
    except OSError:
        return False

    try:
        with path.open("rb") as handle:
            sample = handle.read(2048)
    except OSError:
        return False

    return b"\x00" not in sample
