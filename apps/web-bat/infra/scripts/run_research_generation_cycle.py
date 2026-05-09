#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from dataclasses import dataclass
from typing import Any
from urllib import error, parse, request


DEFAULT_DIRECTIVE = "\n".join(
    [
        "Trump executive overreach latest 2026",
        "Trump legal collision latest 2026",
        "Trump patronage and donor payoff latest 2026",
        "Trump corruption beneficiary latest 2026",
        "Trump family dynastic branding latest 2026",
        "Trump culture war cosmetics latest 2026",
        "Trump loyalty theater latest 2026",
        "Trump White House contradiction latest 2026",
        "cabinet official contradicts White House 2026",
        "federal judge blocks Trump administration action 2026",
        "Republican backlash Trump court fight 2026",
        "conservative discomfort Trump latest 2026",
        "Trump grift branding conflict latest 2026",
    ]
)

DEFAULT_ANALYSIS_DIRECTIVE = "\n".join(
    [
        "Track the contradiction between message and consequence.",
        "Name the institutional stress point: court, agency, donor, military, Congress, or market.",
        "Prefer sources with documents, filings, transcripts, sanctions, orders, votes, or direct quotes.",
        "Surface who benefits, who absorbs the risk, and what makes this story distinct from yesterday's outrage cycle.",
        "Look for right-coded criticism, bureaucratic resistance, legal choke points, and narrative slippage.",
    ]
)

DEFAULT_VOICE_BLUEPRINT = (
    "Personal-site political voice. It should feel like a real woman lives here: polished, warm, lacquered, and cutting. "
    "Write for a homepage that is also a reading room, archive, and notebook. Tight by time and tight by Trump. "
    "Current first, linked receipts, styled on purpose, never filler, never generic, never a weather report. "
    "The voice should be intellectually sharp, socially fluent, funny in a dry expensive way, and able to pivot from analysis to one clean knife twist. "
    "Every piece should feel specific enough to anchor a personal front page and quotable enough to travel in a screenshot."
)

DEFAULT_LIVE_VIBE = (
    "Screenshot-ready personal-site dispatch voice: sharp, socially fluent, glam without fluff, specific, anti-filler, "
    "and willing to sting once the facts have earned it."
)

SOCIAL_PROMPT_TEMPLATES: list[tuple[str, str]] = [
    (
        "dispatch",
        "Write a BAT personal-site dispatch about {focus}. One concrete political fact, one memorable line, no filler.",
    ),
    (
        "reading-room",
        "Give me a BAT reading-room post about {focus}. Keep it current, specific, and polished enough to live beside a curated link stack.",
    ),
    (
        "group-chat",
        "Write a BAT group-chat-ready line about {focus}. Make it sharp, factual, anti-generic, and easy to screenshot.",
    ),
    (
        "notebook",
        "Write a BAT notebook post about {focus}. It should sound like a real woman curating a live archive and refusing to lose the thread.",
    ),
]


@dataclass
class ApiClient:
    base_url: str
    timeout_seconds: int = 900

    def _url(self, path: str, query: dict[str, Any] | None = None) -> str:
        path = path if path.startswith("/") else f"/{path}"
        url = f"{self.base_url.rstrip('/')}{path}"
        if query:
            encoded = parse.urlencode({k: v for k, v in query.items() if v is not None}, doseq=True)
            if encoded:
                url = f"{url}?{encoded}"
        return url

    def get(self, path: str, query: dict[str, Any] | None = None) -> Any:
        req = request.Request(self._url(path, query=query), method="GET")
        return self._run(req)

    def post(self, path: str, payload: dict[str, Any] | None = None, query: dict[str, Any] | None = None) -> Any:
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        req = request.Request(self._url(path, query=query), data=body, method="POST")
        if body is not None:
            req.add_header("Content-Type", "application/json")
        return self._run(req)

    def _run(self, req: request.Request) -> Any:
        try:
            with request.urlopen(req, timeout=self.timeout_seconds) as resp:  # noqa: S310
                raw = resp.read().decode("utf-8")
                return json.loads(raw) if raw else {}
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"HTTP {exc.code} for {req.full_url}: {detail}") from exc
        except error.URLError as exc:
            raise RuntimeError(f"Network error for {req.full_url}: {exc}") from exc


def _clip(value: str, max_chars: int = 220) -> str:
    text = " ".join((value or "").split())
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 3] + "..."


def _clean(value: Any) -> str:
    text = " ".join(str(value or "").split())
    return text.strip()


def _coalesce(*values: Any) -> str:
    for value in values:
        cleaned = _clean(value)
        if cleaned:
            return cleaned
    return ""


def _is_placeholder_title(value: Any) -> bool:
    text = _clean(value).lower()
    return bool(text and re.match(r"^(draft pending source refresh|no lead yet|untitled.*)$", text))


def _print_controls(controls: dict[str, Any]) -> None:
    print(
        "controls="
        f"direct_publish={controls.get('direct_publish')} "
        f"x_research_enabled={controls.get('x_research_enabled')} "
        f"x_live_posting={controls.get('x_live_posting')}"
    )


def _delta_counts(before: dict[str, Any], after: dict[str, Any]) -> str:
    keys = ["sources", "themes", "editorial_drafts", "homepage_drafts", "social_drafts", "pipeline_cycles"]
    parts = []
    for key in keys:
        prior = int(before.get(key, 0) or 0)
        current = int(after.get(key, 0) or 0)
        parts.append(f"{key}={current} ({current - prior:+d})")
    return " ".join(parts)


def _writer_generated_theme_count(cycle_result: dict[str, Any]) -> int:
    writer = (cycle_result.get("stage_results") or {}).get("writer", {})
    return len(writer.get("theme_take_ids") or [])


def _print_cycle_summary(index: int, cycle_result: dict[str, Any]) -> None:
    stage_results = cycle_result.get("stage_results") or {}
    researcher = stage_results.get("researcher", {})
    writer = stage_results.get("writer", {})
    queen = stage_results.get("queen", {})
    top_opportunity = ((researcher.get("opportunity_board") or [{}]) + [{}])[0]
    lead_card = ((writer.get("story_slate") or [{}]) + [{}])[0]
    top_link = ((queen.get("curated_links") or [{}]) + [{}])[0]

    print(
        f"cycle_{index}="
        f"id={cycle_result.get('cycle_id')} "
        f"duration={cycle_result.get('duration_seconds')}s "
        f"queries={researcher.get('query_count', 0)} "
        f"fresh_sources={(researcher.get('source_quality_mix') or {}).get('fresh_sources', 0)} "
        f"high_quality={(researcher.get('source_quality_mix') or {}).get('high_quality_kept', 0)}"
    )
    print(
        f"cycle_{index}_writer="
        f"lead_status={writer.get('lead_story_status')} "
        f"theme_takes={len(writer.get('theme_take_ids') or [])} "
        f"homepage={writer.get('homepage_status')} "
        f"lead_angle={_clip(_coalesce(lead_card.get('selected_angle'), lead_card.get('title')), 120)}"
    )
    if top_opportunity:
        print(f"cycle_{index}_opportunity={_clip(_coalesce(top_opportunity.get('angle'), top_opportunity.get('theme')), 140)}")
    if top_link:
        print(f"cycle_{index}_top_link={_clip(_coalesce(top_link.get('title'), top_link.get('url')), 140)}")


def _current_controls(client: ApiClient) -> dict[str, Any]:
    settings = client.get("/admin/system-settings")
    return settings.get("controls", {})


def _recent_state(client: ApiClient) -> dict[str, Any]:
    return {
        "summary": client.get("/admin/summary"),
        "pipeline": client.get("/admin/pipeline"),
        "themes": client.get("/themes"),
        "editorials": client.get("/editorial/objects", query={"limit": 12}),
        "social": client.get("/social/posts", query={"limit": 12}),
        "homepages": client.get("/homepage/snapshots", query={"limit": 5}),
    }


def _focus_candidates(state: dict[str, Any]) -> list[str]:
    pipeline = state.get("pipeline") or {}
    latest_cycle = pipeline.get("latest_cycle") or {}
    stage_results = latest_cycle.get("result") or latest_cycle.get("stage_results") or {}
    researcher = stage_results.get("researcher") or {}
    writer = stage_results.get("writer") or {}

    candidates: list[str] = []
    for item in writer.get("story_slate") or []:
        title = _clean(item.get("title"))
        if title and not _is_placeholder_title(title):
            candidates.append(title)
        candidates.append(_coalesce(item.get("selected_angle"), item.get("why_now")))

    for item in researcher.get("opportunity_board") or []:
        candidates.append(_coalesce(item.get("angle"), item.get("theme"), item.get("query_hint")))

    for theme in state.get("themes") or []:
        candidates.append(_coalesce(theme.get("name"), theme.get("slug")))

    for editorial in state.get("editorials") or []:
        title = _clean(editorial.get("title"))
        if title and not _is_placeholder_title(title):
            candidates.append(title)
        candidates.append(_coalesce((editorial.get("metadata") or {}).get("why_now"), editorial.get("summary")))

    deduped: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        cleaned = _clip(_clean(candidate), 180)
        if not cleaned:
            continue
        normalized = cleaned.lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(cleaned)
    return deduped


def _social_prompt_bundle(state: dict[str, Any], count: int) -> list[tuple[str, str]]:
    focuses = _focus_candidates(state)
    if not focuses:
        focuses = ["the latest Trump-world contradiction still active on BAT tonight"]

    prompts: list[tuple[str, str]] = []
    for index in range(count):
        intent, template = SOCIAL_PROMPT_TEMPLATES[index % len(SOCIAL_PROMPT_TEMPLATES)]
        focus = focuses[index % len(focuses)]
        prompts.append((intent, template.format(focus=focus)))
    return prompts


def _theme_pool(client: ApiClient) -> list[str]:
    themes = client.get("/themes")
    return [str(theme.get("slug")) for theme in themes if theme.get("slug")]


def _generate_extra_theme_takes(
    client: ApiClient,
    *,
    target_count: int,
    controls: dict[str, Any],
    cycle_result: dict[str, Any],
    seen_theme_slugs: set[str],
) -> list[dict[str, Any]]:
    built_in_count = _writer_generated_theme_count(cycle_result)
    needed = max(0, target_count - built_in_count)
    if needed <= 0:
        return []

    generated: list[dict[str, Any]] = []
    publish_now = bool(controls.get("direct_publish"))
    endpoint = "/editorial/generate-and-publish" if publish_now else "/editorial/generate"

    for slug in _theme_pool(client):
        if slug in seen_theme_slugs:
            continue
        payload = {
            "object_type": "theme_take",
            "theme_slug": slug,
            "publish_now": publish_now,
            "immediate_social": True,
        }
        response = client.post(endpoint, payload=payload)
        response["theme_slug"] = slug
        generated.append(response)
        seen_theme_slugs.add(slug)
        if len(generated) >= needed:
            break

    if generated:
        homepage_endpoint = "/homepage/generate-and-publish" if publish_now else "/homepage/generate"
        homepage_resp = client.post(homepage_endpoint)
        print(f"homepage_refresh=id={homepage_resp.get('id')} status={homepage_resp.get('status')}")

    return generated


def _print_extra_theme_takes(items: list[dict[str, Any]]) -> None:
    for item in items:
        print(
            "extra_theme_take="
            f"theme={item.get('theme_slug')} "
            f"id={item.get('id')} "
            f"status={item.get('status')} "
            f"social_generated={item.get('social_generated', 0)}"
        )


def _publish_ready_backlog(client: ApiClient, limit: int) -> dict[str, Any]:
    return client.post(
        "/admin/publish-ready",
        query={
            "limit": max(6, limit),
            "publish_social": True,
        },
    )


def _run_social_burst(client: ApiClient, count: int) -> list[dict[str, Any]]:
    if count <= 0:
        return []
    state = _recent_state(client)
    prompts = _social_prompt_bundle(state, count)
    responses: list[dict[str, Any]] = []

    for index, (intent, prompt) in enumerate(prompts, start=1):
        response = client.post(
            "/social/live",
            payload={
                "prompt": prompt,
                "intent": intent,
                "publish_now": True,
                "platform": "x",
            },
        )
        responses.append(response)
        print(
            f"social_burst_{index}="
            f"intent={intent} "
            f"id={response.get('id')} "
            f"status={response.get('status')} "
            f"body={_clip(response.get('body') or '', 220)}"
        )

    return responses


def main() -> int:
    parser = argparse.ArgumentParser(description="Run one or more BAT content-creation bursts against the live pipeline.")
    parser.add_argument("--base-url", default="http://localhost:8017/api/v1")
    parser.add_argument("--timeout-seconds", type=int, default=900, help="HTTP timeout for long-running pipeline calls.")
    parser.add_argument("--cycles", type=int, default=1, help="How many full pipeline cycles to run.")
    parser.add_argument(
        "--theme-takes",
        type=int,
        default=6,
        help="Target total theme takes per cycle, including the writer stage's built-in output.",
    )
    parser.add_argument(
        "--social-burst",
        type=int,
        default=6,
        help="How many live social posts to generate after the pipeline burst.",
    )
    parser.add_argument("--configure", action="store_true", help="Apply refreshed runtime controls before running.")
    parser.add_argument("--include-x", action="store_true", help="Enable X ingestion for this run.")
    parser.add_argument(
        "--publish-ready",
        action="store_true",
        help="Publish any recent ready backlog after the cycle and refresh the homepage.",
    )
    parser.add_argument("--show-full", action="store_true", help="Print full body text for the most recent editorial object after running.")
    parser.add_argument(
        "--query-limit",
        type=int,
        default=None,
        help="Deprecated. The role pipeline now decides ingestion depth automatically; this flag is ignored.",
    )
    publish_group = parser.add_mutually_exclusive_group()
    publish_group.add_argument("--direct-publish", dest="direct_publish", action="store_true", help="Turn direct publish on while configuring.")
    publish_group.add_argument("--no-direct-publish", dest="direct_publish", action="store_false", help="Turn direct publish off while configuring.")
    parser.set_defaults(direct_publish=None)
    args = parser.parse_args()

    client = ApiClient(base_url=args.base_url, timeout_seconds=args.timeout_seconds)

    print("== Content Burst Run ==")
    ready = client.get("/health/ready")
    print(f"readiness_status={ready.get('status')}")

    if args.query_limit is not None:
        print(f"note=query_limit_deprecated value={args.query_limit} pipeline_controls_ingestion_depth=true")

    if args.configure:
        current_controls = _current_controls(client)
        config_payload = {
            "direct_publish": current_controls.get("direct_publish") if args.direct_publish is None else bool(args.direct_publish),
            "x_live_posting": current_controls.get("x_live_posting"),
            "x_research_enabled": bool(args.include_x),
            "research_directive": DEFAULT_DIRECTIVE,
            "analysis_directive": DEFAULT_ANALYSIS_DIRECTIVE,
            "voice_blueprint": DEFAULT_VOICE_BLUEPRINT,
            "live_vibe": DEFAULT_LIVE_VIBE,
        }
        settings_resp = client.post("/admin/system-settings", payload=config_payload)
        controls = settings_resp.get("controls", {})
        print("configured_runtime=true")
        _print_controls(controls)
    else:
        controls = _current_controls(client)
        _print_controls(controls)

    summary_before = client.get("/admin/summary")
    started = time.perf_counter()
    cycle_results: list[dict[str, Any]] = []
    generated_ids: list[str] = []
    seen_theme_slugs: set[str] = set()

    for cycle_index in range(1, max(1, args.cycles) + 1):
        cycle_result = client.post("/admin/pipeline/run-now")
        cycle_results.append(cycle_result)
        _print_cycle_summary(cycle_index, cycle_result)

        stage_results = cycle_result.get("stage_results") or {}
        writer = stage_results.get("writer") or {}
        if writer.get("lead_story_id"):
            generated_ids.append(str(writer.get("lead_story_id")))
        if writer.get("homepage_snapshot_id"):
            generated_ids.append(str(writer.get("homepage_snapshot_id")))
        for item in writer.get("theme_take_ids") or []:
            slug = _clean(item.get("theme"))
            if slug:
                seen_theme_slugs.add(slug)
            if item.get("id"):
                generated_ids.append(str(item.get("id")))

        extra_theme_takes = _generate_extra_theme_takes(
            client,
            target_count=args.theme_takes,
            controls=controls,
            cycle_result=cycle_result,
            seen_theme_slugs=seen_theme_slugs,
        )
        _print_extra_theme_takes(extra_theme_takes)
        for item in extra_theme_takes:
            if item.get("id"):
                generated_ids.append(str(item.get("id")))
            if item.get("theme_slug"):
                seen_theme_slugs.add(str(item.get("theme_slug")))

    social_responses = _run_social_burst(client, args.social_burst)
    for response in social_responses:
        if response.get("id"):
            generated_ids.append(str(response.get("id")))

    if args.publish_ready:
        publish_ready_resp = _publish_ready_backlog(client, max(args.theme_takes + 2, 12))
        print(
            "publish_ready="
            f"editorials={publish_ready_resp.get('published_editorial_count')} "
            f"social={publish_ready_resp.get('published_social_count')} "
            f"homepage_status={publish_ready_resp.get('homepage_status')} "
            f"dispatch_mode={publish_ready_resp.get('social_dispatch_mode')}"
        )
        generated_ids.extend(str(item) for item in publish_ready_resp.get("published_editorial_ids") or [])
        generated_ids.extend(str(item) for item in publish_ready_resp.get("published_social_ids") or [])
        if publish_ready_resp.get("homepage_snapshot_id"):
            generated_ids.append(str(publish_ready_resp.get("homepage_snapshot_id")))

    elapsed = time.perf_counter() - started
    summary_after = client.get("/admin/summary")
    diagnostics = client.get("/health/diagnostics")
    state = _recent_state(client)

    print(f"elapsed_seconds={elapsed:.1f}")
    print(f"counts={_delta_counts(summary_before, summary_after)}")
    print(
        "diagnostics="
        f"status={diagnostics.get('status')} "
        f"failed_jobs={len(diagnostics.get('failed_jobs', []))} "
        f"recent_jobs={len(diagnostics.get('recent_jobs', []))}"
    )

    editorials = state.get("editorials") or []
    if editorials:
        first = editorials[0]
        print(
            "example_editorial="
            f"id={first.get('id')} "
            f"type={first.get('object_type')} "
            f"status={first.get('status')} "
            f"title={_clip(first.get('title') or '')}"
        )
        try:
            full = client.get(f"/editorial/objects/{first.get('id')}")
            body = full.get("body_md") or ""
            if args.show_full:
                print("\n--- editorial body ---\n")
                print(body)
                print("\n--- end editorial body ---\n")
            else:
                print(f"editorial_snippet={_clip(body, 320)}")
        except Exception as exc:  # noqa: BLE001
            print(f"editorial_body_fetch_error={exc}")

    social = state.get("social") or []
    if social:
        first_post = social[0]
        print(
            "example_social="
            f"id={first_post.get('id')} "
            f"status={first_post.get('status')} "
            f"body={_clip(first_post.get('body') or '', 260)}"
        )

    homepages = state.get("homepages") or []
    if homepages:
        latest_home = homepages[0]
        lead = (latest_home.get("layout_json") or {}).get("lead")
        if isinstance(lead, dict):
            print(
                "example_homepage="
                f"id={latest_home.get('id')} "
                f"status={latest_home.get('status')} "
                f"lead={_clip(_coalesce(lead.get('title'), lead.get('slug')), 180)}"
            )

    pipeline = state.get("pipeline") or {}
    latest_cycle = pipeline.get("latest_cycle") or {}
    print(
        "latest_cycle="
        f"id={latest_cycle.get('cycle_id')} "
        f"status={latest_cycle.get('status')} "
        f"started_at={latest_cycle.get('started_at')} "
        f"completed_at={latest_cycle.get('completed_at')}"
    )
    print(f"generated_ids={','.join(generated_ids)}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as exc:
        print(f"error={exc}", file=sys.stderr)
        raise SystemExit(1)
