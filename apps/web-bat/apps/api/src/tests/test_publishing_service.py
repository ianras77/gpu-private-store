from types import SimpleNamespace
import uuid

from services.publishing_service import _dedupe_editorial_scan_rows


def test_reworked_publish_ready_rows_are_scanned_before_recent_backlog_rows() -> None:
    ready = SimpleNamespace(id=uuid.uuid4(), title="Ready older draft")
    recent = SimpleNamespace(id=uuid.uuid4(), title="Recent draft")

    rows = _dedupe_editorial_scan_rows([ready], [recent, ready])

    assert [row.id for row in rows] == [ready.id, recent.id]
