from datetime import datetime, timedelta, timezone
import unittest

from config import settings
from services.ingestion_service import _is_relevant_result, _normalize_query


class IngestionFilterTests(unittest.TestCase):
    def _recent_iso(self, *, days_ago: int = 1) -> str:
        return (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat().replace("+00:00", "Z")

    def test_normalize_query_adds_political_anchor(self) -> None:
        normalized = _normalize_query("Who gains power this week and why")
        self.assertIn("Trump administration", normalized)

    def test_normalize_query_adds_foreign_policy_anchor(self) -> None:
        normalized = _normalize_query("Iran war latest")
        self.assertIn("Trump", normalized)
        self.assertIn("White House", normalized)
        self.assertIn("administration", normalized)
        self.assertIn("Pentagon", normalized)

    def test_rejects_non_political_content(self) -> None:
        result = {
            "title": "Gains Definition & Meaning",
            "url": "https://www.dictionary.com/browse/gains",
            "snippet": "Definition of gains",
        }
        page = {"title": "Dictionary"}
        raw_text = "gains means improvements in score and muscle size " * 30

        ok, reason, score = _is_relevant_result("Who gains power this week and why", result, page, raw_text)

        self.assertFalse(ok)
        self.assertEqual(reason, "missing_political_signals")
        self.assertEqual(score, 0.0)

    def test_default_search_blocklist_excludes_listing_spam_domains(self) -> None:
        self.assertTrue(
            {"zillow.com", "trulia.com", "homes.com", "redfin.com", "realtor.com", "movoto.com", "wikipedia.org"}.issubset(
                settings.blocked_domains
            )
        )

    def test_default_backlog_publish_window_is_five_days(self) -> None:
        self.assertEqual(settings.backlog_publish_window_hours, 120)

    def test_default_daily_publish_target_is_five_articles(self) -> None:
        self.assertEqual(settings.daily_publish_target, 5)
        self.assertGreaterEqual(settings.writer_theme_take_limit, 12)
        self.assertGreaterEqual(settings.editorial_rework_queue_limit, 6)

    def test_accepts_political_content_with_signals(self) -> None:
        result = {
            "title": "Court blocks Trump administration action",
            "url": "https://apnews.com/article/court-blocks-action",
            "snippet": "A federal judge issued an injunction.",
            "published": self._recent_iso(days_ago=1),
        }
        page = {"title": "Court blocks action"}
        raw_text = (
            "A federal judge issued an injunction against the Trump administration after a legal challenge. "
            "The White House said it would appeal the court ruling while GOP lawmakers debated the response. "
        ) * 10

        ok, reason, score = _is_relevant_result("court blocks Trump administration action", result, page, raw_text)

        self.assertTrue(ok)
        self.assertEqual(reason, "ok")
        self.assertGreater(score, 2.0)

    def test_accepts_foreign_policy_content_with_bat_signals(self) -> None:
        result = {
            "title": "White House weighs next move as Iran conflict drives oil higher",
            "url": "https://apnews.com/article/white-house-iran-conflict-oil",
            "snippet": "Officials said the White House and Pentagon are reviewing options.",
            "published": self._recent_iso(days_ago=1),
        }
        page = {"title": "White House weighs next move as Iran conflict drives oil higher"}
        raw_text = (
            "White House and Pentagon officials said the administration was weighing military and diplomatic options "
            "as the Iran conflict pushed oil prices higher. Congressional Republicans split over war powers while "
            "Trump allies defended the public line. "
        ) * 10

        ok, reason, score = _is_relevant_result("Iran war latest", result, page, raw_text)

        self.assertTrue(ok)
        self.assertEqual(reason, "ok")
        self.assertGreater(score, 2.0)

    def test_rejects_non_iran_story_for_iran_heat_query(self) -> None:
        result = {
            "title": "Republican leaders in Congress announce plan to end DHS shutdown",
            "url": "https://apnews.com/article/dhs-shutdown-congress-trump",
            "snippet": "The deal would avoid a Department of Homeland Security shutdown.",
            "published": self._recent_iso(days_ago=1),
        }
        page = {"title": "Republican leaders in Congress announce plan to end DHS shutdown"}
        raw_text = (
            "Republican leaders in Congress said they had a plan to avoid a Department of Homeland Security shutdown. "
            "Trump allies backed the move as a way to keep the fight contained."
        ) * 8

        ok, reason, score = _is_relevant_result("Trump Iran war latest", result, page, raw_text)

        self.assertFalse(ok)
        self.assertEqual(reason, "missing_foreign_policy_markers")
        self.assertEqual(score, 0.0)


if __name__ == "__main__":
    unittest.main()
