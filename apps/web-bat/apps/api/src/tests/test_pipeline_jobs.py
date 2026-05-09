import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from workers.jobs import _search_safe_query, _theme_live_query, _writer_should_run, run_pipeline_cycle, run_queen_cycle, run_writer_cycle


class _FakeResult:
    def __init__(self, *, all_values=None, scalar_value=None):
        self._all_values = list(all_values or [])
        self._scalar_value = scalar_value

    def scalars(self):
        return self

    def all(self):
        return list(self._all_values)

    def scalar_one_or_none(self):
        return self._scalar_value


class _FakeDB:
    def __init__(self, results):
        self._results = list(results)

    async def execute(self, _query):
        if not self._results:
            raise AssertionError("No fake DB result configured for execute()")
        return self._results.pop(0)

    async def commit(self):
        return None


class PipelineJobTests(unittest.IsolatedAsyncioTestCase):
    def test_search_safe_query_filters_instructional_research_directive(self) -> None:
        self.assertEqual(
            _search_safe_query("Prefer sources with documents, filings, transcripts, sanctions, orders, votes, or direct quotes."),
            "",
        )

    def test_theme_live_query_uses_theme_hint(self) -> None:
        query = _theme_live_query(SimpleNamespace(name="Energy Shock Politics", slug="energy-shock-politics"))

        self.assertIn("Energy Shock Politics", query)
        self.assertIn("hormuz", query.lower())

    def test_writer_should_run_on_cached_current_sources(self) -> None:
        should_run, reason = _writer_should_run(
            {
                "source_created": 0,
                "source_updated": 0,
                "high_quality_kept": 0,
                "writer_material": {"ready_source_count": 3, "freshest_ready_age_days": 0},
            },
            {"site_brief": {"confidence": 0.81}, "theme_briefs": []},
        )

        self.assertTrue(should_run)
        self.assertEqual(reason, "cached_current_sources")

    async def test_run_writer_cycle_survives_theme_failure(self) -> None:
        lead_id = uuid.uuid4()
        theme_ok_id = uuid.uuid4()
        homepage_id = uuid.uuid4()
        db = _FakeDB(
            [
                _FakeResult(
                    all_values=[
                        SimpleNamespace(slug="lane-a", name="Lane A", active_score=1.0),
                        SimpleNamespace(slug="lane-b", name="Lane B", active_score=0.9),
                    ]
                ),
                _FakeResult(scalar_value=SimpleNamespace(id=theme_ok_id, status="draft")),
            ]
        )

        with (
            patch("workers.jobs.get_runtime_controls", new=AsyncMock(return_value={"direct_publish": False})),
            patch(
                "workers.jobs.generate_editorial_object",
                new=AsyncMock(
                    side_effect=[
                        SimpleNamespace(id=lead_id, status="draft"),
                        RuntimeError("lane-a failed"),
                        SimpleNamespace(id=theme_ok_id, status="draft"),
                    ]
                ),
            ),
            patch(
                "workers.jobs.generate_homepage_snapshot",
                new=AsyncMock(return_value=SimpleNamespace(id=homepage_id, status="draft", layout_json={"lead_angle": "Angle"})),
            ),
            patch("workers.jobs.update_voice_memory", new=AsyncMock()),
            patch("workers.jobs._writer_branch_limit", return_value=(2, 1)),
            patch(
                "workers.jobs._writer_theme_priority_board",
                new=AsyncMock(
                    return_value=[
                        {"slug": "lane-a", "writer_score": 3.2, "gold_ready": False},
                        {"slug": "lane-b", "writer_score": 3.0, "gold_ready": False},
                    ]
                ),
            ),
            patch(
                "workers.jobs._story_card",
                side_effect=lambda obj: {"id": str(obj.id), "title": "Story", "selected_angle": "Angle", "why_now": "Now"} if obj else None,
            ),
        ):
            summary = await run_writer_cycle(db)

        self.assertEqual(summary["lead_story_id"], str(lead_id))
        self.assertEqual(summary["homepage_snapshot_id"], str(homepage_id))
        self.assertEqual(len(summary["theme_take_ids"]), 1)
        self.assertEqual(len(summary["theme_failures"]), 1)
        self.assertEqual(summary["theme_failures"][0]["theme"], "lane-a")

    async def test_run_writer_cycle_prefers_gold_ready_themes(self) -> None:
        lead_id = uuid.uuid4()
        theme_a_id = uuid.uuid4()
        theme_b_id = uuid.uuid4()
        homepage_id = uuid.uuid4()
        call_order: list[str] = []
        db = _FakeDB(
            [
                _FakeResult(
                    all_values=[
                        SimpleNamespace(slug="lane-a", name="Lane A", active_score=1.0),
                        SimpleNamespace(slug="lane-b", name="Lane B", active_score=0.9),
                    ]
                ),
                _FakeResult(scalar_value=SimpleNamespace(id=theme_b_id, status="draft")),
                _FakeResult(scalar_value=SimpleNamespace(id=theme_a_id, status="draft")),
            ]
        )

        async def _fake_generate(*_args, object_type: str, theme_slug=None, publish_now=False, **_kwargs):
            if object_type == "lead_story":
                call_order.append("lead")
                return SimpleNamespace(id=lead_id, status="draft")
            call_order.append(str(theme_slug))
            if theme_slug == "lane-b":
                return SimpleNamespace(id=theme_b_id, status="draft")
            return SimpleNamespace(id=theme_a_id, status="draft")

        with (
            patch("workers.jobs.get_runtime_controls", new=AsyncMock(return_value={"direct_publish": False})),
            patch("workers.jobs.generate_editorial_object", new=_fake_generate),
            patch(
                "workers.jobs.generate_homepage_snapshot",
                new=AsyncMock(return_value=SimpleNamespace(id=homepage_id, status="draft", layout_json={"lead_angle": "Angle"})),
            ),
            patch("workers.jobs.update_voice_memory", new=AsyncMock()),
            patch("workers.jobs._writer_branch_limit", return_value=(1, 1)),
            patch(
                "workers.jobs._writer_theme_priority_board",
                new=AsyncMock(
                    return_value=[
                        {"slug": "lane-b", "writer_score": 4.1, "gold_ready": True},
                        {"slug": "lane-a", "writer_score": 3.5, "gold_ready": False},
                    ]
                ),
            ),
            patch(
                "workers.jobs._story_card",
                side_effect=lambda obj: {"id": str(obj.id), "title": "Story", "selected_angle": "Angle", "why_now": "Now"} if obj else None,
            ),
        ):
            summary = await run_writer_cycle(db)

        self.assertEqual(call_order[1:], ["lane-b", "lane-a"])
        self.assertEqual(summary["gold_theme_count"], 1)
        self.assertEqual(summary["effective_theme_branch_limit"], 2)
        self.assertEqual(summary["theme_priority_board"][0]["slug"], "lane-b")

    async def test_run_queen_cycle_survives_social_failure(self) -> None:
        lead_id = uuid.uuid4()
        homepage_id = uuid.uuid4()
        snapshot = SimpleNamespace(id=homepage_id, status="draft", layout_json={}, published_at=None)
        db = _FakeDB(
            [
                _FakeResult(scalar_value=SimpleNamespace(id=lead_id, status="draft")),
                _FakeResult(all_values=[]),
                _FakeResult(scalar_value=snapshot),
            ]
        )

        with (
            patch("workers.jobs.get_runtime_controls", new=AsyncMock(return_value={"direct_publish": False, "x_live_posting": False})),
            patch(
                "workers.jobs.rework_editorial_backlog",
                new=AsyncMock(
                    return_value={
                        "ok": True,
                        "candidate_count": 0,
                        "reworked_editorial_count": 0,
                        "reworked_editorials": [],
                        "publish_ready_editorial_ids": [],
                        "failure_count": 0,
                        "failures": [],
                        "skipped": [],
                    }
                ),
            ),
            patch("workers.jobs.generate_social_posts", new=AsyncMock(side_effect=RuntimeError("social branch down"))),
            patch("workers.jobs._curate_source_links", return_value=[{"title": "Receipt", "url": "https://example.com"}]),
            patch("workers.jobs.update_voice_memory", new=AsyncMock()),
            patch("workers.jobs._story_card", return_value={"id": str(lead_id), "title": "Lead"}),
        ):
            summary = await run_queen_cycle(
                db,
                writer_summary={"lead_story_id": str(lead_id), "homepage_snapshot_id": str(homepage_id), "homepage_angle": "Angle"},
            )

        self.assertEqual(summary["social_error"], "social branch down")
        self.assertIsNone(summary["homepage_error"])
        self.assertEqual(summary["publish_package"]["lead_story"]["id"], str(lead_id))
        self.assertEqual(summary["backlog"]["rework"]["reworked_editorial_count"], 0)

    async def test_run_queen_cycle_reworks_then_socials_then_publishes(self) -> None:
        lead_id = uuid.uuid4()
        backlog_homepage_id = uuid.uuid4()
        lead_story = SimpleNamespace(id=lead_id, status="published", meta={}, published_at=None, updated_at=None)
        snapshot = SimpleNamespace(id=backlog_homepage_id, status="draft", layout_json={}, published_at=None)
        db = _FakeDB(
            [
                _FakeResult(scalar_value=lead_story),
                _FakeResult(all_values=[]),
                _FakeResult(scalar_value=snapshot),
            ]
        )
        call_order: list[str] = []

        async def _fake_rework(*_args, **_kwargs):
            call_order.append("rework")
            return {
                "ok": True,
                "candidate_count": 1,
                "reworked_editorial_count": 1,
                "reworked_editorials": [{"editorial_id": str(lead_id)}],
                "publish_ready_editorial_ids": [str(lead_id)],
                "failure_count": 0,
                "failures": [],
                "skipped": [],
            }

        async def _fake_publish(*_args, **_kwargs):
            call_order.append("publish")
            return {
                "ok": True,
                "rework": {
                    "ok": True,
                    "candidate_count": 0,
                    "reworked_editorial_count": 0,
                    "reworked_editorials": [],
                    "publish_ready_editorial_ids": [],
                    "failure_count": 0,
                    "failures": [],
                    "skipped": [],
                },
                "reworked_editorial_count": 0,
                "reworked_editorial_ids": [],
                "published_editorial_count": 2,
                "published_editorial_ids": [str(lead_id)],
                "published_social_count": 0,
                "published_social_ids": [],
                "homepage_snapshot_id": str(backlog_homepage_id),
                "homepage_status": "published",
            }

        async def _fake_social(*_args, **_kwargs):
            call_order.append("social")
            return []

        with (
            patch("workers.jobs.get_runtime_controls", new=AsyncMock(return_value={"direct_publish": True, "x_live_posting": False})),
            patch("workers.jobs.rework_editorial_backlog", new=AsyncMock(side_effect=_fake_rework)),
            patch("workers.jobs.publish_ready_backlog", new=AsyncMock(side_effect=_fake_publish)),
            patch("workers.jobs.generate_social_posts", new=AsyncMock(side_effect=_fake_social)),
            patch("workers.jobs._curate_source_links", return_value=[{"title": "Receipt", "url": "https://example.com"}]),
            patch("workers.jobs.update_voice_memory", new=AsyncMock()),
            patch("workers.jobs._story_card", return_value={"id": str(lead_id), "title": "Lead"}),
        ):
            summary = await run_queen_cycle(
                db,
                writer_summary={"lead_story_id": str(lead_id), "homepage_angle": "Angle"},
            )

        self.assertEqual(call_order[:3], ["rework", "social", "publish"])
        self.assertEqual(summary["publish_package"]["homepage_snapshot_id"], str(backlog_homepage_id))
        self.assertEqual(summary["backlog"]["publish"]["published_editorial_count"], 2)
        self.assertEqual(summary["auto_published"]["editorial"], 2)

    async def test_run_queen_cycle_processes_backlog_when_writer_skips(self) -> None:
        db = _FakeDB([_FakeResult(all_values=[])])
        rework_mock = AsyncMock(
            return_value={
                "ok": True,
                "candidate_count": 2,
                "reworked_editorial_count": 2,
                "reworked_editorials": [{"editorial_id": "a"}, {"editorial_id": "b"}],
                "publish_ready_editorial_ids": ["a"],
                "failure_count": 0,
                "failures": [],
                "skipped": [],
            }
        )
        publish_mock = AsyncMock(
            return_value={
                "ok": True,
                "published_editorial_count": 1,
                "published_editorial_ids": ["a"],
                "published_social_count": 0,
                "published_social_ids": [],
                "homepage_snapshot_id": None,
                "homepage_status": None,
            }
        )

        with (
            patch("workers.jobs.get_runtime_controls", new=AsyncMock(return_value={"direct_publish": True, "x_live_posting": False})),
            patch("workers.jobs.rework_editorial_backlog", new=rework_mock),
            patch("workers.jobs.publish_ready_backlog", new=publish_mock),
            patch("workers.jobs._curate_source_links", return_value=[]),
            patch("workers.jobs.update_voice_memory", new=AsyncMock()),
        ):
            summary = await run_queen_cycle(db, writer_summary={"skipped": True, "reason": "cached_current_sources"})

        rework_mock.assert_awaited_once()
        publish_mock.assert_awaited_once()
        self.assertEqual(summary["backlog"]["rework"]["reworked_editorial_count"], 2)
        self.assertEqual(summary["backlog"]["publish"]["published_editorial_count"], 1)
        self.assertFalse(summary["publish_package"]["lead_story"])

    async def test_run_pipeline_cycle_still_runs_queen_when_writer_skips(self) -> None:
        db = _FakeDB([])
        queen_mock = AsyncMock(
            return_value={
                "role": "queen",
                "backlog": {
                    "rework": {"reworked_editorial_count": 1},
                    "publish": {"published_editorial_count": 1},
                },
            }
        )

        with (
            patch("workers.jobs.record_revision", new=AsyncMock()),
            patch("workers.jobs.run_researcher_cycle", new=AsyncMock(return_value={"writer_material": {}})),
            patch("workers.jobs.run_analyst_cycle", new=AsyncMock(return_value={})),
            patch("workers.jobs._writer_should_run", return_value=(False, "cached_current_sources")),
            patch("workers.jobs.run_writer_cycle", new=AsyncMock()),
            patch("workers.jobs.run_queen_cycle", new=queen_mock),
        ):
            summary = await run_pipeline_cycle(db)

        queen_mock.assert_awaited_once()
        self.assertEqual(summary["writer"]["reason"], "cached_current_sources")
        self.assertEqual(summary["queen"]["backlog"]["publish"]["published_editorial_count"], 1)


if __name__ == "__main__":
    unittest.main()
