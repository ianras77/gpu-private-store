import unittest
from datetime import datetime, timedelta, timezone

from services.source_policy import current_news_assessment, has_bat_focus


class SourcePolicyTests(unittest.TestCase):
    def test_bat_focus_accepts_white_house_tied_conflict(self) -> None:
        self.assertTrue(has_bat_focus("White House scrambles as Iran conflict widens"))

    def test_current_news_allows_high_quality_undated_bat_story(self) -> None:
        assessment = current_news_assessment(
            title="White House scrambles as Iran conflict widens",
            snippet="Pentagon officials and congressional leaders are reacting to the latest strike.",
            raw_text=(
                "White House aides and Pentagon officials are reacting to the Iran strike while "
                "Congress debates war powers and the oil shock fallout."
            ),
            published_hint=None,
            quality_score=6.8,
            credibility_tier="high",
            fallback_dt=datetime.now(timezone.utc) - timedelta(hours=6),
        )

        self.assertTrue(assessment["bat_focus"])
        self.assertTrue(assessment["current_news_eligible"])
        self.assertEqual(assessment["recency_mode"], "undated_fallback")

    def test_current_news_rejects_medium_cred_explicit_story_below_stronger_floor(self) -> None:
        assessment = current_news_assessment(
            title="White House scrambles as Iran conflict widens",
            snippet="April 17, 2026: congressional leaders react to the latest strike.",
            raw_text=(
                "White House aides and Pentagon officials are reacting to the Iran strike while "
                "Congress debates war powers and the oil shock fallout."
            ),
            published_hint="2026-04-17T12:00:00Z",
            quality_score=5.4,
            credibility_tier="medium",
            fallback_dt=datetime.now(timezone.utc) - timedelta(hours=3),
        )

        self.assertTrue(assessment["bat_focus"])
        self.assertFalse(assessment["current_news_eligible"])


if __name__ == "__main__":
    unittest.main()
