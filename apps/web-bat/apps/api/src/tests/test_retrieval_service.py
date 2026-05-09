from types import SimpleNamespace
import unittest

from datetime import datetime, timezone
import uuid

from services.retrieval_service import _extract_evidence_excerpts, _select_diverse_sources, format_retrieval_bundle


class RetrievalServiceTests(unittest.TestCase):
    def test_extract_evidence_excerpts_prefers_receipt_sentences(self) -> None:
        source = SimpleNamespace(
            title="Judge orders Trump administration to defend the filing in court",
            raw_text=(
                "The White House spent the morning insisting the order was airtight. "
                "A federal judge ordered the Trump administration to explain why its courtroom filing narrowed the claim. "
                "The ruling gave the administration until Friday to answer and warned that the public spin was not the legal standard."
            ),
            meta={"search_snippet": "Court filing and public line are splitting apart."},
        )

        excerpts = _extract_evidence_excerpts(source, query_text="Trump court filing latest 2026")

        self.assertTrue(excerpts)
        self.assertTrue(any("judge ordered" in excerpt.lower() for excerpt in excerpts))

    def test_extract_evidence_excerpts_skips_sidebar_noise_when_query_is_specific(self) -> None:
        source = SimpleNamespace(
            title="Trump budget director defends White House plan for massive boost in military spending",
            raw_text=(
                "Then Trump changed the rules A lost icon: The American chestnut and its central place in the eastern forest. "
                "The budget director defended the White House plan for a massive boost in military spending. "
                "Weekend travel tips and photo galleries followed in the same page chrome."
            ),
            meta={"search_snippet": "Budget director defended the White House military spending plan."},
        )

        excerpts = _extract_evidence_excerpts(source, query_text="Trump budget director military spending latest 2026")

        self.assertTrue(excerpts)
        self.assertFalse(any("american chestnut" in excerpt.lower() for excerpt in excerpts))
        self.assertTrue(any("budget director defended" in excerpt.lower() for excerpt in excerpts))

    def test_format_retrieval_bundle_surfaces_evidence_deck(self) -> None:
        rendered = format_retrieval_bundle(
            {
                "query_text": "Trump legal contradiction latest 2026",
                "raw_sources": [
                    {
                        "source_type": "search",
                        "source_kind": "reporting",
                        "title": "Judge orders Trump administration to defend the filing in court",
                        "source_label": "Reuters",
                        "quality_score": 4.8,
                        "editorial_priority_score": 5.2,
                        "age_days": 0,
                        "credibility_tier": "high",
                        "evidence_excerpts": [
                            "The judge ordered the administration to explain the gap between the filing and the public line."
                        ],
                    }
                ],
                "theme_memory": [],
                "trend_ledger": [],
            }
        )

        self.assertIn("Priority Evidence Deck", rendered)
        self.assertIn("evidence:", rendered)
        self.assertIn("gap between the filing and the public line", rendered)

    def test_select_diverse_sources_anchors_high_credibility_first(self) -> None:
        now = datetime.now(timezone.utc)
        medium = SimpleNamespace(
            id=uuid.uuid4(),
            title="Outlet with a very aligned but shakier write-up",
            source_url="https://newsweek.com/aligned-story",
            canonical_url="https://newsweek.com/aligned-story",
            source_name="Newsweek",
            published_at=now,
            fetched_at=now,
            raw_text="Trump court filing latest 2026 with plenty of overlap and current detail.",
            meta={
                "quality_score": 7.6,
                "editorial_priority_score": 8.4,
                "credibility_tier": "medium",
                "query": "Trump court filing latest 2026",
            },
        )
        high = SimpleNamespace(
            id=uuid.uuid4(),
            title="Judge orders Trump administration to defend the filing in court",
            source_url="https://reuters.com/legal-story",
            canonical_url="https://reuters.com/legal-story",
            source_name="Reuters",
            published_at=now,
            fetched_at=now,
            raw_text="A federal judge ordered the Trump administration to explain why its court filing narrowed the claim.",
            meta={
                "quality_score": 7.9,
                "editorial_priority_score": 8.1,
                "credibility_tier": "high",
                "query": "Trump court filing latest 2026",
            },
        )

        selected = _select_diverse_sources([medium, high], limit=2)

        self.assertEqual(selected[0].source_name, "Reuters")

    def test_select_diverse_sources_penalizes_off_lane_high_quality_noise(self) -> None:
        now = datetime.now(timezone.utc)
        off_lane = SimpleNamespace(
            id=uuid.uuid4(),
            title="Gov. Moore holds bill signing after chaotic end to legislative session",
            source_url="https://wbaltv.com/story",
            canonical_url="https://wbaltv.com/story",
            source_name="Wbaltv",
            published_at=now,
            fetched_at=now,
            raw_text="Statehouse chaos and local budget fights dominate the day.",
            meta={
                "quality_score": 8.9,
                "editorial_priority_score": 8.8,
                "credibility_tier": "medium",
                "search_snippet": "A statehouse recap with no oil or Hormuz angle at all.",
            },
        )
        aligned = SimpleNamespace(
            id=uuid.uuid4(),
            title="Oil traders brace for Hormuz insurance shock after Trump threat",
            source_url="https://ft.com/energy-story",
            canonical_url="https://ft.com/energy-story",
            source_name="Financial Times",
            published_at=now,
            fetched_at=now,
            raw_text="Shipping insurers and oil traders are repricing Gulf risk as Hormuz disruption looks possible.",
            meta={
                "quality_score": 7.8,
                "editorial_priority_score": 7.9,
                "credibility_tier": "high",
                "search_snippet": "Hormuz risk is pushing energy traders back into war-pricing mode.",
            },
        )

        selected = _select_diverse_sources(
            [off_lane, aligned],
            limit=2,
            focus_terms={"energy", "oil", "hormuz", "shipping"},
        )

        self.assertEqual(selected[0].source_name, "Financial Times")

    def test_select_diverse_sources_demotes_clicky_live_updates_when_filed_receipt_exists(self) -> None:
        now = datetime.now(timezone.utc)
        live = SimpleNamespace(
            id=uuid.uuid4(),
            title="Trump says US blockade on Iranian ports has begun. Live updates",
            source_url="https://desmoinesregister.com/live",
            canonical_url="https://desmoinesregister.com/live",
            source_name="Desmoinesregister",
            published_at=now,
            fetched_at=now,
            raw_text="Live updates track Trump's blockade claim and market jitters across the Gulf.",
            meta={
                "quality_score": 8.9,
                "editorial_priority_score": 9.0,
                "credibility_tier": "high",
                "search_snippet": "Live updates follow blockade claims and Gulf market jitters.",
            },
        )
        filed = SimpleNamespace(
            id=uuid.uuid4(),
            title="US Senate rejects war powers bill that would halt attacks against Iran",
            source_url="https://apnews.com/filed-story",
            canonical_url="https://apnews.com/filed-story",
            source_name="AP News",
            published_at=now,
            fetched_at=now,
            raw_text="The Senate rejected a war powers bill after a fresh Trump push, keeping the administration's military line intact.",
            meta={
                "quality_score": 8.6,
                "editorial_priority_score": 8.8,
                "credibility_tier": "high",
                "search_snippet": "The Senate vote keeps Trump's military line in place.",
            },
        )

        selected = _select_diverse_sources(
            [live, filed],
            limit=2,
            focus_terms={"iran", "war", "powers", "blockade"},
        )

        self.assertEqual(selected[0].source_name, "AP News")


if __name__ == "__main__":
    unittest.main()
