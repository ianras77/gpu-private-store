import unittest
from types import SimpleNamespace
from uuid import uuid4

from services.trend_engine import _contains_theme_term, _dedupe_matches, _matches_required_groups


class TrendEngineTests(unittest.TestCase):
    def test_dedupe_matches_keeps_highest_score_per_source(self) -> None:
        source_a = SimpleNamespace(id=uuid4())
        source_b = SimpleNamespace(id=uuid4())

        deduped = _dedupe_matches(
            [
                (source_a, 0.8),
                (source_a, 1.4),
                (source_b, 0.5),
                (source_b, 0.4),
            ]
        )

        by_id = {item[0].id: item[1] for item in deduped}
        self.assertEqual(len(by_id), 2)
        self.assertAlmostEqual(by_id[source_a.id], 1.4)
        self.assertAlmostEqual(by_id[source_b.id], 0.5)

    def test_contains_theme_term_uses_word_boundaries(self) -> None:
        self.assertTrue(_contains_theme_term("Trump family business deal under scrutiny", "family"))
        self.assertFalse(_contains_theme_term("The administration defended the nameplate outside the building", "name"))

    def test_family_bucket_requires_family_and_business_signal(self) -> None:
        groups = [
            ["family", "ivanka", "eric", "donald trump jr"],
            ["brand", "licensing", "business", "deal", "ethics"],
        ]
        self.assertTrue(
            _matches_required_groups(
                "Ivanka licensing deal raises fresh ethics questions for the Trump family business",
                groups,
            )
        )
        self.assertFalse(
            _matches_required_groups(
                "Iran war talks resume as diplomats scramble before the ceasefire ends",
                groups,
            )
        )


if __name__ == "__main__":
    unittest.main()
