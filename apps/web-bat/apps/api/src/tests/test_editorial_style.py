from datetime import datetime, timedelta, timezone
import asyncio
import uuid
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from config import settings
from models import EditorialObject, Source
from services.editorial_service import (
    _assess_style_candidate,
    _assess_grounded_editorial_candidate,
    _apply_voice_polish,
    _build_editorial_context_packet,
    _build_editorial_task_prompt,
    _build_editorial_expansion_prompt,
    _build_editorial_revision_prompt,
    _catastrophic_editorial_underfill,
    _grounding_report,
    _homepage_candidate_bucket,
    _homepage_story_fingerprint,
    _editorial_query_sets,
    _build_grounded_editorial_fallback,
    _build_launch_packet,
    _preferred_story_sources,
    _publish_recommendation,
    _refined_editorial_query_text,
    _build_live_social_fallback_candidates,
    _build_summary,
    _build_story_brief,
    _curate_source_links,
    _dedupe_social_candidates,
    _needs_editorial_expansion,
    _source_receipt_sentence,
    _should_attempt_editorial_revision,
    _social_package_assessment,
    _run_editorial_generation_pass,
    evaluate_style_gate,
    prune_editorial_backlog,
    rework_editorial_backlog,
    rework_editorial_object,
)
from services.publishing_service import _editorial_publishable_now
from services.trend_engine import _change_type


class EditorialStyleTests(unittest.TestCase):
    def test_editorial_generation_runs_challenger_pass_with_smaller_model(self) -> None:
        calls: list[dict[str, object]] = []

        async def fake_generate(_task_prompt, _context, **kwargs):
            calls.append(kwargs)
            if kwargs.get("model_override") == settings.llm_challenger_model:
                return "Challenger draft names the court filing, tests the official line, and lands the cleaner synthesis."
            return "Champion draft names the court filing and the official line."

        def fake_assess(text, **_kwargs):
            if text.startswith("Challenger"):
                return {"passes": True, "hard_fail": False, "score": 92, "body_word_count": 420}
            if text.startswith("Champion"):
                return {"passes": True, "hard_fail": False, "score": 78, "body_word_count": 360}
            return {"passes": True, "hard_fail": False, "score": 64, "body_word_count": 300}

        with (
            patch("services.editorial_service.generate_with_cat", new=fake_generate),
            patch("services.editorial_service._assess_grounded_editorial_candidate", side_effect=fake_assess),
            patch("services.editorial_service.derive_editorial_title", side_effect=lambda _title, body, _object_type: body.split(".")[0]),
        ):
            result = asyncio.run(
                _run_editorial_generation_pass(
                    object_type="theme_take",
                    story_brief={
                        "story_form": "theme_update",
                        "body_paragraphs": 2,
                        "selected_angle": "Judge orders Trump administration to defend the filing in court",
                        "why_now": "The filing just put the contradiction on paper.",
                        "gold_thread": "Follow the legal tell.",
                    },
                    retrieval_bundle={
                        "query_text": "Trump legal collision latest 2026",
                        "raw_sources": [
                            {"title": "Judge orders Trump administration to defend the filing in court", "quality_score": 8.8},
                            {"title": "White House says the order will stand", "quality_score": 6.4},
                            {"title": "Congress watches the legal fight widen", "quality_score": 6.1},
                        ],
                    },
                    analysis_brief={
                        "meta": {
                            "dialectic": {
                                "thesis": "The filing is narrower than the speech.",
                                "counterforce": "The podium line wants to outrun it.",
                                "synthesis": "The legal tell is the story.",
                            },
                            "content_branches": [
                                {"writer_handoff": "Use the court filing as the next branch."}
                            ],
                        }
                    },
                    recent_coverage=[],
                    repetition_guard=None,
                    editorial_task_prompt="Write the filed piece.",
                    context="Receipts and branch map.",
                    constitution="Stay grounded.",
                    correlation_prefix="test",
                )
            )

        self.assertEqual(calls[1]["model_override"], settings.llm_challenger_model)
        self.assertIn("Challenger draft", result["body"])
        self.assertGreaterEqual(result["reroll_count"], 1)
        self.assertTrue(result["dialectic_review"]["selected"])
        self.assertEqual(result["dialectic_review"]["model"], settings.llm_challenger_model)

    def test_homepage_story_fingerprint_dedupes_timestamped_slugs_by_title(self) -> None:
        first = SimpleNamespace(
            id=uuid.uuid4(),
            slug="trump-war-powers-120000-aaa",
            meta={"launch_packet": {"selected_angle": "Trump war powers fight"}},
        )
        second = SimpleNamespace(
            id=uuid.uuid4(),
            slug="trump-war-powers-121500-bbb",
            meta={"launch_packet": {"selected_angle": "Trump war powers fight"}},
        )

        self.assertEqual(
            _homepage_story_fingerprint(first, "Trump says deadline for Congress does not apply"),
            _homepage_story_fingerprint(second, "Trump says deadline for Congress does not apply"),
        )

    def test_homepage_candidate_bucket_holds_style_gate_failures(self) -> None:
        draft = SimpleNamespace(
            status="draft",
            body_md="The Trump administration filing is thin. The White House spin is louder.",
            meta={
                "style_gate": {"passes": False, "score": 12},
                "publish_recommendation": {"recommended": False},
                "launch_packet": {"selected_angle": "Trump administration filing is thin"},
            },
        )

        self.assertEqual(_homepage_candidate_bucket(draft, "Trump administration filing is thin"), "degraded")

    def test_homepage_candidate_bucket_allows_publish_ready_draft(self) -> None:
        draft = SimpleNamespace(
            status="draft",
            body_md=(
                "The Trump administration tried to sell the order as clean power while the court filing narrowed the claim. "
                "The White House line matters because congressional Republicans now have to defend a record that is smaller than the slogan. "
                "That gap is the story: the paperwork says the move is constrained, and the podium keeps pretending it is not."
            ),
            meta={
                "style_gate": {"passes": True, "score": 84},
                "publish_recommendation": {"recommended": True},
                "launch_packet": {"selected_angle": "Court filing narrows the Trump administration line"},
            },
        )

        self.assertEqual(_homepage_candidate_bucket(draft, "Court filing narrows the Trump administration line"), "recommended")

    def test_social_candidate_dedupes_repetitive_lines(self) -> None:
        deduped = _dedupe_social_candidates(
            [
                "Trump legal filing says one thing and podium says another.",
                "Trump legal filing says one thing and podium says another!",
                "Court record and TV spin are in a long-distance relationship.",
            ]
        )
        self.assertEqual(len(deduped), 2)

    def test_social_gate_rejects_generic_short_line(self) -> None:
        report = evaluate_style_gate("What a week for everyone.", lane="social")
        self.assertFalse(report["passes"])
        self.assertTrue(report["hard_fail"])

    def test_editorial_gate_allows_grounded_long_form(self) -> None:
        text = (
            "The Trump administration asked the court for emergency relief after a federal judge blocked the order. "
            "White House aides called it a temporary setback, but congressional Republicans split on the strategy. "
            "The contradiction is that the legal filing admits limits that the press conference denied."
        )
        report = evaluate_style_gate(text, lane="editorial")
        self.assertTrue(report["passes"])

    def test_editorial_gate_applies_story_form_word_floor(self) -> None:
        text = (
            "The Trump administration sold the move as decisive while the court filing narrowed the claim to something smaller. "
            "Reuters described the judge asking for a cleaner legal answer, and White House aides kept trying to sound taller than the paper trail. "
            "Congressional Republicans sounded more cautious than the podium line suggested, which matters because the spin room kept acting like the contradiction would disappear on command. "
            "The result is a real political story, but this draft is still intentionally shorter than a true lead analysis should be."
        )
        report = _assess_style_candidate(
            text,
            lane="editorial",
            title="Court filing undercuts the White House line",
            story_brief={"story_form": "lead_analysis", "body_paragraphs": 4},
        )
        self.assertFalse(report["passes"])
        self.assertTrue(any("storyformfloor" in reason.replace("_", "") for reason in report["reasons"]))

    def test_catastrophic_editorial_underfill_flags_stubby_column(self) -> None:
        self.assertTrue(
            _catastrophic_editorial_underfill(
                {
                    "body_word_count": 142,
                    "reasons": ["lowlexicaldiversity", "bodyparagraphcount:2/4", "belowstoryformfloor:142/620"],
                },
                {"story_form": "theme_column", "body_paragraphs": 4},
            )
        )
        self.assertFalse(
            _catastrophic_editorial_underfill(
                {
                    "body_word_count": 447,
                    "reasons": ["belowstoryformfloor:447/760"],
                },
                {"story_form": "lead_analysis", "body_paragraphs": 4},
            )
        )

    def test_short_generic_editorial_triggers_revision_prompt(self) -> None:
        report = {"reasons": ["below_story_form_floor:410/620", "generic_editorial_filler"]}

        self.assertTrue(_should_attempt_editorial_revision(report))
        prompt = _build_editorial_revision_prompt(report, {"story_form": "theme_column", "story_mode": "Theme Column"})
        self.assertIn("filed BAT piece", prompt)
        self.assertIn("Clear the", prompt)

    def test_short_longform_triggers_editorial_expansion_prompt(self) -> None:
        report = {"body_word_count": 520, "body_paragraph_count": 3, "reasons": ["below_story_form_floor:520/760"]}
        story_brief = {"story_form": "lead_analysis", "story_mode": "Lead Analysis", "body_paragraphs": 4}

        self.assertTrue(_needs_editorial_expansion(report, story_brief))
        prompt = _build_editorial_expansion_prompt(report, story_brief)
        self.assertIn("fully filed BAT piece", prompt)
        self.assertIn("must clear at least 760 words", prompt)
        self.assertIn("Do not invent named officials", prompt)

    def test_publish_recommendation_holds_grounded_fallback_for_rework(self) -> None:
        recommendation = _publish_recommendation(
            style_report={"passes": True, "score": 82},
            grounded_source_count=3,
            reroll_count=2,
            needs_research=False,
            generation_path="fallback_grounded",
            freshness_age_days=1,
        )

        self.assertFalse(recommendation["recommended"])
        self.assertEqual(recommendation["reason"], "fallback_requires_model_rework")

    def test_preferred_story_sources_stay_locked_to_story_focus_query(self) -> None:
        sources = [
            {
                "title": "Trump administration deepens quest to stamp out the events of Jan. 6",
                "source_name": "Detroit News",
                "source_label": "Detroit News",
                "source_kind": "reporting",
                "quality_score": 7.1,
                "credibility_tier": "medium",
                "age_days": 1,
            },
            {
                "title": "Trump’s budget director defends White House plan for massive boost in military spending",
                "source_name": "AP News",
                "source_label": "AP News",
                "source_kind": "reporting",
                "quality_score": 9.9,
                "credibility_tier": "high",
                "age_days": 0,
            },
        ]

        preferred = _preferred_story_sources(
            sources,
            limit=2,
            query_text="budget director military spending AP News",
        )

        self.assertEqual(len(preferred), 1)
        self.assertEqual(
            preferred[0]["title"],
            "Trump’s budget director defends White House plan for massive boost in military spending",
        )

    def test_grounding_report_flags_unsupported_names_dates_and_numbers(self) -> None:
        retrieval_bundle = {
            "query_text": "Trump military spending latest 2026",
            "raw_sources": [
                {
                    "title": "Trump’s budget director defends White House plan for massive boost in military spending",
                    "source_name": "AP News",
                    "source_label": "AP News",
                    "source_kind": "reporting",
                    "quality_score": 9.9,
                    "credibility_tier": "high",
                    "age_days": 0,
                    "evidence_excerpts": [
                        "Trump’s budget director defended the White House plan for a massive boost in military spending."
                    ],
                }
            ],
        }
        story_brief = {
            "selected_angle": "Trump’s budget director defends White House plan for massive boost in military spending",
            "freshest_evidence": "Trump’s budget director defends White House plan for massive boost in military spending (AP News)",
            "why_now": "The latest reporting puts the budget fight on paper instead of leaving it in rhetoric.",
            "thesis_to_prove": "Trump’s budget director defends White House plan for massive boost in military spending",
            "counterforce": "The price tag is already bigger than the spin around it.",
            "synthesis_to_land": "The money tell is doing more work than the rhetoric.",
            "gold_thread": "Follow the budget tell in 'Trump’s budget director defends White House plan for massive boost in military spending'.",
        }
        report = _grounding_report(
            (
                "The Treasury’s budget director, Dan Smith, told Congress on March 26 that the plan would rise by "
                "12 percent and leave a $4.5 trillion deficit in 2027."
            ),
            retrieval_bundle=retrieval_bundle,
            story_brief=story_brief,
            analysis_brief={
                "meta": {
                    "source_roles": [
                        {
                            "title": "Trump’s budget director defends White House plan for massive boost in military spending",
                            "outlet": "AP News",
                        }
                    ]
                }
            },
        )

        self.assertFalse(report["passes"])
        self.assertIn("Dan Smith", report["unsupported_specifics"])
        self.assertIn("March 26", report["unsupported_specifics"])
        self.assertIn("12 percent", report["unsupported_specifics"])

    def test_assess_grounded_editorial_candidate_hard_fails_on_unsupported_specifics(self) -> None:
        report = _assess_grounded_editorial_candidate(
            "Dan Smith told Congress the deficit would hit $4.5 trillion in 2027 while the White House celebrated.",
            title="Budget director defends Pentagon surge",
            recent_coverage=[],
            repetition_guard=None,
            story_brief={
                "story_form": "lead_analysis",
                "body_paragraphs": 4,
                "selected_angle": "Trump’s budget director defends White House plan for massive boost in military spending",
                "freshest_evidence": "Trump’s budget director defends White House plan for massive boost in military spending (AP News)",
            },
            retrieval_bundle={
                "query_text": "Trump military spending latest 2026",
                "raw_sources": [
                    {
                        "title": "Trump’s budget director defends White House plan for massive boost in military spending",
                        "source_name": "AP News",
                        "source_label": "AP News",
                        "source_kind": "reporting",
                        "quality_score": 9.9,
                        "credibility_tier": "high",
                        "age_days": 0,
                        "evidence_excerpts": [
                            "Trump’s budget director defended the White House plan for a massive boost in military spending."
                        ],
                    }
                ],
            },
            analysis_brief=None,
        )

        self.assertFalse(report["passes"])
        self.assertTrue(report["hard_fail"])
        self.assertTrue(any("unsupportedspecifics" in reason.replace("_", "") for reason in report["reasons"]))

    def test_launch_packet_rebuilds_public_why_now_from_clean_story_inputs(self) -> None:
        launch = _build_launch_packet(
            "Trump’s Budget Director Defends $1.5 Trillion Pentagon Surge—Who Will Pay the Price?",
            "As the administration pushes a massive boost in defense spending, the cost is already echoing.",
            "# Trump’s Budget Director Defends $1.5 Trillion Pentagon Surge—Who Will Pay the Price?\n\nThe record is getting more expensive.\n\nThe paperwork keeps making the cost harder to hide.\n\n## Pattern Signals\n- The pattern is clear.",
            {
                "focus_label": "Sitewide",
                "selected_angle": "Trump’s budget director defends White House plan for massive boost in military spending",
                "freshest_evidence": "Trump’s budget director defends White House plan for massive boost in military spending (AP News)",
                "why_now": "AP News just moved the lane from 'old line' to 'new line', which is why sitewide deserves a cleaner second look now.",
                "counterforce": "The clean reporting is already bigger than the spin.",
                "synthesis_to_land": "The money tell is harder to hide once the paperwork lands.",
                "gold_thread": "Follow the budget tell in 'Trump’s budget director defends White House plan for massive boost in military spending'.",
                "audience_hook": "Move readers from the headline into the cost hiding underneath it.",
            },
        )

        self.assertNotIn("moved the lane from", launch["why_now"].lower())
        self.assertTrue(launch["why_now"])
        self.assertNotIn("the pattern is clear", " ".join(launch["pattern_signals"]).lower())

    def test_editorial_gate_counts_body_only_not_headline_dek_and_bullets(self) -> None:
        text = """Story form label: Theme Column

# Trump tries another legal shortcut

A sharper dek can still not do the body’s job.

The filing is thin.

The spin is louder than the paperwork.

## Pattern Signals
- Courts keep forcing a cleaner answer.
- The White House line still outruns the legal receipt.
"""
        report = _assess_style_candidate(
            text,
            lane="editorial",
            title="Trump tries another legal shortcut",
            story_brief={"story_form": "theme_column", "body_paragraphs": 4},
        )

        self.assertEqual(report["body_paragraph_count"], 2)
        self.assertLess(report["body_word_count"], report["word_count"])
        self.assertFalse(report["passes"])

    def test_source_receipt_sentence_uses_evidence_excerpt(self) -> None:
        sentence = _source_receipt_sentence(
            {
                "title": "Judge orders Trump administration to defend the filing in court",
                "source_label": "Reuters",
                "source_kind": "reporting",
                "evidence_excerpts": [
                    "The judge ordered the administration to explain why its courtroom position was narrower than the public line."
                ],
            },
            role="lead",
        )
        self.assertIn("Reuters", sentence)
        self.assertIn("judge ordered the administration", sentence.lower())

    def test_source_receipt_sentence_filters_misaligned_excerpt_noise(self) -> None:
        sentence = _source_receipt_sentence(
            {
                "title": "Trump budget director defends White House plan for massive boost in military spending",
                "source_label": "AP News",
                "source_kind": "reporting",
                "evidence_excerpts": [
                    "Then Trump changed the rules A lost icon: The American chestnut and its central place in the eastern forest.",
                    "The budget director defended the White House plan for a massive boost in military spending.",
                ],
                "snippet": "Budget director defended the White House military spending plan.",
            },
            role="lead",
            query_text="Trump budget director military spending latest 2026",
        )

        self.assertIn("budget director defended", sentence.lower())
        self.assertNotIn("american chestnut", sentence.lower())

    def test_change_type_helper(self) -> None:
        self.assertEqual(_change_type(6.2), "rising")
        self.assertEqual(_change_type(2.8), "steady")
        self.assertEqual(_change_type(1.2), "cooling")

    def test_editorial_gate_rejects_prompt_echo(self) -> None:
        report = evaluate_style_gate(
            "We need to produce a recurring-theme take grounded in sources. The sources are minimal: one Reuters item.",
            lane="editorial",
        )
        self.assertFalse(report["passes"])
        self.assertTrue(report["hard_fail"])

    def test_voice_polish_strips_prompt_echo_prefix(self) -> None:
        polished = _apply_voice_polish(
            "We must ground claims in source: The AP filing says one thing and Trump says another on camera.",
            lane="social",
        )
        self.assertFalse(polished.lower().startswith("we must ground claims in source"))

    def test_voice_polish_strips_instructional_opening(self) -> None:
        polished = _apply_voice_polish(
            "We need 3 short paragraphs. No stock intro phrasing. Must be grounded in sources. "
            "The administration filing and the podium statement still conflict.",
            lane="editorial",
        )
        self.assertIn("administration filing", polished.lower())
        self.assertNotIn("we need 3 short paragraphs", polished.lower())

    def test_voice_polish_strips_multi_sentence_prompt_echo(self) -> None:
        polished = _apply_voice_polish(
            "Write a BAT reading-room post about Trump executive overreach this week. "
            "Keep one concrete receipt and one sharp line. "
            "Reuters says the judge wants a clearer legal defense by Friday.",
            lane="live_social",
        )
        self.assertTrue(polished.startswith("Reuters says"))
        self.assertNotIn("Write a BAT", polished)
        self.assertNotIn("Keep one concrete receipt", polished)

    def test_voice_polish_strips_story_packet_echo_lines(self) -> None:
        polished = _apply_voice_polish(
            """Story brief:
- Continuity note: The site was already on this lane earlier today.
- Social hook: The filings keep telling on the spin.

# Trump filings keep telling on the spin
The court receipt is doing the talking.

A nearby BAT piece already ran earlier today, so treat this as the next site note.

Reuters says the judge wants a cleaner legal answer by Friday, and the White House line is already narrower on paper than it was on camera.

## Pattern Signals
- Court pressure keeps forcing cleaner language.
""",
            lane="editorial",
        )

        self.assertIn("Reuters says the judge wants a cleaner legal answer by Friday", polished)
        self.assertNotIn("Story brief", polished)
        self.assertNotIn("A nearby BAT piece already ran", polished)
        self.assertNotIn("The site was already on this lane earlier today", polished)

    def test_summary_uses_body_not_story_form_label(self) -> None:
        summary = _build_summary(
            """Story form label: Theme Column

# Trump tries another shortcut

A dek that should not become the summary.

The judge asked for the legal theory the podium keeps dodging.

Congress is pretending it cannot hear the constitutional alarm.
"""
        )

        self.assertNotIn("Story form label", summary)
        self.assertNotIn("A dek", summary)
        self.assertIn("judge asked for the legal theory", summary.lower())

    def test_story_brief_tracks_quality_and_why_now(self) -> None:
        brief = _build_story_brief(
            {
                "query_text": "Trump administration legal contradiction",
                "focus_theme": {"slug": "legal-heat", "name": "Legal Heat", "description": "Court fights and filings."},
                "raw_sources": [
                    {
                        "title": "Federal judge blocks Trump administration order",
                        "source_name": "Reuters",
                        "quality_score": 4.8,
                        "credibility_tier": "high",
                        "age_days": 0,
                    },
                    {
                        "title": "White House says the order will stand",
                        "source_name": "AP",
                        "quality_score": 4.5,
                        "credibility_tier": "high",
                        "age_days": 1,
                    },
                ],
                "trend_ledger": [{"title": "Courts keep checking executive overreach"}],
            },
            object_type="lead_story",
            directive="Lead with the contradiction.",
        )
        self.assertEqual(brief["focus_label"], "Legal Heat")
        self.assertEqual(brief["source_mix"]["count"], 2)
        self.assertGreaterEqual(brief["source_mix"]["avg_quality"], 4.0)
        self.assertGreaterEqual(len(brief["why_now"]), 40)
        self.assertTrue(
            "reuters" in brief["why_now"].lower()
            or "ap" in brief["why_now"].lower()
            or "lane" in brief["why_now"].lower()
        )

    def test_story_brief_absorbs_analysis_brief_targets(self) -> None:
        brief = _build_story_brief(
            {
                "query_text": "Trump legal contradiction",
                "focus_theme": {"slug": "legal-collision", "name": "Legal Collision"},
                "raw_sources": [
                    {
                        "title": "Judge orders Trump administration to defend the filing in court",
                        "source_name": "Reuters",
                        "source_label": "Reuters",
                        "source_kind": "reporting",
                        "quality_score": 4.8,
                        "credibility_tier": "high",
                        "age_days": 0,
                    },
                    {
                        "title": "White House says the order will stand",
                        "source_name": "White House",
                        "source_label": "White House",
                        "source_kind": "institutional",
                        "quality_score": 4.5,
                        "credibility_tier": "high",
                        "age_days": 0,
                    },
                ],
                "trend_ledger": [{"title": "Courts keep forcing a clearer answer"}],
            },
            object_type="theme_take",
            directive="Lead with the contradiction.",
            analysis_brief={
                "summary": "Legal Collision is the live lane: the line is cleaner in the briefing than in the filing.",
                "meta": {
                    "focus_label": "Legal Collision",
                    "selected_angle": "Judge orders Trump administration to defend the filing in court",
                    "pattern": "The official line keeps bending around the receipt.",
                    "why_now": "Fresh reporting is still warm enough to move the lane.",
                    "audience_value": "Show readers how the filing and the spin room split apart.",
                    "tone": {"primary": "silk-scalpel"},
                    "story_targets": {"long_form": "theme_update", "long_form_label": "Signal Update"},
                    "dialectic": {
                        "thesis": "Judge orders Trump administration to defend the filing in court",
                        "counterforce": "The official line is still trying to outrun the filing.",
                        "synthesis": "The legal tell is now the real story.",
                        "gold_thread": "Follow the legal tell in 'Judge orders Trump administration to defend the filing in court'.",
                        "writer_north_star": "Open on the filing, break the podium line, and use the legal tell to show the bigger power move.",
                    },
                    "social_hooks": ["The filing says one thing and the podium says another."],
                    "open_loops": ["Name what changed since the last pass."],
                    "source_roles": [
                        {
                            "role": "legal_receipt",
                            "role_label": "Legal receipt",
                            "outlet": "Reuters",
                            "title": "Judge orders Trump administration to defend the filing in court",
                            "quality_score": 4.8,
                            "age_days": 0,
                        }
                    ],
                },
            },
        )

        self.assertEqual(brief["analysis_tone"]["primary"], "silk-scalpel")
        self.assertEqual(brief["analysis_story_targets"]["long_form"], "theme_update")
        self.assertEqual(brief["why_now"], "Fresh reporting is still warm enough to move the lane.")
        self.assertIn("The filing says one thing and the podium says another.", brief["social_hooks"])
        self.assertIn("Name what changed since the last pass.", brief["analysis_open_loops"])
        self.assertIn("Follow the legal tell", brief["gold_thread"])
        self.assertIn("use the legal tell", brief["writer_north_star"].lower())

    def test_story_brief_keeps_concrete_angle_when_recent_coverage_matches(self) -> None:
        selected_angle = "Justice Jackson chides Supreme Court conservatives over ‘oblivious’ pro-Trump emergency orders"
        brief = _build_story_brief(
            {
                "query_text": "Trump executive overreach latest 2026",
                "focus_theme": {"name": "Sitewide"},
                "raw_sources": [
                    {
                        "title": selected_angle,
                        "source_name": "AP News",
                        "source_label": "AP News",
                        "source_kind": "reporting",
                        "quality_score": 8.4,
                        "credibility_tier": "high",
                        "age_days": 0,
                        "evidence_excerpts": [
                            "Supreme Court Justice Ketanji Brown Jackson has delivered an attack on her conservative colleagues’ use of emergency orders."
                        ],
                    }
                ],
                "trend_ledger": [{"title": "March 26, 2026 – Trump administration news"}],
            },
            object_type="lead_story",
            recent_coverage=[{"title": "Earlier site lead", "selected_angle": selected_angle, "age_hours": 1}],
            analysis_brief={
                "summary": "Sitewide is moving through the court record now.",
                "meta": {
                    "focus_label": "Sitewide",
                    "selected_angle": selected_angle,
                    "pattern": "March 26, 2026 – Trump administration news",
                    "why_now": "Fresh reporting is still warm enough to move the lane.",
                    "tone": {"primary": "silk-scalpel"},
                    "story_targets": {"long_form": "lead_analysis", "long_form_label": "Lead Analysis"},
                    "dialectic": {
                        "thesis": selected_angle,
                        "counterforce": "The cleanest available receipt is already bigger than the spin around sitewide.",
                        "synthesis": "Sitewide stops looking like random chaos once you follow the legal tell.",
                        "gold_thread": f"Follow the legal tell in '{selected_angle}'.",
                        "writer_north_star": "Open on the opinion and let the legal tell do the work.",
                    },
                    "source_roles": [
                        {
                            "role": "legal_receipt",
                            "role_label": "Legal receipt",
                            "outlet": "AP News",
                            "title": selected_angle,
                            "quality_score": 8.4,
                            "age_days": 0,
                        }
                    ],
                },
            },
        )

        self.assertEqual(brief["selected_angle"], selected_angle)
        self.assertNotIn("March 26", brief["selected_angle"])

    def test_story_brief_does_not_let_generic_voice_blueprint_override_audience_hook(self) -> None:
        brief = _build_story_brief(
            {
                "query_text": "Trump legal contradiction",
                "focus_theme": {"slug": "legal-collision", "name": "Legal Collision"},
                "raw_sources": [
                    {
                        "title": "Judge orders Trump administration to defend the filing in court",
                        "source_name": "Reuters",
                        "source_label": "Reuters",
                        "source_kind": "reporting",
                        "quality_score": 4.8,
                        "credibility_tier": "high",
                        "age_days": 0,
                    }
                ],
                "trend_ledger": [{"title": "Courts keep forcing a clearer answer"}],
            },
            object_type="theme_take",
            directive=(
                "Personal-site political voice. It should feel like a real woman lives here: polished, warm, lacquered, and cutting."
            ),
            analysis_brief={
                "meta": {
                    "focus_label": "Legal Collision",
                    "audience_value": "Show readers how the filing and the spin room split apart.",
                    "tone": {"primary": "silk-scalpel"},
                }
            },
        )

        self.assertEqual(brief["audience_hook"], "Show readers how the filing and the spin room split apart.")

    def test_story_brief_keeps_lead_story_form_when_analysis_brief_is_theme_shaped(self) -> None:
        brief = _build_story_brief(
            {
                "query_text": "Trump executive overreach latest 2026",
                "focus_theme": {"slug": "executive-overreach", "name": "Executive Overreach"},
                "raw_sources": [
                    {
                        "title": "Federal judge blocks Trump administration order",
                        "source_name": "Reuters",
                        "source_label": "Reuters",
                        "source_kind": "reporting",
                        "quality_score": 4.9,
                        "credibility_tier": "high",
                        "age_days": 0,
                    }
                ],
                "trend_ledger": [{"title": "Executive Overreach remains active"}],
            },
            object_type="lead_story",
            analysis_brief={
                "meta": {
                    "story_targets": {"long_form": "theme_column"},
                    "selected_angle": "Federal judge blocks Trump administration order",
                }
            },
        )

        self.assertEqual(brief["story_form"], "lead_analysis")

    def test_refined_editorial_query_text_uses_analysis_angle_for_lead_story(self) -> None:
        refined = _refined_editorial_query_text(
            "Trump White House GOP courts latest 2026",
            object_type="lead_story",
            theme=None,
            analysis_brief={
                "title": "Trump’s tenuous Iran exit plan isn’t healing Republican rifts exposed by the war",
                "meta": {
                    "selected_angle": "Trump’s tenuous Iran exit plan isn’t healing Republican rifts exposed by the war",
                    "focus_label": "Sitewide",
                },
            },
        )

        self.assertIn("iran exit plan", refined.lower())
        self.assertNotIn("gop courts", refined.lower())
        self.assertIn("2026", refined)

    def test_refined_editorial_query_text_skips_generic_sitewide_angle(self) -> None:
        refined = _refined_editorial_query_text(
            "Trump White House GOP courts latest 2026",
            object_type="lead_story",
            theme=None,
            analysis_brief={
                "title": "AP reveals Trump administration data error behind fraud probe",
                "meta": {
                    "selected_angle": "Sitewide is still the live contradiction lane.",
                    "focus_label": "Sitewide",
                },
            },
        )

        self.assertIn("data error behind fraud probe", refined.lower())
        self.assertNotIn("contradiction lane", refined.lower())

    def test_refined_editorial_query_text_prefers_analysis_variants_for_theme_lane(self) -> None:
        refined = _refined_editorial_query_text(
            "Trump administration Energy Shock Politics latest 2026",
            object_type="theme_take",
            theme=type("ThemeStub", (), {"name": "Energy Shock Politics", "slug": "energy-shock-politics"})(),
            analysis_brief={
                "meta": {
                    "query_variants": [
                        "Trump administration Energy Shock Politics oil prices hormuz shipping inflation latest 2026",
                        "Trump administration Energy Shock Politics allies congress backlash latest 2026",
                    ],
                    "selected_angle": "Energy Shock Politics remains active",
                }
            },
        )

        self.assertIn("oil prices hormuz shipping inflation", refined.lower())

    def test_refined_editorial_query_text_skips_instructional_query_variant(self) -> None:
        refined = _refined_editorial_query_text(
            "Trump White House GOP courts latest 2026",
            object_type="lead_story",
            theme=None,
            analysis_brief={
                "title": "Appeals court rebuffs Anthropic in latest round of its AI battle with the Trump administration",
                "meta": {
                    "query_variants": [
                        "Prefer sources with documents, filings, transcripts, sanctions, orders, votes, or direct quotes. 2026",
                        "Appeals court rebuffs Anthropic in latest round of its AI battle with the Trump administration",
                    ],
                    "selected_angle": "Appeals court rebuffs Anthropic in latest round of its AI battle with the Trump administration",
                },
            },
        )

        self.assertIn("anthropic", refined.lower())
        self.assertNotIn("prefer sources", refined.lower())

    def test_editorial_query_sets_amplify_writer_research_without_meta_directives(self) -> None:
        query_sets = _editorial_query_sets(
            "Trump Foreign Policy Escalation latest 2026 iran ceasefire sanctions blockade",
            object_type="lead_story",
            theme=None,
            analysis_brief={
                "title": "US Senate rejects war powers bill that would halt attacks against Iran",
                "meta": {
                    "query_variants": [
                        "Prefer sources with documents, filings, transcripts, sanctions, orders, votes, or direct quotes. 2026",
                        "Trump Foreign Policy Escalation latest 2026 iran ceasefire sanctions blockade",
                        "Trump Foreign Policy Escalation latest 2026 iran ceasefire sanctions blockade briefing contradiction ceasefire war powers",
                    ],
                    "selected_angle": "US Senate rejects war powers bill that would halt attacks against Iran",
                },
            },
        )

        self.assertGreaterEqual(len(query_sets), 2)
        self.assertTrue(any("war powers" in item["query_text"].lower() for item in query_sets))
        self.assertFalse(any("prefer sources" in item["query_text"].lower() for item in query_sets))

    def test_editorial_query_sets_keep_lead_story_locked_to_selected_angle(self) -> None:
        query_sets = _editorial_query_sets(
            "Trump executive overreach latest 2026",
            object_type="lead_story",
            theme=None,
            analysis_brief={
                "title": "Trump budget director defends White House plan for massive boost in military spending",
                "meta": {
                    "selected_angle": "Trump budget director defends White House plan for massive boost in military spending",
                    "query_variants": [
                        "Trump executive overreach latest 2026 court injunction executive order congress",
                        "Trump executive overreach latest 2026 backlash prices allies congress donor fallout",
                    ],
                },
            },
        )

        self.assertTrue(query_sets)
        self.assertIn("budget director", query_sets[0]["query_text"].lower())

    def test_editorial_context_packet_distills_writer_handoff(self) -> None:
        bundle = {
            "query_text": "Trump legal contradiction",
            "focus_theme": {"slug": "legal-collision", "name": "Legal Collision"},
            "raw_sources": [
                {
                    "title": "Judge orders Trump administration to defend the filing in court",
                    "source_name": "Reuters",
                    "source_label": "Reuters",
                    "source_kind": "reporting",
                    "quality_score": 4.8,
                    "credibility_tier": "high",
                    "age_days": 0,
                    "evidence_excerpts": [
                        "The judge ordered the administration to explain why the courtroom claim was narrower than the public line."
                    ],
                }
            ],
            "trend_ledger": [{"title": "Courts keep forcing a cleaner answer"}],
        }
        analysis_brief = {
            "summary": "Legal Collision is the live lane.",
            "meta": {
                "focus_label": "Legal Collision",
                "selected_angle": "Judge orders Trump administration to defend the filing in court",
                "contradiction_core": "The paperwork is narrower than the podium boast.",
                "dialectic": {
                    "thesis": "Judge orders Trump administration to defend the filing in court",
                    "counterforce": "The podium line is still trying to outrun the filing.",
                    "synthesis": "The legal tell is now the real story.",
                    "gold_thread": "Follow the legal tell in 'Judge orders Trump administration to defend the filing in court'.",
                    "writer_north_star": "Open on the filing, break the podium line, and use the legal tell to show the bigger power move.",
                },
                "story_targets": {"long_form": "theme_update"},
                "open_loops": ["Show readers where the filing gets smaller than the speech."],
                "source_roles": [
                    {
                        "role": "legal_receipt",
                        "role_label": "Legal receipt",
                        "outlet": "Reuters",
                        "title": "Judge orders Trump administration to defend the filing in court",
                    }
                ],
            },
        }
        brief = _build_story_brief(bundle, object_type="theme_take", analysis_brief=analysis_brief)
        packet = _build_editorial_context_packet(
            bundle,
            brief,
            analysis_brief,
            voice_entries=[{"value": "Keep the line polished, blond, and merciless only when the receipts earn it."}],
        )

        self.assertIn("Writer packet", packet)
        self.assertIn("Angle to advance: Judge orders Trump administration to defend the filing in court", packet)
        self.assertIn("Gold thread to mine: Follow the legal tell", packet)
        self.assertIn("Writer north star: Open on the filing", packet)
        self.assertIn("Receipts to use", packet)
        self.assertNotIn("Story brief:", packet)
        self.assertNotIn("Analysis engine brief:", packet)

    def test_story_brief_sanitizes_instructional_query_prompt(self) -> None:
        brief = _build_story_brief(
            {
                "query_text": "Write a BAT reading-room post about Trump executive overreach this week. Keep one concrete receipt and one sharp line.",
                "raw_sources": [],
                "trend_ledger": [],
            },
            object_type="lead_story",
            directive="Keep it sharp.",
        )
        self.assertEqual(brief["focus_label"], "Executive Overreach")
        self.assertNotIn("write a bat", brief["focus_label"].lower())
        self.assertNotIn("keep it sharp", brief["audience_hook"].lower())

    def test_style_assessment_flags_continuity_meta_echo_as_prompt_leak(self) -> None:
        report = _assess_style_candidate(
            """# Trump filings keep telling on the spin
The judge wants the legal theory on paper.

A nearby BAT piece already ran earlier today, so this is the next site note.

Reuters says the administration now has to explain why the courtroom theory is smaller than the boast from the podium.

The contradiction matters because the filing is suddenly doing more governing than the press office.

## Pattern Signals
- Court pressure keeps forcing cleaner language.
""",
            lane="editorial",
            title="Trump filings keep telling on the spin",
            story_brief={"story_form": "theme_update", "body_paragraphs": 2},
        )

        self.assertFalse(report["passes"])
        self.assertTrue(report["hard_fail"])
        self.assertTrue(any("prompt" in reason or "placeholder" in reason for reason in report["reasons"]))

    def test_style_assessment_penalizes_generic_editorial_filler(self) -> None:
        report = _assess_style_candidate(
            """# Trump tries to outrun the paperwork
The dek is not the point here.

An appeals court ruling is the latest blow in a series of legal headaches for the Trump administration. It is not just a political flourish. In a nutshell, the ruling is a sobering reminder that courts still exist.

Reuters says the filing is narrower than the podium line, and congressional Republicans are already trimming the bravado in public.

That gap matters because the legal paper is suddenly doing more governing than the men doing the boasting.
""",
            lane="editorial",
            title="Trump tries to outrun the paperwork",
            story_brief={"story_form": "theme_update", "body_paragraphs": 3},
        )

        self.assertTrue(any("genericeditorialfiller" in reason.replace("_", "") for reason in report["reasons"]))

    def test_story_brief_ignores_reference_titles_for_selected_angle(self) -> None:
        brief = _build_story_brief(
            {
                "query_text": "Trump legal contradiction",
                "raw_sources": [
                    {
                        "title": "Supreme Court emergency orders related to the Trump administration - Ballotpedia",
                        "source_name": "Ballotpedia",
                        "source_label": "Ballotpedia",
                        "source_kind": "reference",
                        "quality_score": 5.4,
                        "credibility_tier": "medium",
                        "age_days": 0,
                    },
                    {
                        "title": "Judge forces Trump administration to defend order in court",
                        "source_name": "Reuters",
                        "source_label": "Reuters",
                        "source_kind": "reporting",
                        "quality_score": 4.7,
                        "credibility_tier": "high",
                        "age_days": 0,
                    },
                ],
                "trend_ledger": [{"title": "Courts keep checking executive overreach"}],
            },
            object_type="lead_story",
        )
        self.assertEqual(brief["selected_angle"], "Judge forces Trump administration to defend order in court")
        self.assertNotIn("Ballotpedia", brief["selected_angle"])

    def test_story_brief_prefers_foreign_policy_aligned_source_over_generic_trump_pages(self) -> None:
        brief = _build_story_brief(
            {
                "query_text": "Trump Iran war latest 2026",
                "raw_sources": [
                    {
                        "title": "Crude Oil Price Today | WTI OIL PRICE CHART | OIL PRICE",
                        "source_name": "Business Insider",
                        "source_label": "Business Insider",
                        "source_kind": "reporting",
                        "quality_score": 9.1,
                        "editorial_priority_score": 10.8,
                        "credibility_tier": "medium",
                        "age_days": 0,
                        "snippet": "Oil prices jump after Trump escalates the Iran standoff and White House aides scramble.",
                    },
                    {
                        "title": "Republican leaders in Congress announce plan to end DHS shutdown",
                        "source_name": "AP News",
                        "source_label": "AP News",
                        "source_kind": "reporting",
                        "quality_score": 9.4,
                        "editorial_priority_score": 11.4,
                        "credibility_tier": "high",
                        "age_days": 0,
                        "snippet": "The shutdown fight gives Trump another headache on Capitol Hill.",
                    },
                    {
                        "title": "Trump delivers contradictory messages on Iran war in White House briefings",
                        "source_name": "The Globe and Mail",
                        "source_label": "The Globe and Mail",
                        "source_kind": "reporting",
                        "quality_score": 7.4,
                        "editorial_priority_score": 7.0,
                        "credibility_tier": "medium",
                        "age_days": 0,
                        "snippet": "Trump's aides and Hill Republicans split as Iran war messaging keeps shifting.",
                    },
                ],
                "trend_ledger": [{"title": "War powers backlash keeps widening"}],
            },
            object_type="lead_story",
        )
        self.assertEqual(brief["selected_angle"], "Trump delivers contradictory messages on Iran war in White House briefings")
        self.assertNotIn("DHS shutdown", brief["selected_angle"])
        self.assertNotIn("OIL PRICE", brief["selected_angle"])

    def test_story_brief_prefers_reporting_over_white_house_spin_for_war_angle(self) -> None:
        brief = _build_story_brief(
            {
                "query_text": "Trump Iran war latest 2026",
                "raw_sources": [
                    {
                        "title": "America's Warriors Are Obliterating Iranian Terror Regime with Unrelenting Force",
                        "source_name": "White House",
                        "source_label": "White House",
                        "source_kind": "institutional",
                        "quality_score": 9.1,
                        "editorial_priority_score": 11.4,
                        "credibility_tier": "high",
                        "age_days": 0,
                        "snippet": "The administration says the war effort is overwhelming Iran.",
                    },
                    {
                        "title": "US Ground Forces Arrive in Middle East as Iran Conflict Escalates",
                        "source_name": "Military.com",
                        "source_label": "Military.com",
                        "source_kind": "reporting",
                        "quality_score": 8.6,
                        "editorial_priority_score": 10.8,
                        "credibility_tier": "medium",
                        "age_days": 0,
                        "snippet": "Ground-capable forces are arriving even as the White House says the conflict is under control.",
                    },
                    {
                        "title": "Iran says its forces 'waiting' as US troops arrive in region",
                        "source_name": "BBC",
                        "source_label": "BBC",
                        "source_kind": "reporting",
                        "quality_score": 8.7,
                        "editorial_priority_score": 10.9,
                        "credibility_tier": "high",
                        "age_days": 0,
                        "snippet": "The regional picture keeps hardening as troops move into place.",
                    },
                ],
                "trend_ledger": [{"title": "War powers backlash keeps widening"}],
            },
            object_type="lead_story",
        )
        self.assertNotIn("Obliterating Iranian Terror Regime", brief["selected_angle"])
        self.assertIn(
            brief["selected_angle"],
            {
                "US Ground Forces Arrive in Middle East as Iran Conflict Escalates",
                "Iran says its forces 'waiting' as US troops arrive in region",
            },
        )

    def test_launch_packet_collects_signals_and_quote(self) -> None:
        packet = _build_launch_packet(
            "The filings keep telling on the spin",
            "A dek line about the contradiction.",
            (
                "# The filings keep telling on the spin\n"
                "A dek line about the contradiction.\n\n"
                "The Trump administration told the court one story and the cameras another.\n\n"
                "The federal filing narrows the claim while the White House widens the promise.\n\n"
                "That is not confidence. That is a talking point outrunning its paperwork.\n\n"
                "## Pattern Signals\n"
                "- Legal filing is narrower than the public boast\n"
                "- Court pressure keeps forcing cleaner language\n"
            ),
            {
                "story_mode": "Lead Story",
                "selected_angle": "Filings versus spin",
                "why_now": "Fresh reporting keeps the contradiction hot.",
                "social_hooks": ["The paperwork keeps shrinking while the promise keeps growing."],
            },
        )
        self.assertGreaterEqual(len(packet["pattern_signals"]), 2)
        self.assertTrue(packet["pull_quote"])
        self.assertTrue(packet["social_hooks"])

    def test_launch_packet_sanitizes_internal_continuity_language(self) -> None:
        packet = _build_launch_packet(
            "Hormuz pricing keeps getting hotter",
            "A dek line about energy fallout.",
            (
                "# Hormuz pricing keeps getting hotter\n"
                "A dek line about energy fallout.\n\n"
                "Oil traders are repricing Gulf risk as the White House keeps playing chicken with a shipping artery.\n\n"
                "That turns a foreign-policy boast into a domestic cost story very quickly.\n"
            ),
            {
                "story_mode": "Theme Column",
                "selected_angle": "Oil traders brace for Hormuz insurance shock after Trump threat",
                "why_now": "The site was already on this lane earlier today, but AP News moved it beyond 'Earlier note'.",
                "social_hooks": [
                    "The site was already on this lane earlier today, but AP News moved it beyond 'Earlier note'.",
                    "Oil traders are repricing Gulf risk as the White House keeps playing chicken with a shipping artery.",
                ],
                "freshest_evidence": "Oil traders brace for Hormuz insurance shock after Trump threat (Financial Times)",
            },
        )

        self.assertNotIn("site was already on this lane", packet["why_now"].lower())
        self.assertFalse(any("site was already on this lane" in hook.lower() for hook in packet["social_hooks"]))
        self.assertTrue(packet["why_now"])

    def test_grounded_editorial_fallback_builds_publishable_markdown(self) -> None:
        bundle = {
            "query_text": "Trump administration legal contradiction",
            "raw_sources": [
                {
                    "title": "Judge forces Trump administration to defend order in court",
                    "source_name": "Reuters",
                    "source_label": "Reuters",
                    "source_kind": "reporting",
                    "quality_score": 4.8,
                    "credibility_tier": "high",
                    "age_days": 0,
                    "snippet": "The judge ordered the administration to explain the legal basis for the move by Friday.",
                },
                {
                    "title": "White House says Trump order still matches the policy goal",
                    "source_name": "AP",
                    "source_label": "AP",
                    "source_kind": "reporting",
                    "quality_score": 4.5,
                    "credibility_tier": "high",
                    "age_days": 1,
                    "snippet": "Officials argued the order still fits the president's broader message despite the court challenge.",
                },
            ],
            "trend_ledger": [{"title": "Courts keep checking executive overreach"}],
        }
        brief = _build_story_brief(bundle, object_type="lead_story", directive="Lead with the contradiction.")
        body = _build_grounded_editorial_fallback(bundle, brief, object_type="lead_story")
        report = evaluate_style_gate(body, lane="editorial")

        self.assertTrue(report["passes"])
        self.assertIn("## Pattern Signals", body)
        self.assertIn("Reuters", body)
        self.assertNotIn("Draft pending source refresh", body)

    def test_grounded_editorial_fallback_survives_public_polish_for_lead_update(self) -> None:
        bundle = {
            "query_text": "Trump tariff pressure latest 2026",
            "raw_sources": [
                {
                    "title": "Reuters says Trump trade aides narrow tariff claim after market selloff",
                    "source_name": "Reuters",
                    "source_label": "Reuters",
                    "source_kind": "reporting",
                    "quality_score": 8.8,
                    "credibility_tier": "high",
                    "age_days": 0,
                    "snippet": "Trump trade aides narrowed the tariff claim after the market selloff forced a more careful public line.",
                },
                {
                    "title": "AP says White House keeps arguing Trump tariffs still show strength",
                    "source_name": "AP News",
                    "source_label": "AP News",
                    "source_kind": "reporting",
                    "quality_score": 8.6,
                    "credibility_tier": "high",
                    "age_days": 0,
                    "snippet": "White House aides kept arguing the Trump tariff threat still showed strength despite a visibly narrower policy defense.",
                },
                {
                    "title": "Bloomberg says investors see Trump tariff threat turning into a cost story",
                    "source_name": "Bloomberg",
                    "source_label": "Bloomberg",
                    "source_kind": "reporting",
                    "quality_score": 8.4,
                    "credibility_tier": "high",
                    "age_days": 0,
                    "snippet": "Investors increasingly read the Trump tariff threat as a consumer cost story instead of a show of leverage.",
                },
            ],
        }
        brief = {
            "story_form": "lead_update",
            "story_mode": "Lead Update",
            "body_paragraphs": 4,
            "focus_label": "Trump tariff pressure",
            "selected_angle": "Trump tariff retreat collides with court and market pressure",
            "freshest_evidence": "Reuters says Trump trade aides narrowed the tariff claim after the selloff.",
            "why_now": "Fresh reporting shows the White House narrowing its tariff story after market and court pressure.",
            "trend_signal": "The administration keeps selling strength while the paper trail keeps advertising retreat.",
            "theme_context": "The tariff lane is turning into a live stress test of whether the White House can survive its own paperwork.",
            "audience_hook": "This matters because voters will feel the cost long before the spin room settles on a cleaner slogan.",
            "continuity_note": "Each update on the tariff lane keeps shrinking the distance between investor panic and executive improvisation.",
            "source_mix": {"freshest_age_days": 0},
        }

        polished = _apply_voice_polish(
            _build_grounded_editorial_fallback(bundle, brief, object_type="lead_story"),
            lane="editorial",
        )
        report = _assess_grounded_editorial_candidate(
            polished,
            title="Trump tariff pressure",
            recent_coverage=[],
            repetition_guard={},
            story_brief=brief,
            retrieval_bundle=bundle,
            analysis_brief=None,
        )

        self.assertGreaterEqual(int(report["body_paragraph_count"] or 0), 4)
        self.assertNotIn("next site note", polished.lower())
        self.assertNotIn("freshest evidence:", polished.lower())

    def test_grounded_editorial_fallback_clears_theme_column_floor_with_varied_source_work(self) -> None:
        bundle = {
            "query_text": "Trump Iran war oil prices Hormuz latest 2026",
            "raw_sources": [
                {
                    "title": "US conducts new wave of strikes on Iran as ceasefire falters",
                    "source_name": "Al Jazeera",
                    "source_label": "Al Jazeera",
                    "source_kind": "reporting",
                    "quality_score": 8.8,
                    "credibility_tier": "high",
                    "age_days": 0,
                    "snippet": "The United States conducted new strikes as the ceasefire frayed and diplomats warned of regional fallout.",
                },
                {
                    "title": "Oil markets brace for Strait of Hormuz risk after Trump escalation",
                    "source_name": "Reuters",
                    "source_label": "Reuters",
                    "source_kind": "reporting",
                    "quality_score": 8.6,
                    "credibility_tier": "high",
                    "age_days": 0,
                    "snippet": "Oil traders watched shipping and insurance costs as the Trump administration defended the strike.",
                },
                {
                    "title": "Allies press White House for clearer Iran strategy",
                    "source_name": "AP News",
                    "source_label": "AP News",
                    "source_kind": "reporting",
                    "quality_score": 8.4,
                    "credibility_tier": "high",
                    "age_days": 0,
                    "snippet": "Allied officials sought clarity from Washington as the administration tried to contain diplomatic fallout.",
                },
            ],
        }
        brief = {
            "story_form": "theme_column",
            "story_mode": "Theme Column",
            "body_paragraphs": 4,
            "focus_label": "Trump Iran escalation",
            "selected_angle": "Trump Iran escalation turns the ceasefire into a credibility test",
            "freshest_evidence": "US conducts new wave of strikes on Iran as ceasefire falters",
            "why_now": "Fresh reporting shows the White House defending new strikes while allies and markets absorb the risk.",
            "trend_signal": "The administration keeps selling control while the regional record keeps showing exposure.",
            "theme_context": "This lane is about the cost of an act-first foreign policy line.",
            "audience_hook": "The cost lands with troops, allies, markets, and everyone asked to pretend the plan was clear.",
            "continuity_note": "Each Iran update keeps shrinking the space between domestic performance and diplomatic cleanup.",
            "source_mix": {"freshest_age_days": 0},
        }

        body = _build_grounded_editorial_fallback(bundle, brief, object_type="theme_take")
        report = _assess_grounded_editorial_candidate(
            body,
            title="Trump Iran escalation",
            recent_coverage=[],
            repetition_guard={},
            story_brief=brief,
            retrieval_bundle=bundle,
            analysis_brief=None,
        )

        self.assertTrue(report["passes"])
        self.assertGreaterEqual(int(report["body_word_count"] or 0), 620)
        self.assertGreaterEqual(int(report["body_paragraph_count"] or 0), 4)
        self.assertNotIn("belowstoryformfloor", "".join(str(reason) for reason in report["reasons"]).lower())

    def test_publish_recommendation_holds_grounded_fallback_even_when_style_passes(self) -> None:
        recommendation = _publish_recommendation(
            style_report={"passes": True, "score": 82},
            grounded_source_count=4,
            reroll_count=0,
            needs_research=False,
            generation_path="fallback_grounded",
            freshness_age_days=1,
        )

        self.assertFalse(recommendation["recommended"])
        self.assertEqual(recommendation["reason"], "fallback_requires_model_rework")

    def test_curated_links_skip_generic_titles_even_when_snippets_sound_live(self) -> None:
        now = datetime.now(timezone.utc)
        links = _curate_source_links(
            [
                Source(
                    source_type="news",
                    source_name="Townhall",
                    source_url="https://townhall.com/",
                    canonical_url="https://townhall.com/",
                    title="Townhall : Conservative News, Cartoons, Top Stories & Commentary",
                    published_at=now,
                    fetched_at=now,
                    meta={
                        "quality_score": 8.2,
                        "credibility_tier": "medium",
                        "search_snippet": "Trump and White House allies are clashing over the Iran war fallout.",
                        "source_kind": "reporting",
                    },
                ),
                Source(
                    source_type="news",
                    source_name="OilPrice",
                    source_url="https://oilprice.com/oil-price-chart",
                    canonical_url="https://oilprice.com/oil-price-chart",
                    title="Crude Oil Prices Today | OilPrice.com",
                    published_at=now,
                    fetched_at=now,
                    meta={
                        "quality_score": 8.0,
                        "credibility_tier": "medium",
                        "search_snippet": "Oil markets react after Trump weighs a wider Iran strike.",
                        "source_kind": "reporting",
                    },
                ),
                Source(
                    source_type="news",
                    source_name="AP News",
                    source_url="https://apnews.com/article/trump-iran-war-powers",
                    canonical_url="https://apnews.com/article/trump-iran-war-powers",
                    title="Trump faces new war powers pressure as Iran briefings keep shifting",
                    published_at=now,
                    fetched_at=now,
                    meta={
                        "quality_score": 8.8,
                        "credibility_tier": "high",
                        "search_snippet": "Congressional pressure builds as Trump's Iran messaging keeps changing.",
                        "source_kind": "reporting",
                    },
                ),
            ],
            limit=3,
            min_quality=4.0,
        )

        self.assertEqual([link["title"] for link in links], ["Trump faces new war powers pressure as Iran briefings keep shifting"])

    def test_live_social_fallback_candidates_include_publishable_option(self) -> None:
        bundle = {
            "query_text": "Trump court contradiction latest",
            "raw_sources": [
                {
                    "title": "Judge forces Trump administration to defend order in court",
                    "source_name": "Reuters",
                    "source_label": "Reuters",
                    "source_kind": "reporting",
                    "quality_score": 4.8,
                    "credibility_tier": "high",
                    "age_days": 0,
                    "snippet": "The judge ordered the administration to explain the legal basis for the move by Friday.",
                },
                {
                    "title": "White House says Trump order still matches the policy goal",
                    "source_name": "AP",
                    "source_label": "AP",
                    "source_kind": "reporting",
                    "quality_score": 4.4,
                    "credibility_tier": "high",
                    "age_days": 1,
                    "snippet": "Officials argued the order still fits the president's broader message despite the court challenge.",
                },
            ],
            "trend_ledger": [{"title": "Courts keep checking executive overreach"}],
        }
        brief = _build_story_brief(bundle, object_type="lead_story", directive="Keep it sharp.")
        candidates = _build_live_social_fallback_candidates(
            "Trump court contradiction latest",
            "response",
            bundle,
            brief,
        )

        self.assertTrue(candidates)
        self.assertTrue(any(evaluate_style_gate(candidate, lane="live_social")["passes"] for candidate in candidates))
        self.assertTrue(any("trump" in candidate.lower() for candidate in candidates))

    def test_live_social_fallback_candidates_strip_promptish_anchor(self) -> None:
        prompt = "Write a BAT reading-room post about Trump executive overreach this week. Keep one concrete receipt and one sharp line."
        bundle = {
            "query_text": prompt,
            "raw_sources": [
                {
                    "title": "Judge forces Trump administration to defend order in court",
                    "source_name": "Reuters",
                    "source_label": "Reuters",
                    "source_kind": "reporting",
                    "quality_score": 4.8,
                    "credibility_tier": "high",
                    "age_days": 0,
                    "snippet": "The judge ordered the administration to explain the legal basis for the move by Friday.",
                },
                {
                    "title": "White House says Trump order still matches the policy goal",
                    "source_name": "AP",
                    "source_label": "AP",
                    "source_kind": "reporting",
                    "quality_score": 4.4,
                    "credibility_tier": "high",
                    "age_days": 1,
                    "snippet": "Officials argued the order still fits the president's broader message despite the court challenge.",
                },
            ],
            "trend_ledger": [{"title": "Courts keep checking executive overreach"}],
        }
        brief = _build_story_brief(bundle, object_type="lead_story", directive="Keep it sharp.")
        candidates = _build_live_social_fallback_candidates(prompt, "reading-room", bundle, brief)

        self.assertTrue(candidates)
        self.assertFalse(any(candidate.lower().startswith("write a bat") for candidate in candidates))
        self.assertFalse(any(candidate.lower().startswith("keep one concrete receipt") for candidate in candidates))
        self.assertTrue(any("reuters" in candidate.lower() or "ap" in candidate.lower() for candidate in candidates))

    def test_live_social_fallback_candidates_vary_by_intent(self) -> None:
        bundle = {
            "query_text": "Trump court contradiction latest",
            "raw_sources": [
                {
                    "title": "Judge forces Trump administration to defend order in court",
                    "source_name": "Reuters",
                    "source_label": "Reuters",
                    "source_kind": "reporting",
                    "quality_score": 4.8,
                    "credibility_tier": "high",
                    "age_days": 0,
                    "snippet": "The judge ordered the administration to explain the legal basis for the move by Friday.",
                },
                {
                    "title": "White House says Trump order still matches the policy goal",
                    "source_name": "AP",
                    "source_label": "AP",
                    "source_kind": "reporting",
                    "quality_score": 4.4,
                    "credibility_tier": "high",
                    "age_days": 1,
                    "snippet": "Officials argued the order still fits the president's broader message despite the court challenge.",
                },
            ],
            "trend_ledger": [{"title": "Courts keep checking executive overreach"}],
        }
        brief = _build_story_brief(bundle, object_type="lead_story", directive="Keep it sharp.")
        reading_room = _build_live_social_fallback_candidates("Trump court contradiction latest", "reading-room", bundle, brief)
        group_chat = _build_live_social_fallback_candidates("Trump court contradiction latest", "group-chat", bundle, brief)
        notebook = _build_live_social_fallback_candidates("Trump court contradiction latest", "notebook", bundle, brief)

        self.assertTrue(reading_room)
        self.assertTrue(group_chat)
        self.assertTrue(notebook)
        self.assertNotEqual(reading_room[0], group_chat[0])
        self.assertNotEqual(group_chat[0], notebook[0])

    def test_story_brief_carries_analysis_flags_and_argument_spine(self) -> None:
        brief = _build_story_brief(
            {
                "query_text": "Trump legal collision latest 2026",
                "focus_theme": {"slug": "legal-collision", "name": "Legal Collision", "description": "Court fights and filings."},
                "raw_sources": [
                    {
                        "title": "Judge orders Trump administration to defend the filing in court",
                        "source_name": "Reuters",
                        "source_label": "Reuters",
                        "source_kind": "reporting",
                        "quality_score": 8.8,
                        "credibility_tier": "high",
                        "age_days": 0,
                        "snippet": "The judge ordered the administration to explain the legal basis for the move by Friday.",
                    },
                    {
                        "title": "White House says order will stand after court challenge",
                        "source_name": "White House",
                        "source_label": "White House",
                        "source_kind": "institutional",
                        "quality_score": 5.1,
                        "credibility_tier": "high",
                        "age_days": 0,
                        "snippet": "Officials said the White House still stood by the order after the court challenge.",
                    },
                ],
                "trend_ledger": [],
            },
            object_type="theme_take",
            analysis_brief={
                "label": "Legal Collision",
                "title": "Judge orders Trump administration to defend the filing in court",
                "meta": {
                    "selected_angle": "Judge orders Trump administration to defend the filing in court",
                    "why_now": "The filing is now forcing a cleaner answer than the podium line offered.",
                    "dialectic": {
                        "thesis": "Judge orders Trump administration to defend the filing in court",
                        "counterforce": "The official line is still trying to outrun the filing.",
                        "synthesis": "The legal tell is now the real story.",
                        "gold_thread": "Follow the legal tell in 'Judge orders Trump administration to defend the filing in court'.",
                        "writer_north_star": "Open on the filing and prove why the court paper is smaller than the performance.",
                    },
                    "analysis_flags": {
                        "tell_kind": "legal tell",
                        "claim_vs_receipt": "White House is still selling the line while Reuters keeps the cleaner record.",
                        "institutional_stress": "court and filing pressure forcing cleaner language",
                        "beneficiary": "the executive line if delay keeps buying time",
                        "cost_bearer": "courts and public trust",
                        "evidence_strength": "strong live packet with a visible claim-versus-receipt split.",
                    },
                },
            },
        )

        self.assertEqual(brief["analysis_flags"]["tell_kind"], "legal tell")
        self.assertTrue(brief["argument_spine"])
        self.assertTrue(any("power trade" in beat.lower() or "cost lands on" in beat.lower() for beat in brief["argument_spine"]))

    def test_story_brief_argument_spine_ignores_sidebar_excerpt_noise(self) -> None:
        brief = _build_story_brief(
            {
                "query_text": "Trump military spending latest 2026",
                "raw_sources": [
                    {
                        "title": "Trump budget director defends White House plan for massive boost in military spending",
                        "source_name": "AP News",
                        "source_label": "AP News",
                        "source_kind": "reporting",
                        "quality_score": 9.4,
                        "credibility_tier": "high",
                        "age_days": 0,
                        "snippet": "Budget director defended the White House military spending plan.",
                        "evidence_excerpts": [
                            "Then Trump changed the rules A lost icon: The American chestnut and its central place in the eastern forest.",
                            "The budget director defended the White House plan for a massive boost in military spending.",
                        ],
                    },
                    {
                        "title": "Oil prices surge after Trump says U.S. will blockade the Strait of Hormuz",
                        "source_name": "Reuters",
                        "source_label": "Reuters",
                        "source_kind": "reporting",
                        "quality_score": 8.5,
                        "credibility_tier": "high",
                        "age_days": 0,
                        "evidence_excerpts": ["Oil prices surged after markets priced in the geopolitical risk."],
                    },
                ],
                "trend_ledger": [],
            },
            object_type="lead_story",
            analysis_brief={
                "label": "Sitewide",
                "title": "Trump budget director defends White House plan for massive boost in military spending",
                "meta": {
                    "focus_label": "Sitewide",
                    "selected_angle": "Trump budget director defends White House plan for massive boost in military spending",
                    "why_now": "AP News has the budget fight on paper now.",
                    "dialectic": {
                        "thesis": "Trump budget director defends White House plan for massive boost in military spending",
                        "counterforce": "The price tag is already bigger than the spin around it.",
                        "synthesis": "The money tell is doing more work than the rhetoric.",
                        "gold_thread": "Follow the budget tell in 'Trump budget director defends White House plan for massive boost in military spending'.",
                        "writer_north_star": "Open on the budget push, then show who pays.",
                    },
                    "analysis_flags": {
                        "tell_kind": "market tell",
                        "claim_vs_receipt": "AP News is already carrying the cleaner record.",
                        "institutional_stress": "price signals and market plumbing showing the cost",
                        "beneficiary": "the political stunt",
                        "cost_bearer": "consumers and taxpayers",
                        "evidence_strength": "strong live packet",
                    },
                },
            },
        )

        spine_text = " ".join(brief["argument_spine"]).lower()
        self.assertIn("budget director", spine_text)
        self.assertNotIn("american chestnut", spine_text)

    def test_editorial_context_packet_surfaces_analysis_board(self) -> None:
        packet = _build_editorial_context_packet(
            {
                "query_text": "Trump legal collision latest 2026",
                "raw_sources": [
                    {
                        "title": "Judge orders Trump administration to defend the filing in court",
                        "source_name": "Reuters",
                        "source_label": "Reuters",
                        "source_kind": "reporting",
                        "quality_score": 8.8,
                        "credibility_tier": "high",
                        "age_days": 0,
                        "evidence_excerpts": ["The judge ordered the administration to explain the legal basis for the move by Friday."],
                    }
                ],
            },
            {
                "story_mode": "Theme Column",
                "selected_angle": "Judge orders Trump administration to defend the filing in court",
                "why_now": "The filing is now forcing a cleaner answer than the podium line offered.",
                "freshest_evidence": "Judge orders Trump administration to defend the filing in court (Reuters)",
                "focus_label": "Legal Collision",
                "analysis_flags": {
                    "tell_kind": "legal tell",
                    "claim_vs_receipt": "White House is still selling the line while Reuters keeps the cleaner record.",
                    "institutional_stress": "court and filing pressure forcing cleaner language",
                    "beneficiary": "the executive line if delay keeps buying time",
                    "cost_bearer": "courts and public trust",
                    "evidence_strength": "strong live packet with a visible claim-versus-receipt split.",
                },
                "argument_spine": ["Spell out the power trade before the close."],
            },
            {
                "meta": {
                    "source_roles": [{"role": "legal_receipt", "title": "Judge orders Trump administration to defend the filing in court", "outlet": "Reuters"}],
                }
            },
        )

        self.assertIn("Who benefits", packet)
        self.assertIn("Who absorbs the cost", packet)
        self.assertIn("Paragraph job", packet)

    def test_style_assessment_flags_duplicate_sentence_repetition(self) -> None:
        text = (
            "# Trump court filing keeps shrinking under pressure\n\n"
            "The judge ordered the administration to explain the legal basis for the move by Friday.\n\n"
            "The judge ordered the administration to explain the legal basis for the move by Friday.\n\n"
            "White House aides kept selling a broader line in public.\n\n"
            "## Pattern Signals\n- Court pressure is forcing cleaner language.\n"
        )

        report = _assess_style_candidate(
            text,
            lane="editorial",
            title="Trump court filing keeps shrinking under pressure",
            story_brief={"story_form": "theme_update", "body_paragraphs": 3},
        )

        self.assertFalse(report["passes"])
        self.assertTrue(report["hard_fail"])
        self.assertTrue(any("duplicatesentence" in reason.replace("_", "") for reason in report["reasons"]))

    def test_style_assessment_rejects_instructional_live_prompt_echo(self) -> None:
        report = _assess_style_candidate(
            "Write a BAT reading-room post about Trump executive overreach this week. Keep one concrete receipt and one sharp line.",
            lane="live_social",
        )
        self.assertFalse(report["passes"])
        self.assertTrue(report["hard_fail"])
        self.assertIn("instructional-prompt-echo", report["reasons"])

    def test_social_package_can_publish_without_full_thread(self) -> None:
        assessment = _social_package_assessment(
            "Trump filings keep shrinking while the promise keeps growing in public.",
            "Trump filings keep shrinking while the promise keeps growing in public. Reuters still has the cleanest receipt on the administration angle.",
            ["Reuters still has the cleanest receipt on the Trump administration angle."],
        )

        self.assertTrue(assessment["publishable"])
        self.assertFalse(assessment["thread_publishable"])
        self.assertFalse(assessment["has_enough_unique_variants"])

    def test_social_package_only_counts_passing_thread_parts(self) -> None:
        assessment = _social_package_assessment(
            "Trump filings keep shrinking while the promise keeps growing in public.",
            "Trump filings keep shrinking while the promise keeps growing in public. Reuters still has the cleanest receipt on the administration angle.",
            [
                "Reuters still has the cleanest receipt on the Trump administration angle.",
                "Trump court filings keep narrowing while the podium line keeps stretching.",
                "Fresh reporting in the last 24 hours keeps this contradiction live enough to hit hard.",
            ],
        )

        self.assertTrue(assessment["thread_publishable"])
        self.assertEqual(assessment["passing_thread_count"], 2)


class EditorialReworkTests(unittest.IsolatedAsyncioTestCase):
    async def test_publish_ready_skips_rework_blocked_drafts(self) -> None:
        editorial = EditorialObject(
            id=uuid.uuid4(),
            object_type="lead_story",
            status="approved",
            title="Court Filing Tightens the Trump Story",
            body_md=(
                "The Trump administration is still trying to sell a broad claim while the court record narrows it.\n\n"
                "Reuters and AP put the contradiction in the paper trail, which makes the official story harder to launder.\n\n"
                "That is the live institutional stress: power wants the clean headline, and the record keeps leaving marks."
            ),
            summary="",
            primary_source_ids=[],
            meta={
                "style_gate": {"passes": True, "score": 90},
                "publish_recommendation": {"recommended": True},
                "source_mix": {"freshest_age_days": 0},
                "selected_angle": "Trump administration court filing",
                "rework": {"blocked": {"reason": "placeholder_or_prompt_leak"}},
            },
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )

        publishable, _diagnostics = await _editorial_publishable_now(SimpleNamespace(), editorial)

        self.assertFalse(publishable)

    async def test_rework_backlog_blocks_prompt_leak_drafts_before_retry(self) -> None:
        editorial_id = uuid.uuid4()
        editorial = EditorialObject(
            id=editorial_id,
            object_type="theme_take",
            status="draft",
            title="Thinking Process:",
            body_md="Analyze user input before writing the final answer.",
            summary="",
            primary_source_ids=[],
            meta={"style_gate": {"passes": False, "score": 4}, "publish_recommendation": {"recommended": False}},
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )

        class _ScalarRows:
            def all(self):
                return [editorial]

        class _ExecuteRows:
            def scalars(self):
                return _ScalarRows()

        db = SimpleNamespace(execute=AsyncMock(return_value=_ExecuteRows()), commit=AsyncMock())

        with patch("services.editorial_service.record_revision", new=AsyncMock()) as record_revision:
            result = await rework_editorial_backlog(db, limit=1)

        self.assertEqual(result["candidate_count"], 0)
        self.assertEqual(result["reworked_editorial_count"], 0)
        self.assertEqual(result["skipped"][0]["reason"], "placeholder_or_prompt_leak")
        self.assertEqual(editorial.meta["rework"]["blocked"]["reason"], "placeholder_or_prompt_leak")
        self.assertFalse(editorial.meta["publish_recommendation"]["recommended"])
        record_revision.assert_awaited_once()

    async def test_rework_backlog_rejects_stale_drafts_outside_publish_window(self) -> None:
        editorial = EditorialObject(
            id=uuid.uuid4(),
            object_type="theme_take",
            status="draft",
            title="Trump Court Fight Loses Its News Window",
            body_md=(
                "The Trump administration court fight had a live hook when it was written, "
                "but this draft is now stale enough that it should leave the active queue."
            ),
            summary="",
            primary_source_ids=[],
            meta={
                "style_gate": {"passes": False, "score": 42},
                "publish_recommendation": {"recommended": False, "reason": "style_gate_hold"},
                "source_mix": {"freshest_age_days": 0},
            },
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc) - timedelta(hours=settings.backlog_publish_window_hours + 6),
        )

        class _ScalarRows:
            def all(self):
                return [editorial]

        class _ExecuteRows:
            def scalars(self):
                return _ScalarRows()

        db = SimpleNamespace(execute=AsyncMock(return_value=_ExecuteRows()), commit=AsyncMock())

        with patch("services.editorial_service.record_revision", new=AsyncMock()) as record_revision:
            result = await rework_editorial_backlog(db, limit=1)

        self.assertEqual(result["candidate_count"], 0)
        self.assertEqual(result["skipped"][0]["reason"], "stale_queue_window")
        self.assertEqual(editorial.status, "rejected")
        self.assertEqual(editorial.meta["rework"]["blocked"]["reason"], "stale_queue_window")
        record_revision.assert_awaited_once()

    async def test_rework_backlog_rejects_drafts_after_attempt_cap(self) -> None:
        editorial = EditorialObject(
            id=uuid.uuid4(),
            object_type="lead_story",
            status="draft",
            title="Trump Legal Collision Still Needs Editing",
            body_md=(
                "The Trump administration keeps making a broad claim while the court record narrows it. "
                "AP and Reuters keep the contradiction in view, but the draft has not reached the standard."
            ),
            summary="",
            primary_source_ids=[],
            meta={
                "style_gate": {"passes": False, "score": 44},
                "publish_recommendation": {"recommended": False, "reason": "style_gate_hold"},
                "source_mix": {"freshest_age_days": 0},
                "rework": {"attempts": settings.editorial_rework_max_attempts},
            },
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )

        class _ScalarRows:
            def all(self):
                return [editorial]

        class _ExecuteRows:
            def scalars(self):
                return _ScalarRows()

        db = SimpleNamespace(execute=AsyncMock(return_value=_ExecuteRows()), commit=AsyncMock())

        with patch("services.editorial_service.record_revision", new=AsyncMock()) as record_revision:
            result = await rework_editorial_backlog(db, limit=1)

        self.assertEqual(result["candidate_count"], 0)
        self.assertEqual(result["skipped"][0]["reason"], "attempt_cap_reached")
        self.assertEqual(editorial.status, "rejected")
        self.assertEqual(editorial.meta["publish_recommendation"]["reason"], "attempt_cap_reached")
        record_revision.assert_awaited_once()

    async def test_prune_editorial_backlog_retires_old_active_drafts_in_batches(self) -> None:
        stale = EditorialObject(
            id=uuid.uuid4(),
            object_type="theme_take",
            status="draft",
            title="Trump Draft That Missed the Window",
            body_md="The Trump administration draft missed its useful publishing window.",
            summary="",
            primary_source_ids=[],
            meta={"publish_recommendation": {"recommended": False, "reason": "style_gate_hold"}},
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc) - timedelta(hours=settings.backlog_publish_window_hours + 12),
        )
        fresh = EditorialObject(
            id=uuid.uuid4(),
            object_type="theme_take",
            status="draft",
            title="Trump Draft Still Active",
            body_md="The Trump administration draft is still inside the active editing window.",
            summary="",
            primary_source_ids=[],
            meta={"publish_recommendation": {"recommended": False, "reason": "style_gate_hold"}},
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )

        class _ScalarRows:
            def all(self):
                return [stale, fresh]

        class _ExecuteRows:
            def scalars(self):
                return _ScalarRows()

        db = SimpleNamespace(execute=AsyncMock(return_value=_ExecuteRows()), commit=AsyncMock())

        with patch("services.editorial_service.record_revision", new=AsyncMock()):
            result = await prune_editorial_backlog(db, limit=10)

        self.assertEqual(result["rejected_count"], 1)
        self.assertEqual(stale.status, "rejected")
        self.assertEqual(fresh.status, "draft")

    def test_editorial_task_prompt_targets_publishable_length_above_floor(self) -> None:
        story_brief = {
            "story_mode": "Theme Column",
            "story_form": "theme_column",
            "body_paragraphs": 4,
            "selected_angle": "Trump court fight exposes the paperwork gap",
        }

        prompt = _build_editorial_task_prompt("Write the piece.", story_brief, {"query_text": "Trump court fight"})

        self.assertIn("Minimum body length before Pattern Signals: 620 words", prompt)
        self.assertIn("Aim for 760-860 body words", prompt)

    async def test_rework_editorial_object_marks_publish_ready_draft_as_approved(self) -> None:
        editorial_id = uuid.uuid4()
        bundle = {
            "query_text": "Trump administration legal contradiction",
            "raw_sources": [
                {
                    "id": str(uuid.uuid4()),
                    "title": "Judge forces Trump administration to defend order in court",
                    "source_name": "Reuters",
                    "source_label": "Reuters",
                    "source_kind": "reporting",
                    "quality_score": 4.8,
                    "credibility_tier": "high",
                    "age_days": 0,
                    "snippet": "The judge ordered the administration to explain the legal basis for the move by Friday.",
                },
                {
                    "id": str(uuid.uuid4()),
                    "title": "White House says Trump order still matches the policy goal",
                    "source_name": "AP",
                    "source_label": "AP",
                    "source_kind": "reporting",
                    "quality_score": 4.5,
                    "credibility_tier": "high",
                    "age_days": 1,
                    "snippet": "Officials argued the order still fits the president's broader message despite the court challenge.",
                },
                {
                    "id": str(uuid.uuid4()),
                    "title": "Republicans warn the court fight could widen the political damage",
                    "source_name": "NBC News",
                    "source_label": "NBC News",
                    "source_kind": "reporting",
                    "quality_score": 4.7,
                    "credibility_tier": "high",
                    "age_days": 1,
                    "snippet": "Republicans privately warned the White House that the court fight was exposing a weaker legal theory than the public line suggested.",
                },
            ],
            "trend_ledger": [{"title": "Courts keep checking executive overreach"}],
        }
        brief = _build_story_brief(bundle, object_type="lead_story", directive="Lead with the contradiction.")
        improved_body = (
            "# Court Filing Tightens the Trump Story\n\n"
            "The court record is now doing a cleaner job than the podium line.\n\n"
            "The Trump administration asked the judge for more room after telling cameras the order was already on solid ground. Reuters kept the legal record cleaner than the White House performance, which is why the contradiction is no longer just a tone problem.\n\n"
            "AP kept the institutional stress visible because aides were still selling the order as coherent while the court fight exposed a narrower theory. NBC's reporting made the same political cost visible from the Hill side.\n\n"
            "The beneficiary is the spin room if delay buys time, and the cost lands on courts, agencies, and readers who are being asked to ignore the paperwork in front of them. That is why this lane is still live.\n\n"
            "## Pattern Signals\n\n"
            "- Reuters and AP are pulling the same contradiction into view.\n"
            "- Courts keep forcing a cleaner answer than the podium line offers.\n"
        )
        style_report = {
            "passes": True,
            "score": 88,
            "threshold": 68,
            "hard_fail": False,
            "reasons": [],
            "body_word_count": 560,
            "body_paragraph_count": 3,
            "grounding_report": {"passes": True, "unsupported_specifics": []},
        }
        editorial = EditorialObject(
            id=editorial_id,
            object_type="lead_story",
            status="draft",
            title="Court Filing Tightens the Trump Story",
            dek="The court record is now doing a cleaner job than the podium line.",
            body_md="Old draft body",
            summary="Old draft body",
            primary_source_ids=[],
            meta={
                "theme_slug": None,
                "selected_angle": brief["selected_angle"],
                "story_brief": brief,
                "analysis_brief": {"title": brief["selected_angle"], "summary": brief["why_now"]},
                "retrieval_bundle": bundle,
                "recent_coverage": [],
                "repetition_guard": brief["repetition_guard"],
                "source_mix": brief["source_mix"],
                "publish_recommendation": {"recommended": False, "reason": "style_gate_hold"},
                "style_gate": {"passes": False, "score": 40, "reasons": ["below_story_form_floor:80/520"]},
            },
        )
        db = SimpleNamespace(commit=AsyncMock(), refresh=AsyncMock())

        with (
            patch("services.editorial_service.get_runtime_controls", new=AsyncMock(return_value={"voice_blueprint": ""})),
            patch("services.editorial_service._voice_context_block", new=AsyncMock(return_value=("context", []))),
            patch(
                "services.editorial_service._run_editorial_generation_pass",
                new=AsyncMock(
                    return_value={
                        "body": improved_body,
                        "style_report": style_report,
                        "generation_path": "model_revision",
                        "reroll_count": 2,
                        "grounded_sources": 3,
                        "requires_research": False,
                    }
                ),
            ),
            patch("services.editorial_service.record_revision", new=AsyncMock()),
        ):
            result = await rework_editorial_object(db, editorial)

        self.assertTrue(result["ok"])
        self.assertEqual(editorial.status, "approved")
        self.assertTrue(result["publish_recommendation"]["recommended"])
        self.assertEqual(editorial.meta["rework"]["attempts"], 1)
        self.assertTrue(editorial.meta["rework"]["ready_for_publish"])


if __name__ == "__main__":
    unittest.main()
