import unittest
from types import SimpleNamespace

from config import settings
from services.analysis_engine import (
    _brief_payload,
    _search_safe_query,
    _theme_query_from_directives,
    _trim_brief_for_dashboard,
    format_analysis_brief,
)


class AnalysisEngineTests(unittest.TestCase):
    def test_brief_payload_builds_tone_roles_and_targets(self) -> None:
        payload = _brief_payload(
            {
                "query_text": "Trump legal collision latest 2026",
                "query_variants": [
                    "Trump legal collision latest 2026",
                    "Trump legal collision latest 2026 court filing injunction appellate friction",
                ],
                "focus_theme": {"slug": "legal-collision", "name": "Legal Collision"},
                "raw_sources": [
                    {
                        "title": "White House says order will stand after court challenge",
                        "source_label": "White House",
                        "source_name": "White House",
                        "source_kind": "institutional",
                        "quality_score": 4.8,
                        "editorial_priority_score": 5.2,
                        "retrieval_score": 6.1,
                        "credibility_tier": "high",
                        "age_days": 0,
                    },
                    {
                        "title": "Judge orders Trump administration to defend the filing in court",
                        "source_label": "Reuters",
                        "source_name": "Reuters",
                        "source_kind": "reporting",
                        "quality_score": 4.9,
                        "editorial_priority_score": 5.4,
                        "retrieval_score": 6.4,
                        "credibility_tier": "high",
                        "age_days": 0,
                    },
                    {
                        "title": "Congressional Republicans show backlash to the White House legal strategy",
                        "source_label": "AP News",
                        "source_name": "AP News",
                        "source_kind": "reporting",
                        "quality_score": 4.6,
                        "editorial_priority_score": 4.9,
                        "retrieval_score": 5.9,
                        "credibility_tier": "high",
                        "age_days": 1,
                    },
                ],
                "trend_ledger": [{"title": "Courts keep forcing a clearer answer"}],
            },
            scope_type="theme",
            scope_key="legal-collision",
            focus_label="Legal Collision",
            theme_slug="legal-collision",
            recent_entries=[
                {
                    "title": "Earlier legal collision note",
                    "time_label": "earlier today",
                }
            ],
        )

        meta = payload["meta"]
        roles = {item["role"] for item in meta["source_roles"]}

        self.assertEqual(payload["label"], "Legal Collision")
        self.assertEqual(meta["tone"]["primary"], "silk-scalpel")
        self.assertEqual(meta["story_targets"]["long_form"], "theme_column")
        self.assertIn("official_line", roles)
        self.assertIn("legal_receipt", roles)
        self.assertTrue(meta["open_loops"])
        self.assertEqual(meta["source_roles"][0]["credibility_tier"], "high")
        self.assertEqual(meta["dialectic"]["thread_kind_label"], "legal tell")
        self.assertIn("Follow the legal tell", meta["dialectic"]["gold_thread"])
        self.assertEqual(len(meta["query_variants"]), 2)

    def test_brief_payload_uses_update_form_only_for_hot_lane(self) -> None:
        payload = _brief_payload(
            {
                "query_text": "Trump legal collision latest 2026",
                "focus_theme": {"slug": "legal-collision", "name": "Legal Collision"},
                "raw_sources": [
                    {
                        "title": "Judge orders Trump administration to defend the filing in court",
                        "source_label": "Reuters",
                        "source_name": "Reuters",
                        "source_kind": "reporting",
                        "quality_score": 4.9,
                        "editorial_priority_score": 5.4,
                        "retrieval_score": 6.4,
                        "credibility_tier": "high",
                        "age_days": 0,
                    },
                    {
                        "title": "Congressional Republicans show backlash to the White House legal strategy",
                        "source_label": "AP News",
                        "source_name": "AP News",
                        "source_kind": "reporting",
                        "quality_score": 4.6,
                        "editorial_priority_score": 4.9,
                        "retrieval_score": 5.9,
                        "credibility_tier": "high",
                        "age_days": 0,
                    },
                ],
                "trend_ledger": [{"title": "Courts keep forcing a clearer answer"}],
            },
            scope_type="theme",
            scope_key="legal-collision",
            focus_label="Legal Collision",
            theme_slug="legal-collision",
            recent_entries=[
                {"title": "Earlier note one", "time_label": "earlier today", "age_hours": 2},
                {"title": "Earlier note two", "time_label": "earlier today", "age_hours": 3},
            ],
        )

        self.assertEqual(payload["meta"]["story_targets"]["long_form"], "theme_update")

    def test_format_analysis_brief_renders_roles_and_tone(self) -> None:
        rendered = format_analysis_brief(
            {
                "label": "Legal Collision",
                "title": "Judge forces a cleaner answer",
                "summary": "Legal Collision is still live.",
                "meta": {
                    "pattern": "The official line keeps bending around the receipt.",
                    "why_now": "Fresh reporting is still warm enough to move the lane.",
                    "tone": {
                        "primary": "silk-scalpel",
                        "long_form": "precise and cool",
                        "short_form": "icy and clipped",
                    },
                    "story_targets": {
                        "long_form_label": "Signal Update",
                        "short_form": "dispatch",
                    },
                    "dialectic": {
                        "thesis": "Judge forces a cleaner answer",
                        "counterforce": "The official line is still trying to outrun the filing.",
                        "synthesis": "The legal tell is now the real story.",
                        "gold_thread": "Follow the legal tell in 'Judge forces a cleaner answer'.",
                    },
                    "analysis_flags": {
                        "tell_kind": "legal tell",
                        "claim_vs_receipt": "White House is still selling one line while Reuters carries the cleaner record.",
                        "institutional_stress": "court and filing pressure forcing cleaner language",
                        "beneficiary": "the executive line if delay keeps buying time",
                        "cost_bearer": "courts and public trust",
                        "evidence_strength": "strong live packet with a visible claim-versus-receipt split.",
                    },
                    "source_roles": [
                        {
                            "role": "legal_receipt",
                            "role_label": "Legal receipt",
                            "outlet": "Reuters",
                            "title": "Judge forces a cleaner answer",
                        }
                    ],
                    "open_loops": ["Name what changed since the last pass."],
                    "argument_spine": ["Spell out the power trade before the close."],
                },
            }
        )

        self.assertIn("Tone primary: silk-scalpel", rendered)
        self.assertIn("Link role: Legal receipt via Reuters", rendered)
        self.assertIn("Open loop: Name what changed since the last pass.", rendered)
        self.assertIn("Gold thread: Follow the legal tell", rendered)
        self.assertIn("Tell kind: legal tell", rendered)
        self.assertIn("Cost bearer: courts and public trust", rendered)
        self.assertIn("Paragraph job: Spell out the power trade before the close.", rendered)

    def test_theme_query_uses_directive_seed_when_theme_is_not_named(self) -> None:
        theme = SimpleNamespace(name="Executive Overreach", slug="executive-overreach")

        query = _theme_query_from_directives(
            theme,
            directive_queries=["what changed, what the official line is hiding"],
            query_plan=["Trump contradiction latest 2026"],
            index=0,
        )

        self.assertIn("Executive Overreach", query)
        self.assertIn(str(settings.current_news_min_year), query)
        self.assertIn("executive order", query.lower())

    def test_theme_query_ignores_instructional_directive_seed(self) -> None:
        theme = SimpleNamespace(name="Military Brinkmanship", slug="military-brinkmanship")

        query = _theme_query_from_directives(
            theme,
            directive_queries=["Name the institutional stress point: court, agency, donor, military, Congress, or market."],
            query_plan=["Trump contradiction latest 2026"],
            index=0,
        )

        self.assertIn("Military Brinkmanship", query)
        self.assertIn("troops", query.lower())
        self.assertNotIn("name the institutional stress point", query.lower())

    def test_search_safe_query_filters_generic_instructional_directives(self) -> None:
        self.assertEqual(
            _search_safe_query("Prefer sources with documents, filings, transcripts, sanctions, orders, votes, or direct quotes."),
            "",
        )
        self.assertEqual(
            _search_safe_query("Surface who benefits, who absorbs the risk, and what makes this story distinct from yesterday's outrage cycle."),
            "",
        )

    def test_brief_payload_aligns_trend_and_angle_to_theme_query(self) -> None:
        payload = _brief_payload(
            {
                "query_text": "Trump Energy Shock Politics latest 2026",
                "focus_theme": {"slug": "energy-shock-politics", "name": "Energy Shock Politics"},
                "raw_sources": [
                    {
                        "title": "Vance says talks with Iran have ended without an agreement",
                        "source_label": "AP News",
                        "source_name": "AP News",
                        "source_kind": "reporting",
                        "quality_score": 9.6,
                        "editorial_priority_score": 9.0,
                        "retrieval_score": 9.2,
                        "credibility_tier": "high",
                        "age_days": 0,
                    },
                    {
                        "title": "Oil traders brace for Hormuz insurance shock after Trump threat",
                        "source_label": "Financial Times",
                        "source_name": "Financial Times",
                        "source_kind": "reporting",
                        "quality_score": 8.3,
                        "editorial_priority_score": 8.0,
                        "retrieval_score": 8.4,
                        "credibility_tier": "high",
                        "age_days": 0,
                    },
                ],
                "trend_ledger": [
                    {"title": "Culture War Cosmetics remains active", "theme_name": "Culture War Cosmetics"},
                    {"title": "Energy Shock Politics remains active", "theme_name": "Energy Shock Politics"},
                ],
            },
            scope_type="theme",
            scope_key="energy-shock-politics",
            focus_label="Energy Shock Politics",
            theme_slug="energy-shock-politics",
            recent_entries=[],
        )

        self.assertEqual(payload["title"], "Oil traders brace for Hormuz insurance shock after Trump threat")

    def test_brief_payload_reanchors_dialectic_to_selected_angle(self) -> None:
        payload = _brief_payload(
            {
                "query_text": "Trump executive overreach latest 2026",
                "focus_theme": {"name": "Sitewide"},
                "raw_sources": [
                    {
                        "title": "Trump administration deepens quest to stamp out the events of Jan. 6",
                        "source_label": "Detroit News",
                        "source_name": "Detroit News",
                        "source_kind": "reporting",
                        "quality_score": 7.1,
                        "editorial_priority_score": 7.0,
                        "retrieval_score": 7.2,
                        "credibility_tier": "medium",
                        "age_days": 1,
                    },
                    {
                        "title": "Trump’s budget director defends White House plan for massive boost in military spending",
                        "source_label": "AP News",
                        "source_name": "AP News",
                        "source_kind": "reporting",
                        "quality_score": 9.9,
                        "editorial_priority_score": 9.3,
                        "retrieval_score": 9.5,
                        "credibility_tier": "high",
                        "age_days": 0,
                    },
                ],
                "trend_ledger": [],
            },
            scope_type="site",
            scope_key="sitewide",
            focus_label="Sitewide",
            theme_slug="",
            recent_entries=[],
        )

        role_titles = [item["title"] for item in payload["meta"]["source_roles"]]

        self.assertEqual(
            payload["title"],
            "Trump’s budget director defends White House plan for massive boost in military spending",
        )
        self.assertIn(
            "Trump’s budget director defends White House plan for massive boost in military spending",
            role_titles,
        )
        self.assertNotIn("Trump administration deepens quest to stamp out the events of Jan. 6", role_titles)
        self.assertIn("budget director", payload["meta"]["dialectic"]["gold_thread"].lower())

    def test_brief_payload_prefers_concrete_receipt_for_why_now_and_angle(self) -> None:
        payload = _brief_payload(
            {
                "query_text": "Trump Energy Shock Politics latest 2026 oil prices hormuz shipping inflation",
                "focus_theme": {"slug": "energy-shock-politics", "name": "Energy Shock Politics"},
                "raw_sources": [
                    {
                        "title": "Senate Republicans reject effort to halt Iran war, but some eye future war powers votes",
                        "source_label": "AP News",
                        "source_name": "AP News",
                        "source_kind": "reporting",
                        "quality_score": 9.8,
                        "editorial_priority_score": 9.4,
                        "retrieval_score": 9.6,
                        "credibility_tier": "high",
                        "age_days": 0,
                    },
                    {
                        "title": "Oil traders brace for Hormuz insurance shock after Trump threat",
                        "source_label": "Financial Times",
                        "source_name": "Financial Times",
                        "source_kind": "reporting",
                        "quality_score": 8.9,
                        "editorial_priority_score": 8.6,
                        "retrieval_score": 8.7,
                        "credibility_tier": "high",
                        "age_days": 0,
                    },
                ],
                "trend_ledger": [{"title": "Energy Shock Politics remains active"}],
            },
            scope_type="theme",
            scope_key="energy-shock-politics",
            focus_label="Energy Shock Politics",
            theme_slug="energy-shock-politics",
            recent_entries=[{"title": "Earlier BAT angle", "time_label": "earlier today"}],
        )

        self.assertNotIn("remains active", payload["title"].lower())
        self.assertIn("just", payload["meta"]["why_now"].lower())
        self.assertNotIn("sharper turn than the last headline cycle", payload["meta"]["why_now"].lower())

    def test_brief_payload_prefers_high_credibility_receipt_over_clicky_live_blog(self) -> None:
        payload = _brief_payload(
            {
                "query_text": "Trump Foreign Policy Escalation latest 2026",
                "focus_theme": {"slug": "foreign-policy-escalation", "name": "Foreign Policy Escalation"},
                "raw_sources": [
                    {
                        "title": "US-Iran War LIVE: White House says forces are 'locked and loaded' before new deadline",
                        "source_label": "RepublicWorld",
                        "source_name": "RepublicWorld",
                        "source_kind": "reporting",
                        "quality_score": 7.1,
                        "editorial_priority_score": 7.0,
                        "retrieval_score": 8.2,
                        "credibility_tier": "medium",
                        "age_days": 0,
                        "query_alignment_score": 3.0,
                    },
                    {
                        "title": "Senate Republicans reject effort to halt Iran war, but some eye future war powers votes",
                        "source_label": "AP News",
                        "source_name": "AP News",
                        "source_kind": "reporting",
                        "quality_score": 9.9,
                        "editorial_priority_score": 9.4,
                        "retrieval_score": 9.3,
                        "credibility_tier": "high",
                        "age_days": 0,
                        "query_alignment_score": 3.0,
                    },
                ],
                "trend_ledger": [{"title": "Foreign Policy Escalation remains active"}],
            },
            scope_type="site",
            scope_key="sitewide",
            focus_label="Sitewide",
            theme_slug="",
            recent_entries=[],
        )

        self.assertEqual(
            payload["title"],
            "Senate Republicans reject effort to halt Iran war, but some eye future war powers votes",
        )

    def test_brief_payload_filters_misaligned_theme_sources_when_lane_receipt_exists(self) -> None:
        payload = _brief_payload(
            {
                "query_text": "Trump Family Dynastic Branding latest family brand business deal licensing 2026",
                "focus_theme": {"slug": "family-dynastic-branding", "name": "Family Dynastic Branding"},
                "raw_sources": [
                    {
                        "title": "Trump family licensing deal opens a new ethics fight over the family business",
                        "source_label": "AP News",
                        "source_name": "AP News",
                        "source_kind": "reporting",
                        "quality_score": 9.2,
                        "editorial_priority_score": 8.9,
                        "retrieval_score": 9.0,
                        "credibility_tier": "high",
                        "age_days": 0,
                        "query_alignment_score": 4.0,
                    },
                    {
                        "title": "Unsettled and uncertain: What the Iran war means around the world as US and Iran enter talks",
                        "source_label": "AP News",
                        "source_name": "AP News",
                        "source_kind": "reporting",
                        "quality_score": 9.8,
                        "editorial_priority_score": 9.4,
                        "retrieval_score": 9.5,
                        "credibility_tier": "high",
                        "age_days": 0,
                        "query_alignment_score": 0.0,
                    },
                    {
                        "title": "Pakistani delegation meets in Tehran hoping for more US-Iran talks before ceasefire ends",
                        "source_label": "AP News",
                        "source_name": "AP News",
                        "source_kind": "reporting",
                        "quality_score": 9.7,
                        "editorial_priority_score": 9.3,
                        "retrieval_score": 9.4,
                        "credibility_tier": "high",
                        "age_days": 0,
                        "query_alignment_score": 0.0,
                    },
                ],
                "trend_ledger": [{"title": "Family Dynastic Branding remains active"}],
            },
            scope_type="theme",
            scope_key="family-dynastic-branding",
            focus_label="Family Dynastic Branding",
            theme_slug="family-dynastic-branding",
            recent_entries=[],
        )

        self.assertIn("licensing deal", payload["title"].lower())
        self.assertLess(payload["confidence"], 0.9)
        self.assertEqual(payload["meta"]["topic_stats"]["aligned_source_count"], 1)
        self.assertEqual(payload["meta"]["topic_stats"]["lane_alignment_ratio"], 0.33)

    def test_brief_payload_does_not_treat_reported_admin_error_as_official_line(self) -> None:
        payload = _brief_payload(
            {
                "query_text": "Trump latest 2026",
                "raw_sources": [
                    {
                        "title": "AP Exclusive: Trump administration admits a glaring error in its New York health fraud accusations",
                        "source_label": "AP News",
                        "source_name": "AP News",
                        "source_kind": "reporting",
                        "quality_score": 8.9,
                        "editorial_priority_score": 8.7,
                        "retrieval_score": 8.8,
                        "credibility_tier": "high",
                        "age_days": 0,
                    },
                    {
                        "title": "Many US Catholics are dismayed by Trump’s unprecedented broadside at the first American pope",
                        "source_label": "AP News",
                        "source_name": "AP News",
                        "source_kind": "reporting",
                        "quality_score": 8.7,
                        "editorial_priority_score": 8.6,
                        "retrieval_score": 8.5,
                        "credibility_tier": "high",
                        "age_days": 0,
                    },
                ],
                "trend_ledger": [{"title": "Sitewide keeps moving fast enough to deserve a sharper read"}],
            },
            scope_type="site",
            scope_key="sitewide",
            focus_label="Sitewide",
            theme_slug="",
            recent_entries=[],
        )

        roles = {item["role"] for item in payload["meta"]["source_roles"]}
        self.assertNotIn("official_line", roles)
        self.assertNotIn("AP News is carrying the line while AP News", payload["meta"]["pattern"])

    def test_brief_payload_emits_analysis_flags_and_argument_spine(self) -> None:
        payload = _brief_payload(
            {
                "query_text": "Trump legal collision latest 2026",
                "focus_theme": {"slug": "legal-collision", "name": "Legal Collision"},
                "raw_sources": [
                    {
                        "title": "White House says order will stand after court challenge",
                        "source_label": "White House",
                        "source_name": "White House",
                        "source_kind": "institutional",
                        "quality_score": 5.1,
                        "editorial_priority_score": 5.2,
                        "retrieval_score": 5.8,
                        "credibility_tier": "high",
                        "age_days": 0,
                    },
                    {
                        "title": "Judge orders Trump administration to defend the filing in court",
                        "source_label": "Reuters",
                        "source_name": "Reuters",
                        "source_kind": "reporting",
                        "quality_score": 8.8,
                        "editorial_priority_score": 8.7,
                        "retrieval_score": 8.9,
                        "credibility_tier": "high",
                        "age_days": 0,
                    },
                ],
                "trend_ledger": [],
            },
            scope_type="theme",
            scope_key="legal-collision",
            focus_label="Legal Collision",
            theme_slug="legal-collision",
            recent_entries=[],
        )

        flags = payload["meta"]["analysis_flags"]
        self.assertEqual(flags["tell_kind"], "legal tell")
        self.assertIn("White House", flags["claim_vs_receipt"])
        self.assertIn("beneficiary", "beneficiary is " + flags["beneficiary"])
        self.assertTrue(payload["meta"]["argument_spine"])
        self.assertTrue(any("cost lands on" in beat.lower() for beat in payload["meta"]["argument_spine"]))

    def test_brief_payload_filters_generic_legal_noise_without_trump_signal(self) -> None:
        payload = _brief_payload(
            {
                "query_text": "Trump legal collision latest 2026",
                "focus_theme": {"slug": "legal-collision", "name": "Legal Collision"},
                "raw_sources": [
                    {
                        "title": "Federal judge extends restraining order on $6.2B merger of local TV giants...",
                        "source_label": "Wsbradio",
                        "source_name": "Wsbradio",
                        "source_kind": "reporting",
                        "quality_score": 9.2,
                        "editorial_priority_score": 9.0,
                        "retrieval_score": 9.1,
                        "credibility_tier": "medium",
                        "age_days": 0,
                    },
                    {
                        "title": "Judge orders Trump administration to defend the filing in court",
                        "source_label": "Reuters",
                        "source_name": "Reuters",
                        "source_kind": "reporting",
                        "quality_score": 8.8,
                        "editorial_priority_score": 8.7,
                        "retrieval_score": 8.9,
                        "credibility_tier": "high",
                        "age_days": 0,
                    },
                    {
                        "title": "White House says the order will stand for now",
                        "source_label": "White House",
                        "source_name": "White House",
                        "source_kind": "institutional",
                        "quality_score": 7.5,
                        "editorial_priority_score": 7.4,
                        "retrieval_score": 7.6,
                        "credibility_tier": "high",
                        "age_days": 0,
                    },
                ],
                "trend_ledger": [{"title": "Courts keep forcing a clearer answer"}],
            },
            scope_type="theme",
            scope_key="legal-collision",
            focus_label="Legal Collision",
            theme_slug="legal-collision",
            recent_entries=[],
        )

        self.assertEqual(payload["title"], "Judge orders Trump administration to defend the filing in court")
        self.assertNotIn("merger", payload["title"].lower())
        self.assertLess(payload["meta"]["topic_stats"]["lane_alignment_ratio"], 1.0)

    def test_brief_payload_blocks_foreign_pressure_bleed_for_domestic_legal_lane(self) -> None:
        payload = _brief_payload(
            {
                "query_text": "Trump executive overreach latest 2026",
                "focus_theme": {"slug": "executive-overreach", "name": "Executive Overreach"},
                "raw_sources": [
                    {
                        "title": "Justice Jackson chides Supreme Court conservatives over ‘oblivious’ pro-Trump emergency orders",
                        "source_label": "AP News",
                        "source_name": "AP News",
                        "source_kind": "reporting",
                        "quality_score": 8.8,
                        "editorial_priority_score": 8.7,
                        "retrieval_score": 8.9,
                        "credibility_tier": "high",
                        "age_days": 0,
                    },
                    {
                        "title": "AG Brown releases statement on First Circuit decision upholding block on Trump administration funding freeze",
                        "source_label": "Washington AG",
                        "source_name": "Washington AG",
                        "source_kind": "institutional",
                        "quality_score": 7.5,
                        "editorial_priority_score": 7.4,
                        "retrieval_score": 7.7,
                        "credibility_tier": "high",
                        "age_days": 0,
                    },
                    {
                        "title": "Ceasefire between Israel and Lebanon comes into effect",
                        "source_label": "Irish Times",
                        "source_name": "Irish Times",
                        "source_kind": "reporting",
                        "quality_score": 9.0,
                        "editorial_priority_score": 8.9,
                        "retrieval_score": 8.8,
                        "credibility_tier": "medium",
                        "age_days": 0,
                    },
                ],
                "trend_ledger": [{"title": "Executive orders keep forcing a cleaner answer"}],
            },
            scope_type="theme",
            scope_key="executive-overreach",
            focus_label="Executive Overreach",
            theme_slug="executive-overreach",
            recent_entries=[],
        )

        roles = {item["role"] for item in payload["meta"]["source_roles"]}
        self.assertIn("legal_receipt", roles)
        self.assertIn("official_line", roles)
        self.assertNotIn("foreign_pressure", roles)

    def test_brief_payload_does_not_reuse_unrelated_trend_title_for_military_lane(self) -> None:
        payload = _brief_payload(
            {
                "query_text": "Trump Military Brinkmanship latest troops missile strike blockade 2026",
                "focus_theme": {"slug": "military-brinkmanship", "name": "Military Brinkmanship"},
                "raw_sources": [
                    {
                        "title": "US Senate rejects war powers bill that would halt attacks against Iran",
                        "source_label": "AP News",
                        "source_name": "AP News",
                        "source_kind": "reporting",
                        "quality_score": 9.8,
                        "editorial_priority_score": 9.4,
                        "retrieval_score": 9.6,
                        "credibility_tier": "high",
                        "age_days": 0,
                    }
                ],
                "trend_ledger": [
                    {
                        "title": "Appeals court rebuffs Anthropic in latest round of its AI battle with the Trump administration",
                        "theme_name": "Institutional Humiliation",
                    }
                ],
            },
            scope_type="theme",
            scope_key="military-brinkmanship",
            focus_label="Military Brinkmanship",
            theme_slug="military-brinkmanship",
            recent_entries=[],
        )

        self.assertNotIn("Anthropic", payload["meta"]["pattern"])

    def test_trim_brief_for_dashboard_honors_memory_limit(self) -> None:
        brief = _trim_brief_for_dashboard(
            {
                "label": "Legal Collision",
                "meta": {
                    "source_roles": [{"role": "official_line"}, {"role": "legal_receipt"}],
                    "open_loops": ["loop one", "loop two", "loop three"],
                },
            },
            memory_limit=1,
        )

        self.assertEqual(len((brief or {}).get("meta", {}).get("source_roles", [])), 1)
        self.assertEqual(len((brief or {}).get("meta", {}).get("open_loops", [])), 1)


if __name__ == "__main__":
    unittest.main()
