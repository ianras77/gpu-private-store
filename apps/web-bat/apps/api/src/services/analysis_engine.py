from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from collections import Counter
from datetime import datetime
import re
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db import run_with_new_session
from models import AnalysisBrief, EditorialObject, Theme
from services.retrieval_service import build_retrieval_bundle
from services.structured_logging import get_logger, log_event
from utils import slugify_loose

logger = get_logger("bat.analysis")
ANALYSIS_BRIEFS_TABLE_SQL = """
create table if not exists analysis_briefs (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null,
  scope_key text not null,
  status text not null default 'active',
  label text,
  title text,
  summary text,
  confidence numeric default 0,
  source_count int default 0,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(scope_type, scope_key)
)
"""
ANALYSIS_BRIEFS_INDEX_SQL = """
create index if not exists idx_analysis_briefs_scope
on analysis_briefs (scope_type, updated_at desc)
"""
_analysis_schema_checked = False

def _analysis_supports_isolated_sessions(db: AsyncSession) -> bool:
    return isinstance(db, AsyncSession)


async def _run_analysis_session(
    db: AsyncSession,
    worker: Callable[[AsyncSession], Awaitable[Any]],
    *,
    isolated: bool = True,
) -> Any:
    if isolated and _analysis_supports_isolated_sessions(db):
        return await run_with_new_session(worker)
    return await worker(db)


async def _gather_limited(
    items: list[Any],
    worker: Callable[[Any], Awaitable[Any]],
    *,
    limit: int,
    return_exceptions: bool = False,
) -> list[Any]:
    if not items:
        return []
    semaphore = asyncio.Semaphore(max(1, int(limit)))

    async def _run(item: Any) -> Any:
        async with semaphore:
            return await worker(item)

    return await asyncio.gather(*[_run(item) for item in items], return_exceptions=return_exceptions)


LEGAL_ROLE_MARKERS = (
    "court",
    "judge",
    "lawsuit",
    "filing",
    "order",
    "injunction",
    "appeal",
    "ruling",
)
OFFICIAL_LINE_MARKERS = (
    "white house",
    "administration",
    "spokesperson",
    "press secretary",
    "statement",
    "briefing",
    "official",
)
FALLOUT_MARKERS = (
    "backlash",
    "price",
    "oil",
    "market",
    "allies",
    "congress",
    "republican",
    "gop",
    "voters",
)
FOREIGN_POLICY_MARKERS = (
    "iran",
    "middle east",
    "strike",
    "missile",
    "war powers",
    "troops",
    "ceasefire",
    "sanctions",
    "oil",
    "hormuz",
)
SPIN_MARKERS = (
    "messaging",
    "spin",
    "clarified",
    "walked back",
    "talking point",
)
LOW_SIGNAL_TITLE_MARKERS = (
    "live updates",
    "live update",
    "live blog",
    "live coverage",
    "watch live",
    "breaking live",
    "minute-by-minute",
    "top stories",
    "commentary",
)
ANALYSIS_QUERY_STOPWORDS = {
    "about",
    "amid",
    "analysis",
    "donald",
    "from",
    "latest",
    "live",
    "news",
    "today",
    "trump",
    "update",
    "updates",
    "white",
    "house",
}
THEME_QUERY_HINTS = {
    "executive-overreach": "court injunction executive order congress",
    "legal-collision": "judge court filing injunction",
    "culture-war-cosmetics": "npr pbs media funding school",
    "foreign-policy-escalation": "iran ceasefire sanctions blockade",
    "military-brinkmanship": "troops missile strike blockade",
    "allied-anxiety": "allies nato gulf partners diplomacy",
    "energy-shock-politics": "oil prices hormuz shipping inflation",
    "family-dynastic-branding": "family brand business deal licensing",
}
DEFAULT_DIALECTIC_QUERY_SUFFIXES = {
    "counterforce": "official line contradiction filing briefing internal split",
    "consequence": "backlash prices allies congress donor fallout",
}
THEME_DIALECTIC_QUERY_SUFFIXES: dict[str, dict[str, str]] = {
    "executive-overreach": {
        "counterforce": "court injunction filing agency resistance",
        "consequence": "congress implementation backlash budget cost",
    },
    "legal-collision": {
        "counterforce": "court filing injunction appellate friction",
        "consequence": "agency exposure backlash legal cost",
    },
    "culture-war-cosmetics": {
        "counterforce": "public media court funding school backlash",
        "consequence": "voter fatigue donor anxiety local cost",
    },
    "foreign-policy-escalation": {
        "counterforce": "briefing contradiction ceasefire war powers",
        "consequence": "oil prices allies congress backlash",
    },
    "military-brinkmanship": {
        "counterforce": "troops strike war powers briefing contradiction",
        "consequence": "allies oil prices backlash escalation cost",
    },
    "allied-anxiety": {
        "counterforce": "allies diplomacy ceasefire official line contradiction",
        "consequence": "partner mistrust market fallout congressional pressure",
    },
    "energy-shock-politics": {
        "counterforce": "shipping blockade briefing contradiction",
        "consequence": "oil prices insurance inflation backlash",
    },
    "family-dynastic-branding": {
        "counterforce": "ethics disclosure licensing conflict",
        "consequence": "business leverage donor backlash future precedent",
    },
}
THREAD_KIND_MARKERS = {
    "legal": ("court", "judge", "filing", "injunction", "appeal", "ruling", "lawsuit"),
    "bureaucratic": ("agency", "department", "official", "memo", "staff", "procurement", "implementation"),
    "market": ("oil", "price", "prices", "market", "shipping", "insurance", "inflation", "business", "donor"),
    "allied": ("ally", "allies", "nato", "partner", "partners", "diplomacy", "ceasefire", "gulf"),
    "vanity": ("family", "brand", "licensing", "deal", "image", "luxury", "hotel", "golf"),
    "war_power": ("troops", "missile", "strike", "war powers", "pentagon", "blockade", "retaliation"),
}
THREAD_KIND_LABELS = {
    "legal": "legal tell",
    "bureaucratic": "bureaucratic tell",
    "market": "market tell",
    "allied": "allied tell",
    "vanity": "vanity tell",
    "war_power": "war-power tell",
}
THREAD_POWER_FLAGS = {
    "legal": {
        "institutional_stress": "court and filing pressure forcing the administration to say on paper what it would rather blur on camera",
        "beneficiary": "the executive line if delay and procedural fog keep buying time",
        "cost_bearer": "courts, agencies, and public trust left cleaning up the mess",
    },
    "bureaucratic": {
        "institutional_stress": "agency machinery exposing the gap between slogan and implementation",
        "beneficiary": "centralized executive control and the loyalist chain of command",
        "cost_bearer": "career staff, administrative competence, and the public stuck waiting for the policy to function",
    },
    "market": {
        "institutional_stress": "price signals and market plumbing showing the cost before the spin room can explain it away",
        "beneficiary": "the political stunt and the players selling it as strength",
        "cost_bearer": "consumers, shippers, insurers, allies, and anyone left holding the higher bill",
    },
    "allied": {
        "institutional_stress": "allies and diplomats being forced to translate a moving White House line into something survivable",
        "beneficiary": "the domestic performance value of looking tough at home",
        "cost_bearer": "allied trust, diplomatic leverage, and the cleanup crews handling the fallout",
    },
    "vanity": {
        "institutional_stress": "ethics guardrails straining under brand management and status performance",
        "beneficiary": "the family image or vanity project riding inside the policy line",
        "cost_bearer": "institutional credibility and everyone expected to pretend the performance is normal",
    },
    "war_power": {
        "institutional_stress": "war powers and allied confidence being stretched by an act-first, explain-later posture",
        "beneficiary": "the executive impulse to escalate first and clean up the politics later",
        "cost_bearer": "Congressional authority, allied trust, troops, markets, and households paying the fallout",
    },
    "default": {
        "institutional_stress": "the institution forced to reconcile the press line with the paper trail",
        "beneficiary": "the people who gain from keeping the line blurry a little longer",
        "cost_bearer": "the public and the institutions that have to absorb the contradiction once the cameras leave",
    },
}
THEME_ALIGNMENT_REQUIRED_GROUPS: dict[str, tuple[tuple[str, ...], ...]] = {
    "executive-overreach": (
        ("trump", "administration", "white house", "president", "executive", "agency"),
        ("court", "judge", "injunction", "order", "executive order", "funding freeze", "emergency"),
    ),
    "legal-collision": (
        ("trump", "administration", "white house", "president", "executive"),
        ("court", "judge", "filing", "injunction", "appeal", "lawsuit", "ruling"),
    ),
    "family-dynastic-branding": (
        ("family", "trump family", "dynastic", "ivanka", "eric", "donald trump jr", "don jr", "jared kushner", "trump organization"),
        ("brand", "branding", "licensing", "license", "business", "hotel", "golf", "crypto", "ethics"),
    ),
}
FOREIGN_PRESSURE_THEME_SLUGS = {
    "allied-anxiety",
    "energy-shock-politics",
    "foreign-policy-escalation",
    "military-brinkmanship",
}
INSTRUCTIONAL_QUERY_PREFIX_RE = re.compile(
    r"^(?:write|name|show|find|follow|track|keep|turn|look|pull|give|tell|make|lead|prefer|surface|translate|use|open|sound|let)\b",
    flags=re.IGNORECASE,
)
INSTRUCTIONAL_QUERY_PHRASES = (
    "institutional stress point",
    "lead with",
    "keep it",
    "make it",
    "with receipts",
    "find gold",
    "story form",
    "thread worth",
    "prefer sources with documents",
    "documents, filings, transcripts",
    "direct quotes",
    "who benefits",
    "absorbs the risk",
    "what makes this story distinct",
    "yesterday's outrage cycle",
)
THEME_TONE_PROFILES: dict[str, dict[str, str]] = {
    "legal-collision": {
        "primary": "silk-scalpel",
        "long_form": "precise, prosecutorial, and cool enough to let the receipts do the cutting",
        "short_form": "icy, clipped, and confident without sounding performative",
    },
    "executive-overreach": {
        "primary": "boardroom-ice",
        "long_form": "controlled, skeptical, and sharply literate about power",
        "short_form": "clean and a little vicious, but only after the fact pattern is clear",
    },
    "foreign-policy-escalation": {
        "primary": "steel-nerve",
        "long_form": "brisk, unsentimental, and alert to consequence rather than theater",
        "short_form": "quick, sharp, and steady under pressure",
    },
    "military-brinkmanship": {
        "primary": "steel-nerve",
        "long_form": "direct, tense, and unromantic about power",
        "short_form": "nervy and precise, with no faux drama",
    },
    "war-room-narrative-spin": {
        "primary": "lacquered-side-eye",
        "long_form": "wry, suspicious of spin, and polished enough to make the gap look obvious",
        "short_form": "catty in a disciplined way, with the spin room squarely in view",
    },
    "elite-image-management": {
        "primary": "glossy-side-eye",
        "long_form": "stylish, amused, and sharply attentive to vanity and brand management",
        "short_form": "pithy, glamorous, and a little wicked",
    },
    "culture-war-cosmetics": {
        "primary": "dry-manicure",
        "long_form": "dry, unimpressed, and clear about the underlying power play",
        "short_form": "snappy and dismissive without going shrill",
    },
}
ROLE_TONE_FIT = {
    "official_line": "use as the claim to puncture",
    "legal_receipt": "use with clipped precision",
    "fallout_signal": "use to widen the consequence",
    "foreign_pressure": "use to raise stakes without melodrama",
    "spin_cycle": "use to expose the costume change",
    "core_receipt": "use as the clean factual spine",
    "context": "use sparingly to steady the lane",
}
STORY_MODE_LABELS = {
    "lead_analysis": "Lead Analysis",
    "lead_update": "Lead Update",
    "theme_column": "Theme Column",
    "theme_update": "Signal Update",
    "notebook_entry": "Notebook Entry",
}


async def ensure_analysis_schema(db: AsyncSession) -> None:
    global _analysis_schema_checked
    if _analysis_schema_checked:
        return
    await db.execute(text(ANALYSIS_BRIEFS_TABLE_SQL))
    await db.execute(text(ANALYSIS_BRIEFS_INDEX_SQL))
    await db.commit()
    _analysis_schema_checked = True


async def count_analysis_briefs(db: AsyncSession) -> int:
    await ensure_analysis_schema(db)
    return int((await db.scalar(select(func.count()).select_from(AnalysisBrief))) or 0)


def _clean_line(value: object) -> str:
    cleaned = re.sub(r"\s+", " ", str(value or "").replace("\n", " ")).strip()
    return cleaned.strip("\"'`* ")


def _limit_text(value: object, limit: int) -> str:
    cleaned = _clean_line(value)
    if len(cleaned) <= limit:
        return cleaned
    clipped = cleaned[: max(0, limit - 3)].rstrip()
    if " " in clipped:
        clipped = clipped.rsplit(" ", 1)[0]
    clipped = clipped.rstrip(" ,;:-")
    return f"{clipped or cleaned[: max(0, limit - 3)]}..."


def _safe_float(value: object) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _text_fingerprint(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", " ", _clean_line(value).lower()).strip()


def _dedupe_clean(values: list[str], *, minimum_len: int = 10, limit: int = 5) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for value in values:
        cleaned = _clean_line(value)
        if len(cleaned) < minimum_len:
            continue
        fingerprint = _text_fingerprint(cleaned)
        if not fingerprint or fingerprint in seen:
            continue
        seen.add(fingerprint)
        output.append(cleaned)
        if len(output) >= limit:
            break
    return output


def _query_focus_terms(value: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9']+", (value or "").lower())
        if len(token) >= 4 and token not in ANALYSIS_QUERY_STOPWORDS and not token.isdigit()
    }


def _contains_focus_term(text: str, term: str) -> bool:
    haystack = _clean_line(text).lower()
    needle = _clean_line(term).lower()
    if not haystack or not needle:
        return False
    if " " in needle:
        pattern = re.escape(needle).replace(r"\ ", r"\s+")
        return bool(re.search(rf"(?<![a-z0-9]){pattern}(?![a-z0-9])", haystack))
    return bool(re.search(rf"(?<![a-z0-9]){re.escape(needle)}(?![a-z0-9])", haystack))


def _generic_brief_phrase(value: str) -> bool:
    lowered = _clean_line(value).lower()
    if not lowered:
        return True
    generic_markers = (
        "remains active",
        "live contradiction lane",
        "sharper turn than the last headline cycle",
        "picked up a concrete new wrinkle",
        "still active enough to warrant a clean new pass",
    )
    return any(marker in lowered for marker in generic_markers)


def _directive_query_is_instructional(value: str) -> bool:
    cleaned = _clean_line(value)
    if not cleaned:
        return False
    lowered = cleaned.lower()
    if any(phrase in lowered for phrase in INSTRUCTIONAL_QUERY_PHRASES):
        return True
    return bool(INSTRUCTIONAL_QUERY_PREFIX_RE.match(cleaned))


def _search_safe_query(value: str) -> str:
    cleaned = _clean_line(value)
    if not cleaned:
        return ""
    if not _directive_query_is_instructional(cleaned):
        return cleaned[:220]
    return ""


def _theme_query_hint(theme: Theme) -> str:
    return _clean_line(THEME_QUERY_HINTS.get(_clean_line(theme.slug).lower(), ""))


def _apply_theme_query_hint(base_query: str, theme: Theme) -> str:
    query = _clean_line(base_query)
    hint = _theme_query_hint(theme)
    if hint:
        query_terms = _query_focus_terms(query)
        hint_terms = _query_focus_terms(hint)
        if not hint_terms.issubset(query_terms):
            query = _clean_line(f"{query} {hint}")
    if str(settings.current_news_min_year) not in query:
        query = f"{query} {settings.current_news_min_year}".strip()
    return query[:220]


def _lane_focus_terms(*, focus_label: str, theme_slug: str, query_text: str) -> set[str]:
    theme_hint = _clean_line(THEME_QUERY_HINTS.get(_clean_line(theme_slug).lower(), ""))
    return _query_focus_terms(" ".join([focus_label, theme_slug.replace("-", " "), theme_hint, query_text]).strip())


def _text_focus_score(value: str, *, focus_terms: set[str]) -> int:
    if not _clean_line(value) or not focus_terms:
        return 0
    return sum(1 for term in focus_terms if _contains_focus_term(value, term))


def _dialectic_query_suffix(*, theme_slug: str, lens: str) -> str:
    return _clean_line(
        (THEME_DIALECTIC_QUERY_SUFFIXES.get(theme_slug, {}) or {}).get(lens) or DEFAULT_DIALECTIC_QUERY_SUFFIXES.get(lens, "")
    )


def _analysis_query_variants(
    *,
    base_query: str,
    scope_type: str,
    theme: Theme | None,
) -> list[dict[str, str]]:
    theme_slug = _clean_line(theme.slug if theme else "").lower()
    primary_query = _apply_theme_query_hint(base_query, theme) if theme else _clean_line(base_query)
    if not theme and str(settings.current_news_min_year) not in primary_query:
        primary_query = f"{primary_query} {settings.current_news_min_year}".strip()
    primary_query = primary_query[:220]
    variants = [{"label": "primary", "query_text": primary_query}]
    seen = {_text_fingerprint(primary_query)}

    for lens in ("counterforce", "consequence"):
        suffix = _dialectic_query_suffix(theme_slug=theme_slug, lens=lens)
        if not suffix:
            continue
        candidate = _clean_line(f"{primary_query} {suffix}")
        if theme:
            candidate = _apply_theme_query_hint(candidate, theme)
        elif str(settings.current_news_min_year) not in candidate:
            candidate = f"{candidate} {settings.current_news_min_year}".strip()
        candidate = candidate[:220]
        fingerprint = _text_fingerprint(candidate)
        if not candidate or fingerprint in seen:
            continue
        variants.append({"label": lens, "query_text": candidate})
        seen.add(fingerprint)
        if scope_type == "theme" and len(variants) >= 3:
            break
    return variants[:3]


def _source_card_key(source: dict[str, object]) -> str:
    source_id = _clean_line(source.get("id"))
    if source_id:
        return source_id
    return _text_fingerprint(" ".join([_clean_line(source.get("title")), _clean_line(source.get("url"))]).strip())


def _source_card_priority(source: dict[str, object]) -> tuple[float, float, float, float, float]:
    return _source_priority(source)


def _merge_source_cards(existing: dict[str, object], candidate: dict[str, object]) -> dict[str, object]:
    existing_card = dict(existing)
    candidate_card = dict(candidate)
    winner, fallback = (
        (candidate_card, existing_card)
        if _source_card_priority(candidate_card) > _source_card_priority(existing_card)
        else (existing_card, candidate_card)
    )
    merged = dict(winner)
    for key in (
        "title",
        "url",
        "source_type",
        "source_name",
        "source_label",
        "snippet",
        "credibility_tier",
        "source_kind",
        "source_host",
        "published_at",
        "fetched_at",
        "embedding_status",
    ):
        if not _clean_line(merged.get(key)) and _clean_line(fallback.get(key)):
            merged[key] = fallback.get(key)
    merged["quality_score"] = max(_safe_float(existing_card.get("quality_score")), _safe_float(candidate_card.get("quality_score")))
    merged["editorial_priority_score"] = max(
        _safe_float(existing_card.get("editorial_priority_score")),
        _safe_float(candidate_card.get("editorial_priority_score")),
    )
    merged["retrieval_score"] = max(_safe_float(existing_card.get("retrieval_score")), _safe_float(candidate_card.get("retrieval_score")))
    merged["embedded_chunk_count"] = max(
        int(existing_card.get("embedded_chunk_count") or 0),
        int(candidate_card.get("embedded_chunk_count") or 0),
    )
    age_values = [int(value) for value in [existing_card.get("age_days"), candidate_card.get("age_days")] if value is not None]
    if age_values:
        merged["age_days"] = min(age_values)
    merged["current_news_eligible"] = bool(existing_card.get("current_news_eligible")) or bool(candidate_card.get("current_news_eligible"))
    merged["fundamental_view_candidate"] = bool(existing_card.get("fundamental_view_candidate")) or bool(
        candidate_card.get("fundamental_view_candidate")
    )
    merged["evidence_excerpts"] = _dedupe_clean(
        [
            *[str(item) for item in (existing_card.get("evidence_excerpts") or [])],
            *[str(item) for item in (candidate_card.get("evidence_excerpts") or [])],
        ],
        minimum_len=28,
        limit=3,
    )
    return merged


def _merge_trend_rows(rows: list[dict[str, object]], *, limit: int) -> list[dict[str, object]]:
    merged: list[dict[str, object]] = []
    seen: set[str] = set()
    for row in rows:
        title = _clean_line((row or {}).get("title"))
        summary = _clean_line((row or {}).get("summary"))
        theme_slug = _clean_line((row or {}).get("theme_slug"))
        key = _text_fingerprint(" ".join(part for part in [title, summary, theme_slug] if part))
        if not key or key in seen:
            continue
        seen.add(key)
        merged.append(dict(row))
        if len(merged) >= limit:
            break
    return merged


def _merge_retrieval_bundles(
    bundles: list[dict[str, Any]],
    *,
    query_sets: list[dict[str, str]],
    source_limit: int,
    trend_limit: int,
) -> dict[str, Any]:
    primary_bundle = bundles[0] if bundles else {}
    merged_sources: dict[str, dict[str, object]] = {}
    merged_themes: dict[str, dict[str, object]] = {}
    trend_rows: list[dict[str, object]] = []
    diagnostics: dict[str, int] = {}
    focus_theme = primary_bundle.get("focus_theme")

    for bundle in bundles:
        if not focus_theme and bundle.get("focus_theme"):
            focus_theme = bundle.get("focus_theme")
        for source in list(bundle.get("raw_sources") or []):
            key = _source_card_key(source)
            if not key:
                continue
            if key in merged_sources:
                merged_sources[key] = _merge_source_cards(merged_sources[key], source)
            else:
                merged_sources[key] = dict(source)
        for theme in list(bundle.get("theme_memory") or []):
            slug = _clean_line((theme or {}).get("slug"))
            if slug and slug not in merged_themes:
                merged_themes[slug] = dict(theme)
        trend_rows.extend(list(bundle.get("trend_ledger") or []))
        for key, value in dict(bundle.get("retrieval_diagnostics") or {}).items():
            diagnostics[key] = int(diagnostics.get(key, 0)) + int(value or 0)

    ranked_sources = sorted(merged_sources.values(), key=_source_card_priority, reverse=True)[:source_limit]
    merged_trends = _merge_trend_rows(trend_rows, limit=trend_limit)
    return {
        "query_text": _clean_line(primary_bundle.get("query_text")),
        "focus_theme": focus_theme,
        "raw_sources": ranked_sources,
        "theme_memory": list(merged_themes.values()),
        "trend_ledger": merged_trends,
        "retrieval_diagnostics": diagnostics,
        "query_sets": query_sets,
        "query_variants": [_clean_line(item.get("query_text")) for item in query_sets if _clean_line(item.get("query_text"))],
    }


def _aligned_trend_title(
    trend_ledger: list[dict[str, object]],
    *,
    focus_label: str,
    theme_slug: str,
    query_text: str,
) -> str:
    focus_terms = _lane_focus_terms(focus_label=focus_label, theme_slug=theme_slug, query_text=query_text)
    generic_fallback = ""
    for trend in trend_ledger:
        title = _clean_line((trend or {}).get("title"))
        summary = _clean_line((trend or {}).get("summary"))
        theme_name = _clean_line((trend or {}).get("theme_name"))
        candidate = title or summary
        if not candidate:
            continue
        merged = " ".join(part for part in [title, summary, theme_name] if part).lower()
        if focus_terms and _text_focus_score(merged, focus_terms=focus_terms) >= (2 if theme_slug else 1):
            return candidate
        if not generic_fallback and not candidate.lower().endswith("remains active"):
            generic_fallback = candidate
    if theme_slug and focus_terms:
        return ""
    return generic_fallback


def _source_text(source: dict[str, object]) -> str:
    return " ".join(
        part
        for part in [
            _clean_line(source.get("title")),
            _clean_line(source.get("snippet")),
            _clean_line(source.get("source_label") or source.get("source_name")),
        ]
        if part
    )


def _theme_alignment_groups_satisfied(text: str, *, theme_slug: str) -> bool:
    groups = THEME_ALIGNMENT_REQUIRED_GROUPS.get(_clean_line(theme_slug).lower(), ())
    if not groups:
        return True
    cleaned = _clean_line(text)
    if not cleaned:
        return False
    return all(any(_contains_focus_term(cleaned, term) for term in group) for group in groups)


def _source_lane_alignment_score(source: dict[str, object], *, focus_terms: set[str], theme_slug: str = "") -> float:
    if theme_slug and not _theme_alignment_groups_satisfied(_source_text(source), theme_slug=theme_slug):
        return 0.0
    query_alignment = _safe_float(source.get("query_alignment_score"))
    text_alignment = float(_text_focus_score(_source_text(source), focus_terms=focus_terms))
    return round((query_alignment * 1.9) + text_alignment, 2)


def _aligned_sources_for_brief(
    sources: list[dict[str, object]],
    *,
    focus_label: str,
    theme_slug: str,
    query_text: str,
) -> tuple[list[dict[str, object]], int, float]:
    if not sources:
        return [], 0, 0.0
    focus_terms = _lane_focus_terms(focus_label=focus_label, theme_slug=theme_slug, query_text=query_text)
    if not focus_terms:
        return sources, len(sources), 1.0

    aligned_sources = [
        source
        for source in sources
        if _source_lane_alignment_score(source, focus_terms=focus_terms, theme_slug=theme_slug) > 0
    ]
    aligned_count = len(aligned_sources)
    if theme_slug and aligned_sources:
        support_sources = [
            source
            for source in sources
            if _clean_line(source.get("source_kind")).lower() == "institutional" and source not in aligned_sources
        ][:1]
        if support_sources:
            aligned_sources = [*aligned_sources, *support_sources]
    alignment_ratio = round(aligned_count / max(len(sources), 1), 2)
    if theme_slug and aligned_sources:
        return aligned_sources, aligned_count, alignment_ratio
    if aligned_count >= 2:
        return aligned_sources, aligned_count, alignment_ratio
    return sources, aligned_count, alignment_ratio


def _credibility_priority(value: object) -> float:
    normalized = _clean_line(value).lower()
    if normalized == "high":
        return 2.0
    if normalized == "medium":
        return 1.0
    return 0.0


def _source_priority(source: dict[str, object]) -> tuple[float, float, float, float, float]:
    return (
        _credibility_priority(source.get("credibility_tier")),
        _safe_float(source.get("retrieval_score")),
        _safe_float(source.get("editorial_priority_score")),
        _safe_float(source.get("quality_score")),
        -_safe_float(source.get("age_days")),
    )


def _title_looks_low_signal(title: object) -> bool:
    lowered = _clean_line(title).lower()
    return bool(lowered) and any(marker in lowered for marker in LOW_SIGNAL_TITLE_MARKERS)


def _lane_prefers_foreign_pressure(*, scope_type: str, theme_slug: str, focus_label: str, query_text: str) -> bool:
    normalized_theme_slug = _clean_line(theme_slug).lower()
    if normalized_theme_slug in FOREIGN_PRESSURE_THEME_SLUGS:
        return True
    if _clean_line(scope_type).lower() != "site":
        return False
    haystack = " ".join([focus_label, query_text]).lower()
    strong_markers = ("iran", "israel", "gaza", "hormuz", "ceasefire", "troops", "strike", "war powers", "allies", "nato")
    return any(marker in haystack for marker in strong_markers)


def _role_from_source(source: dict[str, object]) -> str:
    kind = _clean_line(source.get("source_kind")).lower()
    title = _clean_line(source.get("title")).lower()
    snippet = _clean_line(source.get("snippet")).lower()
    if kind == "institutional":
        haystack = " ".join(part for part in [title, snippet] if part)
        if any(marker in haystack for marker in SPIN_MARKERS):
            return "spin_cycle"
        return "official_line"
    if any(marker in title for marker in LEGAL_ROLE_MARKERS):
        return "legal_receipt"
    if any(marker in title for marker in FALLOUT_MARKERS):
        foreign_hits = sum(1 for marker in FOREIGN_POLICY_MARKERS if marker in title)
        fallout_hits = sum(1 for marker in FALLOUT_MARKERS if marker in title)
        if fallout_hits >= max(1, foreign_hits):
            return "fallout_signal"
    if any(marker in title for marker in FOREIGN_POLICY_MARKERS):
        return "foreign_pressure"
    if any(marker in snippet for marker in FOREIGN_POLICY_MARKERS):
        return "foreign_pressure"
    if any(marker in snippet for marker in FALLOUT_MARKERS):
        return "fallout_signal"
    if kind == "reporting":
        return "core_receipt"
    return "context"


def _role_label(role: str) -> str:
    return role.replace("_", " ").strip()


def _tone_profile(*, theme_slug: str, recent_lane_count: int, role_counts: Counter[str]) -> dict[str, str]:
    profile = THEME_TONE_PROFILES.get(theme_slug, {}).copy()
    if not profile:
        if role_counts.get("legal_receipt"):
            profile = {
                "primary": "silk-scalpel",
                "long_form": "precise and feminine, with clean prosecutorial pressure",
                "short_form": "tight and quotable, with the receipts doing the heavy lifting",
            }
        elif role_counts.get("foreign_pressure"):
            profile = {
                "primary": "steel-nerve",
                "long_form": "urgent but never hysterical, focused on consequence and contradiction",
                "short_form": "hard-edged, live, and specific",
            }
        elif role_counts.get("spin_cycle"):
            profile = {
                "primary": "lacquered-side-eye",
                "long_form": "amused, exacting, and unimpressed by messaging theater",
                "short_form": "pithy and cutting without losing discipline",
            }
        else:
            profile = {
                "primary": "velvet-hammer",
                "long_form": "smart, feminine, and exact, with style held in reserve until the facts earn it",
                "short_form": "pithy, confident, and screenshot-ready",
            }
    if recent_lane_count >= 2:
        profile["continuity"] = "Treat this as an ongoing lane. Advance the site's thought instead of restarting it."
    else:
        profile["continuity"] = "Open the lane cleanly, then leave a smart continuation point."
    return profile


def _coverage_time_label(created_at: datetime | None) -> str:
    if not isinstance(created_at, datetime):
        return "recently"
    age_hours = max(0, int((datetime.utcnow() - created_at.replace(tzinfo=None)).total_seconds() // 3600))
    if age_hours <= 6:
        return "earlier today"
    if age_hours <= 24:
        return "in the last day"
    return "recently"


def _story_targets(
    *,
    scope_type: str,
    recent_lane_count: int,
    freshest_age_days: int | None,
    freshest_recent_age_hours: int | None,
) -> dict[str, str]:
    hot_lane = freshest_recent_age_hours is not None and freshest_recent_age_hours <= 6
    if scope_type == "site":
        if recent_lane_count >= 2 and hot_lane and freshest_age_days is not None and freshest_age_days <= 1:
            long_form = "lead_update"
        else:
            long_form = "lead_analysis"
    else:
        if recent_lane_count >= 3 and hot_lane and freshest_age_days is not None and freshest_age_days <= 1:
            long_form = "notebook_entry"
        elif recent_lane_count >= 2 and hot_lane and freshest_age_days is not None and freshest_age_days <= 1:
            long_form = "theme_update"
        else:
            long_form = "theme_column"
    return {
        "long_form": long_form,
        "long_form_label": STORY_MODE_LABELS.get(long_form, long_form.replace("_", " ").title()),
        "short_form": "thread" if recent_lane_count >= 2 else "dispatch",
    }


def _role_priority(role: str, *, allow_foreign_pressure: bool) -> float:
    if role == "legal_receipt":
        return 6.6
    if role == "core_receipt":
        return 6.0
    if role == "fallout_signal":
        return 5.8
    if role == "official_line":
        return 5.4
    if role == "spin_cycle":
        return 5.1
    if role == "foreign_pressure":
        return 5.3 if allow_foreign_pressure else 2.1
    return 1.0


def _source_role_sort_key(
    role_card: dict[str, object],
    *,
    focus_terms: set[str],
    theme_slug: str,
    allow_foreign_pressure: bool,
) -> tuple[float, float, float, float, float, float]:
    role = _clean_line(role_card.get("role"))
    title = _clean_line(role_card.get("title"))
    source_kind = _clean_line(role_card.get("source_kind")).lower()
    outlet = _clean_line(role_card.get("outlet"))
    return (
        _role_priority(role, allow_foreign_pressure=allow_foreign_pressure),
        _source_lane_alignment_score(
            {
                "title": title,
                "snippet": role_card.get("snippet"),
                "source_label": outlet,
                "source_name": outlet,
                "query_alignment_score": role_card.get("query_alignment_score"),
            },
            focus_terms=focus_terms,
            theme_slug=theme_slug,
        ),
        0.0 if _title_looks_low_signal(title) else 1.0,
        0.4 if role == "official_line" and source_kind == "institutional" else 0.0,
        _credibility_priority(role_card.get("credibility_tier")),
        _safe_float(role_card.get("quality_score")) - (_safe_float(role_card.get("age_days")) * 0.03),
    )


def _select_source_roles(
    role_cards: list[dict[str, object]],
    *,
    scope_type: str,
    focus_label: str,
    theme_slug: str,
    query_text: str,
    limit: int,
) -> list[dict[str, object]]:
    if not role_cards:
        return []
    focus_terms = _lane_focus_terms(focus_label=focus_label, theme_slug=theme_slug, query_text=query_text)
    allow_foreign_pressure = _lane_prefers_foreign_pressure(
        scope_type=scope_type,
        theme_slug=theme_slug,
        focus_label=focus_label,
        query_text=query_text,
    )
    ranked_cards = sorted(
        role_cards,
        key=lambda card: _source_role_sort_key(
            card,
            focus_terms=focus_terms,
            theme_slug=theme_slug,
            allow_foreign_pressure=allow_foreign_pressure,
        ),
        reverse=True,
    )
    selected: list[dict[str, object]] = []
    role_counts: Counter[str] = Counter()
    seen_titles: set[str] = set()
    seen_outlets: set[str] = set()
    role_limits = {
        "official_line": 1,
        "spin_cycle": 1,
        "fallout_signal": 1,
        "foreign_pressure": 2 if allow_foreign_pressure else 1,
        "legal_receipt": 2,
        "core_receipt": 2,
        "context": 1,
    }
    grounded_receipt_exists = any(
        _clean_line(card.get("role")) in {"legal_receipt", "core_receipt", "fallout_signal"}
        for card in ranked_cards
    )

    def _matches_priority(card: dict[str, object], roles: set[str]) -> bool:
        return _clean_line(card.get("role")) in roles

    def _skip_card(card: dict[str, object]) -> bool:
        role = _clean_line(card.get("role"))
        title_fp = _text_fingerprint(card.get("title"))
        outlet_fp = _text_fingerprint(card.get("outlet"))
        if title_fp in seen_titles:
            return True
        if role_counts.get(role, 0) >= int(role_limits.get(role, 1)):
            return True
        if role == "foreign_pressure" and not allow_foreign_pressure and grounded_receipt_exists:
            return True
        if outlet_fp and outlet_fp in seen_outlets and role not in {"legal_receipt", "core_receipt"}:
            return True
        if _title_looks_low_signal(card.get("title")):
            better_same_role_exists = any(
                _clean_line(other.get("role")) == role
                and not _title_looks_low_signal(other.get("title"))
                and _text_fingerprint(other.get("title")) not in seen_titles
                for other in ranked_cards
            )
            if better_same_role_exists:
                return True
        return False

    def _take_best(roles: set[str]) -> None:
        for card in ranked_cards:
            if not _matches_priority(card, roles):
                continue
            if _skip_card(card):
                continue
            selected.append(card)
            role_counts[_clean_line(card.get("role"))] += 1
            seen_titles.add(_text_fingerprint(card.get("title")))
            outlet_fp = _text_fingerprint(card.get("outlet"))
            if outlet_fp:
                seen_outlets.add(outlet_fp)
            return

    receipt_roles = {"legal_receipt", "core_receipt", "fallout_signal"}
    if allow_foreign_pressure:
        receipt_roles.add("foreign_pressure")
    _take_best(receipt_roles)
    _take_best({"official_line", "spin_cycle"})
    _take_best({"fallout_signal"})
    if allow_foreign_pressure:
        _take_best({"foreign_pressure"})
    _take_best({"legal_receipt", "core_receipt"})

    for card in ranked_cards:
        if len(selected) >= max(2, limit):
            break
        if _skip_card(card):
            continue
        selected.append(card)
        role_counts[_clean_line(card.get("role"))] += 1
        seen_titles.add(_text_fingerprint(card.get("title")))
        outlet_fp = _text_fingerprint(card.get("outlet"))
        if outlet_fp:
            seen_outlets.add(outlet_fp)

    return selected[: max(2, limit)]


def _selected_angle(
    focus_label: str,
    *,
    source_roles: list[dict[str, object]],
    pattern: str,
    recent_titles: list[str],
    query_text: str,
    theme_slug: str,
) -> str:
    focus_terms = _lane_focus_terms(focus_label=focus_label, theme_slug=theme_slug, query_text=query_text)
    recent_fingerprints = {_text_fingerprint(title) for title in recent_titles if title}
    source_candidates = [
        {
            "title": _clean_line(item.get("title")),
            "quality_score": _safe_float(item.get("quality_score")),
            "credibility_tier": item.get("credibility_tier"),
            "age_days": item.get("age_days"),
            "role": _clean_line(item.get("role")),
        }
        for item in source_roles
        if str(item.get("role") or "") in {"legal_receipt", "core_receipt", "foreign_pressure", "fallout_signal"}
    ]
    source_candidates = [candidate for candidate in source_candidates if candidate["title"] and not _generic_brief_phrase(candidate["title"])]
    if any(not _title_looks_low_signal(candidate["title"]) for candidate in source_candidates):
        source_candidates = [candidate for candidate in source_candidates if not _title_looks_low_signal(candidate["title"])]
    candidate_titles = _dedupe_clean([item["title"] for item in source_candidates] + [pattern, focus_label], minimum_len=12, limit=6)
    concrete_source_candidates = sorted(
        [candidate for candidate in source_candidates if candidate["title"] in candidate_titles],
        key=lambda candidate: (
            0 if _title_looks_low_signal(candidate["title"]) else 1,
            _text_focus_score(candidate["title"], focus_terms=focus_terms),
            _credibility_priority(candidate.get("credibility_tier")),
            _safe_float(candidate.get("quality_score")),
            -_safe_float(candidate.get("age_days")),
            len(candidate["title"]),
        ),
        reverse=True,
    )
    ranked_candidates = concrete_source_candidates or sorted(
        candidate_titles,
        key=lambda candidate: (
            0 if _title_looks_low_signal(candidate) else 1,
            0 if _generic_brief_phrase(candidate) else 1,
            1 if candidate in {item["title"] for item in source_candidates} else 0,
            _text_focus_score(candidate, focus_terms=focus_terms),
            len(candidate),
        ),
        reverse=True,
    )
    for candidate in ranked_candidates:
        title = candidate["title"] if isinstance(candidate, dict) else candidate
        if _text_fingerprint(title) not in recent_fingerprints:
            return title
    fallback_source = next(
        (
            candidate["title"]
            for candidate in ranked_candidates
            if isinstance(candidate, dict) and candidate["title"] in {item["title"] for item in source_candidates}
        ),
        "",
    )
    if fallback_source:
        return fallback_source
    if ranked_candidates:
        return ranked_candidates[0]["title"] if isinstance(ranked_candidates[0], dict) else ranked_candidates[0]
    return focus_label


def _anchor_focus_terms(
    *,
    selected_angle: str,
    focus_label: str,
    theme_slug: str,
    query_text: str,
) -> set[str]:
    angle_terms = _query_focus_terms(selected_angle)
    if len(angle_terms) >= 2:
        return angle_terms
    lane_terms = _lane_focus_terms(focus_label=focus_label, theme_slug=theme_slug, query_text=query_text)
    return angle_terms or lane_terms


def _source_role_anchor_score(
    role_card: dict[str, object],
    *,
    selected_angle: str,
    focus_terms: set[str],
) -> int:
    title = _clean_line(role_card.get("title"))
    if not title:
        return 0
    score = 0
    if _text_fingerprint(title) == _text_fingerprint(selected_angle):
        score += 8
    score += min(4, _text_focus_score(title, focus_terms=focus_terms))
    return score


def _coherent_source_roles(
    source_roles: list[dict[str, object]],
    *,
    selected_angle: str,
    focus_label: str,
    theme_slug: str,
    query_text: str,
) -> list[dict[str, object]]:
    if not source_roles:
        return []
    if not _clean_line(selected_angle):
        return source_roles

    focus_terms = _anchor_focus_terms(
        selected_angle=selected_angle,
        focus_label=focus_label,
        theme_slug=theme_slug,
        query_text=query_text,
    )
    ranked_roles = sorted(
        source_roles,
        key=lambda role: (
            _source_role_anchor_score(role, selected_angle=selected_angle, focus_terms=focus_terms),
            1 if _clean_line(role.get("role")) in {"legal_receipt", "core_receipt", "fallout_signal", "official_line"} else 0,
            _credibility_priority(role.get("credibility_tier")),
            _safe_float(role.get("quality_score")),
        ),
        reverse=True,
    )

    coherent: list[dict[str, object]] = []
    seen_titles: set[str] = set()
    for card in ranked_roles:
        title_fp = _text_fingerprint(card.get("title"))
        if not title_fp or title_fp in seen_titles:
            continue
        anchor_score = _source_role_anchor_score(card, selected_angle=selected_angle, focus_terms=focus_terms)
        role = _clean_line(card.get("role"))
        keep_official_context = (
            role in {"official_line", "spin_cycle"}
            and not any(_clean_line(item.get("role")) in {"official_line", "spin_cycle"} for item in coherent)
            and not _title_looks_low_signal(card.get("title"))
        )
        if coherent and anchor_score <= 0 and not keep_official_context:
            continue
        if not coherent and anchor_score <= 0 and role not in {"official_line", "spin_cycle"}:
            continue
        if (
            anchor_score >= 2
            or title_fp == _text_fingerprint(selected_angle)
            or (not coherent and anchor_score >= 1)
            or keep_official_context
        ):
            coherent.append(card)
            seen_titles.add(title_fp)
        if len(coherent) >= 3:
            break

    return coherent or source_roles[: max(1, min(3, len(source_roles)))]


def _pattern_statement(
    focus_label: str,
    *,
    theme_name: str,
    trend_title: str,
    role_counts: Counter[str],
    official_line: dict[str, object] | None,
    receipt: dict[str, object] | None,
) -> str:
    if official_line and receipt:
        claim_outlet = _clean_line(official_line.get("outlet")) or "the official line"
        receipt_outlet = _clean_line(receipt.get("outlet")) or "the reporting"
        if _text_fingerprint(claim_outlet) == _text_fingerprint(receipt_outlet):
            if role_counts.get("fallout_signal") and receipt:
                return f"{focus_label} has moved past headline drama and into visible consequence."
            if trend_title:
                return trend_title
            return f"{focus_label} is moving fast enough to need a cleaner read than the spin around it."
        return f"{claim_outlet} is carrying the line while {receipt_outlet} is carrying the receipt that bends it."
    if role_counts.get("fallout_signal") and receipt:
        return f"{focus_label} has moved past headline drama and into visible consequence."
    if trend_title:
        return trend_title
    if theme_name:
        return f"{theme_name} is still the live contradiction lane."
    return f"{focus_label} is still moving fast enough to deserve a sharper read."


def _why_now_statement(
    *,
    focus_label: str,
    selected_angle: str,
    source_roles: list[dict[str, object]],
    recent_entries: list[dict[str, object]],
    freshest_age_days: int | None,
) -> str:
    top_receipt = next(
        (
            item
            for item in source_roles
            if str(item.get("role") or "") in {"legal_receipt", "core_receipt", "foreign_pressure", "fallout_signal"}
        ),
        source_roles[0] if source_roles else None,
    )
    anchor_receipt = next(
        (
            item
            for item in source_roles
            if _text_fingerprint(item.get("title")) == _text_fingerprint(selected_angle)
        ),
        top_receipt,
    )
    receipt_title = _clean_line((anchor_receipt or {}).get("title")) or _clean_line(selected_angle)
    receipt_outlet = _clean_line((anchor_receipt or {}).get("outlet")) or "Fresh reporting"
    if recent_entries:
        if receipt_title:
            prior_title = _clean_line(recent_entries[0].get("title"))
            if prior_title and _text_fingerprint(prior_title) != _text_fingerprint(receipt_title):
                return (
                    f"{receipt_outlet} just moved the lane from '{prior_title}' to '{receipt_title}', "
                    f"which is why {focus_label.lower()} deserves a cleaner second look now."
                )
            return (
                f"{receipt_outlet} just put '{receipt_title}' on the board, "
                f"which gives {focus_label.lower()} a concrete new edge instead of another recycled recap."
            )
        return f"{focus_label} picked up a concrete new wrinkle, so the lane needs a cleaner read instead of another recap."
    if receipt_title and freshest_age_days is not None and freshest_age_days <= 1:
        return (
            f"{receipt_outlet} just put '{receipt_title}' on the board, which turns {focus_label.lower()} "
            "from a recurring theme into a live argument."
        )
    if receipt_title:
        return f"The clearest live receipt is '{receipt_title}' from {receipt_outlet}, which is enough to move the lane."
    return f"The contradiction inside {focus_label.lower()} is still active enough to warrant a clean new pass."


def _reader_value_statement(
    *,
    focus_label: str,
    role_counts: Counter[str],
    tone: dict[str, str],
) -> str:
    if role_counts.get("official_line") and role_counts.get("legal_receipt"):
        return f"Show readers how the polished line and the factual record split apart inside {focus_label.lower()}."
    if role_counts.get("foreign_pressure"):
        return f"Translate the geopolitical noise into a clear domestic consequence readers can actually feel."
    if role_counts.get("fallout_signal"):
        return f"Move readers from the headline into the price, backlash, or institutional cost hiding underneath it."
    return f"Give readers the smartest, most concise explanation of why {focus_label.lower()} still matters."


def _thread_kind_key(
    *,
    focus_label: str,
    source_roles: list[dict[str, object]],
    trend_title: str,
    role_counts: Counter[str],
) -> str:
    haystack = " ".join(
        [
            focus_label,
            trend_title,
            *[_clean_line(item.get("title")) for item in source_roles],
            *[_clean_line(item.get("outlet")) for item in source_roles],
        ]
    ).lower()
    scores = {
        key: sum(1 for marker in markers if marker in haystack)
        for key, markers in THREAD_KIND_MARKERS.items()
    }
    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    if ranked and ranked[0][1] > 0:
        return ranked[0][0]
    if role_counts.get("legal_receipt"):
        return "legal"
    if role_counts.get("foreign_pressure"):
        return "war_power"
    if role_counts.get("fallout_signal"):
        return "market"
    if role_counts.get("spin_cycle"):
        return "vanity"
    return "bureaucratic"


def _counterforce_statement(
    *,
    official_line: dict[str, object] | None,
    receipt: dict[str, object] | None,
    role_counts: Counter[str],
    focus_label: str,
) -> str:
    if official_line and receipt:
        claim_outlet = _clean_line(official_line.get("outlet")) or "the official line"
        receipt_outlet = _clean_line(receipt.get("outlet")) or "the reporting"
        if _text_fingerprint(claim_outlet) == _text_fingerprint(receipt_outlet):
            return f"The cleaner record is already outgrowing the performance around {focus_label.lower()}."
        claim_title = _clean_line(official_line.get("title"))
        if claim_title:
            return f"{claim_outlet} is still selling '{claim_title}' while {receipt_outlet} keeps carrying the cleaner record."
        return f"{claim_outlet} is still selling the line while {receipt_outlet} keeps carrying the cleaner record."
    if role_counts.get("fallout_signal") and receipt:
        return f"The real pushback is showing up in consequence before the administration has a tidy answer."
    if receipt:
        return f"The cleanest available receipt is already bigger than the spin around {focus_label.lower()}."
    return f"The pressure against {focus_label.lower()} is now concrete enough to stop treating it like atmosphere."


def _synthesis_statement(
    *,
    focus_label: str,
    thread_kind_label: str,
    why_now: str,
    pattern: str,
) -> str:
    if thread_kind_label:
        return (
            f"{focus_label} stops looking like random chaos once you follow the {thread_kind_label}: "
            "that is where the cost of the line gets harder to hide."
        )
    if why_now:
        return f"{focus_label} is now concrete enough to argue, not merely react to."
    return pattern or f"{focus_label} still deserves a smarter read than the headline cycle is giving it."


def _gold_thread_statement(
    *,
    focus_label: str,
    thread_kind_label: str,
    receipt: dict[str, object] | None,
    official_line: dict[str, object] | None,
) -> str:
    anchor = _clean_line((receipt or {}).get("title") or (official_line or {}).get("title") or focus_label)
    if anchor and thread_kind_label:
        return f"Follow the {thread_kind_label} in '{anchor}'; that is where {focus_label.lower()} finally tells on itself."
    if anchor:
        return f"Follow '{anchor}' instead of the generic headline line."
    return f"Follow the hidden tell underneath {focus_label.lower()}, not the loudest quote on top of it."


def _writer_north_star(
    *,
    thesis: str,
    thread_kind_label: str,
    counterforce: str,
) -> str:
    if thread_kind_label:
        return (
            f"Open on '{thesis}', break it against the counterforce, and use the {thread_kind_label} "
            "to show what kind of power move this really is."
    )
    return f"Open on '{thesis}' and prove why the counterforce makes the line smaller than the performance."


def _claim_vs_receipt_flag(
    *,
    focus_label: str,
    official_line: dict[str, object] | None,
    receipt: dict[str, object] | None,
) -> str:
    if official_line and receipt:
        claim_outlet = _clean_line(official_line.get("outlet")) or "the official line"
        claim_title = _limit_text(_clean_line(official_line.get("title")), 120)
        receipt_outlet = _clean_line(receipt.get("outlet")) or "the cleaner record"
        receipt_title = _limit_text(_clean_line(receipt.get("title")), 120)
        if claim_title and receipt_title and _text_fingerprint(claim_title) != _text_fingerprint(receipt_title):
            return f"{claim_outlet} is still selling '{claim_title}' while {receipt_outlet} keeps '{receipt_title}' on the record."
        if claim_title:
            return f"{claim_outlet} is still selling '{claim_title}' while {receipt_outlet} is carrying the cleaner record."
        return f"{claim_outlet} is still carrying the performance while {receipt_outlet} is carrying the cleaner record."
    if receipt:
        receipt_outlet = _clean_line(receipt.get("outlet")) or "the reporting"
        receipt_title = _limit_text(_clean_line(receipt.get("title")), 120)
        if receipt_title:
            return f"{receipt_outlet} is already carrying '{receipt_title}', which is cleaner than the talking points around {focus_label.lower()}."
        return f"The cleanest record is already bigger than the talking points around {focus_label.lower()}."
    return f"The claim around {focus_label.lower()} is already wobblier than the record supporting it."


def _evidence_strength_flag(
    *,
    source_count: int,
    avg_quality: float,
    freshest_age_days: int | None,
    role_counts: Counter[str],
) -> str:
    live_label = "live" if freshest_age_days is not None and freshest_age_days <= 1 else "developing"
    receipt_count = sum(role_counts.get(role, 0) for role in ("legal_receipt", "core_receipt", "fallout_signal", "foreign_pressure"))
    if source_count >= 3 and avg_quality >= 6.0:
        strength = "strong"
    elif source_count >= 2 and avg_quality >= 4.8:
        strength = "solid"
    else:
        strength = "thin"
    if role_counts.get("official_line") and receipt_count:
        return f"{strength} {live_label} packet with a visible claim-versus-receipt split."
    if receipt_count >= 2:
        return f"{strength} {live_label} packet with multiple current receipts on the board."
    return f"{strength} {live_label} packet; stay disciplined and make the available receipt do real work."


def _analysis_flags(
    *,
    focus_label: str,
    thread_kind: str,
    thread_kind_label: str,
    official_line: dict[str, object] | None,
    receipt: dict[str, object] | None,
    role_counts: Counter[str],
    source_count: int,
    avg_quality: float,
    freshest_age_days: int | None,
) -> dict[str, str]:
    base_flags = THREAD_POWER_FLAGS.get(thread_kind, THREAD_POWER_FLAGS["default"])
    return {
        "tell_kind": thread_kind_label,
        "claim_vs_receipt": _claim_vs_receipt_flag(
            focus_label=focus_label,
            official_line=official_line,
            receipt=receipt,
        ),
        "institutional_stress": str(base_flags.get("institutional_stress") or ""),
        "beneficiary": str(base_flags.get("beneficiary") or ""),
        "cost_bearer": str(base_flags.get("cost_bearer") or ""),
        "evidence_strength": _evidence_strength_flag(
            source_count=source_count,
            avg_quality=avg_quality,
            freshest_age_days=freshest_age_days,
            role_counts=role_counts,
        ),
    }


def _argument_spine(
    *,
    selected_angle: str,
    why_now: str,
    receipt: dict[str, object] | None,
    dialectic: dict[str, str],
    analysis_flags: dict[str, str],
) -> list[str]:
    receipt_outlet = _clean_line((receipt or {}).get("outlet"))
    receipt_title = _clean_line((receipt or {}).get("title"))
    lead_receipt = ""
    if receipt_outlet and receipt_title:
        lead_receipt = f"Put {receipt_outlet} and '{receipt_title}' on the page as the lead receipt."
    elif receipt_title:
        lead_receipt = f"Put '{receipt_title}' on the page as the lead receipt."

    beats = _dedupe_clean(
        [
            f"Open on '{selected_angle}' and make the why-now concrete: {why_now}",
            lead_receipt,
            str(analysis_flags.get("claim_vs_receipt") or ""),
            "Name the stress point and tell: "
            f"{analysis_flags.get('institutional_stress') or ''}. "
            f"The lane is the {analysis_flags.get('tell_kind') or 'pressure point'}.",
            "Spell out the power trade: "
            f"beneficiary is {analysis_flags.get('beneficiary') or 'still obscured'}, "
            f"cost lands on {analysis_flags.get('cost_bearer') or 'whoever gets stuck with the fallout'}.",
            str(dialectic.get("gold_thread") or dialectic.get("synthesis") or dialectic.get("writer_north_star") or ""),
        ],
        minimum_len=18,
        limit=6,
    )
    return beats


def _dialectic_map(
    *,
    focus_label: str,
    selected_angle: str,
    why_now: str,
    pattern: str,
    source_roles: list[dict[str, object]],
    official_line: dict[str, object] | None,
    receipt: dict[str, object] | None,
    role_counts: Counter[str],
    trend_title: str,
) -> dict[str, str]:
    thread_kind = _thread_kind_key(
        focus_label=focus_label,
        source_roles=source_roles,
        trend_title=trend_title,
        role_counts=role_counts,
    )
    thread_kind_label = THREAD_KIND_LABELS.get(thread_kind, "pressure point")
    thesis = selected_angle or pattern or focus_label
    counterforce = _counterforce_statement(
        official_line=official_line,
        receipt=receipt,
        role_counts=role_counts,
        focus_label=focus_label,
    )
    synthesis = _synthesis_statement(
        focus_label=focus_label,
        thread_kind_label=thread_kind_label,
        why_now=why_now,
        pattern=pattern,
    )
    gold_thread = _gold_thread_statement(
        focus_label=focus_label,
        thread_kind_label=thread_kind_label,
        receipt=receipt,
        official_line=official_line,
    )
    return {
        "thesis": thesis,
        "counterforce": counterforce,
        "synthesis": synthesis,
        "gold_thread": gold_thread,
        "thread_kind": thread_kind,
        "thread_kind_label": thread_kind_label,
        "writer_north_star": _writer_north_star(
            thesis=thesis,
            thread_kind_label=thread_kind_label,
            counterforce=counterforce,
        ),
    }


def _open_loops(
    *,
    focus_label: str,
    recent_entries: list[dict[str, object]],
    role_counts: Counter[str],
    gold_thread: str = "",
) -> list[str]:
    loops = []
    if recent_entries:
        loops.append(f"Name what changed since '{_clean_line(recent_entries[0].get('title'))}'.")
    if role_counts.get("official_line"):
        loops.append("Keep the claim-versus-receipt gap visible.")
    if role_counts.get("fallout_signal"):
        loops.append("Widen the story into consequence, not just contradiction.")
    if role_counts.get("foreign_pressure"):
        loops.append("Translate the live foreign-policy heat into BAT terms without sounding panicked.")
    loops.append("Name who benefits and who absorbs the cost before the close.")
    if gold_thread:
        loops.append(gold_thread)
    loops.append(f"Keep {focus_label.lower()} authored, feminine, and tighter than the spin room language around it.")
    return _dedupe_clean(loops, minimum_len=16, limit=4)


def _tone_topic_fit(
    *,
    focus_label: str,
    tone: dict[str, str],
    source_roles: list[dict[str, object]],
) -> dict[str, object]:
    role_mix = Counter(str(item.get("role") or "context") for item in source_roles)
    return {
        "topic": focus_label,
        "primary_tone": tone.get("primary"),
        "dominant_role": role_mix.most_common(1)[0][0] if role_mix else "context",
        "role_mix": dict(role_mix),
    }


def _serialize_recent_entry(row: EditorialObject) -> dict[str, object]:
    metadata = row.meta or {}
    story_brief = metadata.get("story_brief", {}) if isinstance(metadata, dict) else {}
    launch_packet = metadata.get("launch_packet", {}) if isinstance(metadata, dict) else {}
    created_at = row.created_at if isinstance(row.created_at, datetime) else None
    age_hours = max(0, int((datetime.utcnow() - created_at.replace(tzinfo=None)).total_seconds() // 3600)) if created_at else 0
    return {
        "id": str(row.id),
        "title": _clean_line(row.title),
        "theme_slug": _clean_line(metadata.get("theme_slug") or (story_brief.get("theme_slug") if isinstance(story_brief, dict) else "")),
        "story_form": _clean_line(metadata.get("story_form") or (story_brief.get("story_form") if isinstance(story_brief, dict) else "")),
        "story_mode": _clean_line(metadata.get("story_mode") or (story_brief.get("story_mode") if isinstance(story_brief, dict) else "")),
        "selected_angle": _clean_line(launch_packet.get("selected_angle") if isinstance(launch_packet, dict) else ""),
        "why_now": _clean_line(launch_packet.get("why_now") if isinstance(launch_packet, dict) else ""),
        "created_at": created_at.isoformat() if created_at else None,
        "age_hours": age_hours,
        "time_label": _coverage_time_label(created_at),
    }


async def _recent_editorial_context(
    db: AsyncSession,
    *,
    theme_slug: str = "",
    site_only: bool = False,
    limit: int | None = None,
) -> list[dict[str, object]]:
    rows = (
        await db.execute(
            select(EditorialObject)
            .where(EditorialObject.status.in_(["draft", "approved", "published"]))
            .order_by(EditorialObject.created_at.desc())
            .limit(limit or int(settings.analysis_recent_editorial_limit))
        )
    ).scalars().all()
    serialized = [_serialize_recent_entry(row) for row in rows]
    if site_only:
        return [row for row in serialized if not _clean_line(row.get("theme_slug"))]
    if not theme_slug:
        return serialized
    return [row for row in serialized if _clean_line(row.get("theme_slug")) == _clean_line(theme_slug)]


def _brief_payload(
    retrieval_bundle: dict[str, Any],
    *,
    scope_type: str,
    scope_key: str,
    focus_label: str,
    theme_slug: str,
    recent_entries: list[dict[str, object]],
) -> dict[str, Any]:
    raw_sources = list(retrieval_bundle.get("raw_sources") or [])
    ranked_sources = sorted(raw_sources, key=_source_priority, reverse=True)[: max(2, int(settings.analysis_source_limit))]
    aligned_sources, aligned_source_count, lane_alignment_ratio = _aligned_sources_for_brief(
        ranked_sources,
        focus_label=focus_label,
        theme_slug=theme_slug,
        query_text=_clean_line(retrieval_bundle.get("query_text")),
    )
    ranked_sources = aligned_sources
    role_cards = [
        {
            "title": _clean_line(source.get("title")),
            "outlet": _clean_line(source.get("source_label") or source.get("source_name") or "news desk"),
            "role": _role_from_source(source),
            "role_label": "",
            "tone_fit": "",
            "quality_score": _safe_float(source.get("quality_score")),
            "age_days": source.get("age_days"),
            "source_kind": _clean_line(source.get("source_kind")),
            "credibility_tier": _clean_line(source.get("credibility_tier")),
            "snippet": _clean_line(source.get("snippet")),
            "query_alignment_score": _safe_float(source.get("query_alignment_score")),
        }
        for source in ranked_sources
        if _clean_line(source.get("title"))
    ]
    source_roles = _select_source_roles(
        role_cards,
        scope_type=scope_type,
        focus_label=focus_label,
        theme_slug=theme_slug,
        query_text=_clean_line(retrieval_bundle.get("query_text")),
        limit=max(2, int(settings.analysis_max_source_roles)),
    )
    for item in source_roles:
        role = _clean_line(item.get("role"))
        item["role_label"] = _role_label(role)
        item["tone_fit"] = ROLE_TONE_FIT.get(role, "use as context, not the whole piece")
        item.pop("snippet", None)
        item.pop("query_alignment_score", None)

    provisional_role_counts: Counter[str] = Counter(str(item.get("role") or "context") for item in source_roles)
    provisional_official_line = next(
        (item for item in source_roles if str(item.get("role")) in {"official_line", "spin_cycle"}),
        None,
    )
    provisional_receipt = next(
        (
            item
            for item in source_roles
            if str(item.get("role")) in {"legal_receipt", "core_receipt", "fallout_signal", "foreign_pressure"}
        ),
        source_roles[0] if source_roles else None,
    )
    trend_ledger = list(retrieval_bundle.get("trend_ledger") or [])
    trend_title = _aligned_trend_title(
        trend_ledger,
        focus_label=focus_label,
        theme_slug=theme_slug,
        query_text=_clean_line(retrieval_bundle.get("query_text")),
    )
    recent_titles = [_clean_line(item.get("title")) for item in recent_entries if item.get("title")]
    theme_name = _clean_line(((retrieval_bundle.get("focus_theme") or {}).get("name")) or focus_label)
    freshest_age_days = min((int(source.get("age_days") or 0) for source in raw_sources), default=None)
    freshest_recent_age_hours = min((int(item.get("age_hours") or 10_000) for item in recent_entries), default=None)
    tone = _tone_profile(
        theme_slug=theme_slug,
        recent_lane_count=len(recent_entries),
        role_counts=provisional_role_counts,
    )
    story_targets = _story_targets(
        scope_type=scope_type,
        recent_lane_count=len(recent_entries),
        freshest_age_days=freshest_age_days,
        freshest_recent_age_hours=freshest_recent_age_hours,
    )
    provisional_pattern = _pattern_statement(
        focus_label,
        theme_name=theme_name,
        trend_title=trend_title,
        role_counts=provisional_role_counts,
        official_line=provisional_official_line,
        receipt=provisional_receipt,
    )
    selected_angle = _selected_angle(
        focus_label,
        source_roles=source_roles,
        pattern=provisional_pattern,
        recent_titles=recent_titles,
        query_text=_clean_line(retrieval_bundle.get("query_text")),
        theme_slug=theme_slug,
    )
    source_roles = _coherent_source_roles(
        source_roles,
        selected_angle=selected_angle,
        focus_label=focus_label,
        theme_slug=theme_slug,
        query_text=_clean_line(retrieval_bundle.get("query_text")),
    )
    role_counts = Counter(str(item.get("role") or "context") for item in source_roles)
    official_line = next((item for item in source_roles if str(item.get("role")) in {"official_line", "spin_cycle"}), None)
    receipt = next(
        (
            item
            for item in source_roles
            if _text_fingerprint(item.get("title")) == _text_fingerprint(selected_angle)
            and str(item.get("role")) in {"legal_receipt", "core_receipt", "fallout_signal", "foreign_pressure"}
        ),
        next(
            (
                item
                for item in source_roles
                if str(item.get("role")) in {"legal_receipt", "core_receipt", "fallout_signal", "foreign_pressure"}
            ),
            source_roles[0] if source_roles else None,
        ),
    )
    pattern = _pattern_statement(
        focus_label,
        theme_name=theme_name,
        trend_title=trend_title,
        role_counts=role_counts,
        official_line=official_line,
        receipt=receipt,
    )
    why_now = _why_now_statement(
        focus_label=focus_label,
        selected_angle=selected_angle,
        source_roles=source_roles,
        recent_entries=recent_entries,
        freshest_age_days=freshest_age_days,
    )
    contradiction_core = pattern
    audience_value = _reader_value_statement(focus_label=focus_label, role_counts=role_counts, tone=tone)
    dialectic = _dialectic_map(
        focus_label=focus_label,
        selected_angle=selected_angle,
        why_now=why_now,
        pattern=pattern,
        source_roles=source_roles,
        official_line=official_line,
        receipt=receipt,
        role_counts=role_counts,
        trend_title=trend_title,
    )
    pattern_signals = _dedupe_clean(
        [
            contradiction_core,
            why_now,
            trend_title,
            _clean_line((receipt or {}).get("title")),
            _clean_line((official_line or {}).get("title")),
        ],
        minimum_len=14,
        limit=4,
    )
    open_loops = _open_loops(
        focus_label=focus_label,
        recent_entries=recent_entries,
        role_counts=role_counts,
        gold_thread=str(dialectic.get("gold_thread") or ""),
    )
    social_hooks = _dedupe_clean(
        [
            selected_angle,
            why_now,
            contradiction_core,
            audience_value,
            str(dialectic.get("synthesis") or ""),
            str(dialectic.get("gold_thread") or ""),
            tone.get("short_form") or "",
        ],
        minimum_len=16,
        limit=4,
    )
    avg_quality = round(sum(_safe_float(source.get("quality_score")) for source in raw_sources) / len(raw_sources), 2) if raw_sources else 0.0
    analysis_flags = _analysis_flags(
        focus_label=focus_label,
        thread_kind=str(dialectic.get("thread_kind") or "default"),
        thread_kind_label=str(dialectic.get("thread_kind_label") or "pressure point"),
        official_line=official_line,
        receipt=receipt,
        role_counts=role_counts,
        source_count=len(raw_sources),
        avg_quality=avg_quality,
        freshest_age_days=freshest_age_days,
    )
    argument_spine = _argument_spine(
        selected_angle=selected_angle,
        why_now=why_now,
        receipt=receipt,
        dialectic=dialectic,
        analysis_flags=analysis_flags,
    )
    source_kind_mix = Counter(_clean_line(source.get("source_kind")).lower() or "unknown" for source in raw_sources)
    credibility_mix = Counter(_clean_line(source.get("credibility_tier")).lower() or "unknown" for source in raw_sources)
    tone_fit = _tone_topic_fit(focus_label=focus_label, tone=tone, source_roles=source_roles)
    confidence = min(
        0.98,
        round(
            0.34
            + (min(len(raw_sources), 6) * 0.06)
            + (min(avg_quality, 6.0) * 0.04)
            + (0.08 if freshest_age_days is not None and freshest_age_days <= 1 else 0.0),
            2,
        ),
    )
    if theme_slug:
        confidence = round(min(confidence, 0.55 + (lane_alignment_ratio * 0.43)), 2)
    summary = f"{focus_label}: {contradiction_core} {why_now}".strip()[:420]

    return {
        "scope_type": scope_type,
        "scope_key": scope_key,
        "label": focus_label,
        "title": selected_angle,
        "summary": summary,
        "confidence": confidence,
        "source_count": len(raw_sources),
        "meta": {
            "focus_label": focus_label,
            "theme_slug": theme_slug or None,
            "pattern": pattern,
            "contradiction_core": contradiction_core,
            "why_now": why_now,
            "audience_value": audience_value,
            "tone": tone,
            "story_targets": story_targets,
            "source_roles": source_roles,
            "pattern_signals": pattern_signals,
            "open_loops": open_loops,
            "social_hooks": social_hooks,
            "selected_angle": selected_angle,
            "dialectic": dialectic,
            "analysis_flags": analysis_flags,
            "argument_spine": argument_spine,
            "topic_stats": {
                "source_kind_mix": dict(source_kind_mix),
                "credibility_mix": dict(credibility_mix),
                "avg_quality": avg_quality,
                "freshest_age_days": freshest_age_days,
                "recent_lane_count": len(recent_entries),
                "aligned_source_count": aligned_source_count,
                "lane_alignment_ratio": lane_alignment_ratio,
            },
            "tone_topic_fit": tone_fit,
            "nearby_coverage": recent_entries[:4],
            "retrieval_query": _clean_line(retrieval_bundle.get("query_text")),
            "query_variants": [
                _clean_line(query)
                for query in (retrieval_bundle.get("query_variants") or [])
                if _clean_line(query)
            ],
        },
    }


def _row_to_dict(row: AnalysisBrief) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "scope_type": row.scope_type,
        "scope_key": row.scope_key,
        "status": row.status,
        "label": row.label,
        "title": row.title,
        "summary": row.summary,
        "confidence": _safe_float(row.confidence),
        "source_count": int(row.source_count or 0),
        "updated_at": row.updated_at.isoformat() if isinstance(row.updated_at, datetime) else row.updated_at,
        "created_at": row.created_at.isoformat() if isinstance(row.created_at, datetime) else row.created_at,
        "meta": row.meta or {},
    }


def _apply_brief_payload(row: AnalysisBrief, payload: dict[str, Any]) -> None:
    row.status = "active"
    row.label = payload.get("label")
    row.title = payload.get("title")
    row.summary = payload.get("summary")
    row.confidence = payload.get("confidence") or 0
    row.source_count = int(payload.get("source_count") or 0)
    row.meta = payload.get("meta") or {}
    row.updated_at = datetime.utcnow()


async def _persist_brief(db: AsyncSession, payload: dict[str, Any]) -> AnalysisBrief:
    await ensure_analysis_schema(db)
    row = (
        await db.execute(
            select(AnalysisBrief).where(
                AnalysisBrief.scope_type == payload["scope_type"],
                AnalysisBrief.scope_key == payload["scope_key"],
            )
        )
    ).scalar_one_or_none()
    if row:
        _apply_brief_payload(row, payload)
        await db.commit()
        await db.refresh(row)
        return row

    row = AnalysisBrief(
        scope_type=str(payload.get("scope_type") or "site"),
        scope_key=str(payload.get("scope_key") or slugify_loose(str(payload.get("label") or "analysis"))),
        status="active",
        label=str(payload.get("label") or ""),
        title=str(payload.get("title") or ""),
        summary=str(payload.get("summary") or ""),
        confidence=payload.get("confidence") or 0,
        source_count=int(payload.get("source_count") or 0),
        meta=payload.get("meta") or {},
    )
    db.add(row)
    try:
        await db.commit()
        await db.refresh(row)
        return row
    except IntegrityError:
        await db.rollback()
        row = (
            await db.execute(
                select(AnalysisBrief).where(
                    AnalysisBrief.scope_type == payload["scope_type"],
                    AnalysisBrief.scope_key == payload["scope_key"],
                )
            )
        ).scalar_one_or_none()
        if row is None:
            raise
        _apply_brief_payload(row, payload)
        await db.commit()
        await db.refresh(row)
        return row


async def build_analysis_brief(
    db: AsyncSession,
    *,
    scope_type: str,
    scope_key: str,
    query_text: str,
    theme: Theme | None = None,
) -> dict[str, Any]:
    query_sets = _analysis_query_variants(base_query=query_text, scope_type=scope_type, theme=theme)
    per_query_source_limit = max(3, min(4, int(settings.analysis_source_limit)))
    retrieval_sets: list[dict[str, Any]] = []
    for query_set in query_sets:
        retrieval_sets.append(
            await build_retrieval_bundle(
                db,
                query_text=str(query_set.get("query_text") or query_text),
                theme_slug=theme.slug if theme else None,
                source_limit=per_query_source_limit,
            )
        )
    retrieval_bundle = _merge_retrieval_bundles(
        retrieval_sets,
        query_sets=query_sets,
        source_limit=int(settings.analysis_source_limit),
        trend_limit=int(settings.retrieval_max_trends),
    )
    focus_theme = retrieval_bundle.get("focus_theme") or {}
    theme_slug = _clean_line((theme.slug if theme else None) or focus_theme.get("slug"))
    focus_label = _clean_line((theme.name if theme else None) or focus_theme.get("name") or scope_key.replace("-", " ").title())
    recent_entries = await _recent_editorial_context(
        db,
        theme_slug=theme_slug if scope_type == "theme" else "",
        site_only=scope_type == "site",
    )
    payload = _brief_payload(
        retrieval_bundle,
        scope_type=scope_type,
        scope_key=scope_key,
        focus_label=focus_label,
        theme_slug=theme_slug,
        recent_entries=recent_entries,
    )
    row = await _persist_brief(db, payload)
    brief = _row_to_dict(row)
    log_event(
        logger,
        "analysis.brief_built",
        scope_type=scope_type,
        scope_key=scope_key,
        source_count=brief["source_count"],
        confidence=brief["confidence"],
    )
    return brief


async def refresh_analysis_briefs(
    db: AsyncSession,
    *,
    query_plan: list[str] | None = None,
    directive_queries: list[str] | None = None,
) -> dict[str, Any]:
    await ensure_analysis_schema(db)
    plan = [_clean_line(query) for query in (query_plan or []) if _clean_line(query)]
    directive_plan = [_search_safe_query(query) for query in (directive_queries or []) if _search_safe_query(query)]
    top_themes = (
        await db.execute(select(Theme).order_by(Theme.active_score.desc()).limit(int(settings.analysis_theme_limit)))
    ).scalars().all()
    site_query = next(
        (
            candidate
            for candidate in [_search_safe_query(query) for query in [*directive_plan, *plan]]
            if candidate
        ),
        "",
    )
    if not site_query:
        site_query = (
            next((query for query in plan if query and not _directive_query_is_instructional(query)), "")
            or f"Trump {(top_themes[0].name if top_themes else 'White House')} latest {settings.current_news_min_year}"
        )
    session_isolation = _analysis_supports_isolated_sessions(db)
    theme_concurrency = int(settings.analysis_theme_concurrency) if session_isolation else 1
    brief_failures: list[dict[str, str]] = []
    site_brief: dict[str, Any] = {}
    site_error: str | None = None

    async def _build_site_brief() -> dict[str, Any]:
        return await _run_analysis_session(
            db,
            lambda session: build_analysis_brief(
                session,
                scope_type="site",
                scope_key="sitewide",
                query_text=site_query,
            ),
            isolated=session_isolation,
        )

    site_task: asyncio.Task[dict[str, Any]] | None = None
    if session_isolation:
        site_task = asyncio.create_task(_build_site_brief())
    else:
        try:
            site_brief = await _build_site_brief()
        except Exception as exc:
            site_error = str(exc)
            brief_failures.append({"scope_type": "site", "scope_key": "sitewide", "error": site_error})
            log_event(
                logger,
                "analysis.refresh.site_failed",
                level=40,
                scope_key="sitewide",
                error=site_error,
            )

    theme_specs = list(enumerate(top_themes))

    async def _build_theme_brief(spec: tuple[int, Theme]) -> dict[str, Any]:
        index, theme = spec
        theme_query = _theme_query_from_directives(
            theme,
            directive_queries=directive_plan,
            query_plan=plan,
            index=index,
        )
        return await _run_analysis_session(
            db,
            lambda session: build_analysis_brief(
                session,
                scope_type="theme",
                scope_key=str(theme.slug),
                query_text=theme_query,
                theme=theme,
            ),
            isolated=session_isolation,
        )

    theme_briefs: list[dict[str, Any]] = []
    theme_results = await _gather_limited(
        theme_specs,
        _build_theme_brief,
        limit=theme_concurrency,
        return_exceptions=True,
    )
    for (_, theme), outcome in zip(theme_specs, theme_results, strict=True):
        if isinstance(outcome, Exception):
            error = str(outcome)
            brief_failures.append({"scope_type": "theme", "scope_key": str(theme.slug), "error": error})
            log_event(
                logger,
                "analysis.refresh.theme_failed",
                level=40,
                scope_key=str(theme.slug),
                error=error,
            )
            continue
        theme_briefs.append(outcome)

    if site_task is not None:
        try:
            site_brief = await site_task
        except Exception as exc:
            site_error = str(exc)
            brief_failures.append({"scope_type": "site", "scope_key": "sitewide", "error": site_error})
            log_event(
                logger,
                "analysis.refresh.site_failed",
                level=40,
                scope_key="sitewide",
                error=site_error,
            )

    all_briefs = [brief for brief in [site_brief, *theme_briefs] if brief]
    if not all_briefs:
        raise RuntimeError(site_error or "analysis_refresh_produced_no_briefs")

    tone_distribution = Counter(
        _clean_line(((brief.get("meta") or {}).get("tone") or {}).get("primary")).lower() or "unknown"
        for brief in all_briefs
    )
    role_distribution = Counter(
        _clean_line(role.get("role")).lower() or "context"
        for brief in all_briefs
        for role in ((brief.get("meta") or {}).get("source_roles") or [])
    )
    story_target_distribution = Counter(
        _clean_line(((brief.get("meta") or {}).get("story_targets") or {}).get("long_form")).lower() or "unknown"
        for brief in all_briefs
    )
    summary = {
        "site_brief": site_brief,
        "theme_briefs": theme_briefs,
        "brief_count": len(all_briefs),
        "tone_distribution": dict(tone_distribution),
        "role_distribution": dict(role_distribution),
        "story_target_distribution": dict(story_target_distribution),
        "directive_queries": directive_plan,
        "brief_failure_count": len(brief_failures),
        "brief_failures": brief_failures[:6],
    }
    log_event(logger, "analysis.refresh.completed", **summary)
    return summary


def _theme_query_from_directives(
    theme: Theme,
    *,
    directive_queries: list[str],
    query_plan: list[str],
    index: int,
) -> str:
    theme_name = _clean_line(theme.name)
    theme_slug = _clean_line(theme.slug).replace("-", " ")
    theme_terms = {
        term
        for term in re.findall(r"[a-z0-9]+", f"{theme_name} {theme_slug}".lower())
        if len(term) >= 4
    }
    for candidate in [*directive_queries, *query_plan]:
        normalized = _search_safe_query(candidate) or _clean_line(candidate)
        lowered = normalized.lower()
        if not normalized:
            continue
        if _directive_query_is_instructional(normalized):
            continue
        if theme_name.lower() in lowered or theme_slug.lower() in lowered:
            return _apply_theme_query_hint(normalized, theme)
        candidate_terms = {term for term in re.findall(r"[a-z0-9]+", lowered) if len(term) >= 4}
        if theme_terms and candidate_terms & theme_terms:
            return _apply_theme_query_hint(normalized, theme)

    if directive_queries:
        seed = _search_safe_query(directive_queries[min(index, len(directive_queries) - 1)])
        if theme_name.lower() in seed.lower():
            return _apply_theme_query_hint(seed, theme)
        elif seed:
            combined = f"{theme_name} {seed}".strip()
            return _apply_theme_query_hint(combined, theme)

    return _apply_theme_query_hint(f"Trump {theme_name} latest", theme)


def _trim_brief_for_dashboard(brief: dict[str, Any] | None, *, memory_limit: int) -> dict[str, Any] | None:
    if not brief:
        return brief
    trimmed = dict(brief)
    meta = dict(brief.get("meta") or {})
    for key in ("source_roles", "pattern_signals", "open_loops", "social_hooks", "nearby_coverage"):
        value = meta.get(key)
        if isinstance(value, list):
            meta[key] = value[:memory_limit]
    trimmed["meta"] = meta
    return trimmed


async def select_analysis_brief(
    db: AsyncSession,
    *,
    theme_slug: str | None = None,
    query_text: str = "",
    scope_type: str | None = None,
) -> dict[str, Any] | None:
    await ensure_analysis_schema(db)
    rows = (
        await db.execute(
            select(AnalysisBrief)
            .where(AnalysisBrief.status == "active")
            .order_by(AnalysisBrief.updated_at.desc())
            .limit(int(settings.analysis_max_briefs))
        )
    ).scalars().all()
    briefs = [_row_to_dict(row) for row in rows]
    if not briefs:
        return None

    normalized_scope_type = _clean_line(scope_type).lower()
    if normalized_scope_type:
        scoped_briefs = [
            brief
            for brief in briefs
            if _clean_line(brief.get("scope_type")).lower() == normalized_scope_type
        ]
        if not scoped_briefs:
            return None
        briefs = scoped_briefs

    normalized_theme_slug = _clean_line(theme_slug).lower()
    if normalized_theme_slug:
        for brief in briefs:
            if _clean_line(brief.get("scope_key")).lower() == normalized_theme_slug:
                return brief
            if _clean_line(((brief.get("meta") or {}).get("theme_slug"))).lower() == normalized_theme_slug:
                return brief

    query_terms = {
        term
        for term in re.findall(r"[a-z0-9]+", (query_text or "").lower())
        if len(term) >= 4 and not term.isdigit()
    }
    scored: list[tuple[int, dict[str, Any]]] = []
    for brief in briefs:
        meta = brief.get("meta") or {}
        haystack = " ".join(
            [
                _clean_line(brief.get("label")),
                _clean_line(brief.get("title")),
                _clean_line(brief.get("summary")),
                _clean_line(meta.get("focus_label")),
                _clean_line(meta.get("pattern")),
                _clean_line(meta.get("retrieval_query")),
            ]
        ).lower()
        score = sum(2 for term in query_terms if term in haystack)
        if _clean_line(brief.get("scope_type")).lower() == "site":
            score += 1
        scored.append((score, brief))
    scored.sort(key=lambda item: item[0], reverse=True)
    return scored[0][1] if scored else None


async def get_analysis_overview(db: AsyncSession, limit: int | None = None) -> dict[str, Any]:
    await ensure_analysis_schema(db)
    rows = (
        await db.execute(
            select(AnalysisBrief)
            .where(AnalysisBrief.status == "active")
            .order_by(AnalysisBrief.updated_at.desc())
            .limit(limit or int(settings.analysis_max_briefs))
        )
    ).scalars().all()
    briefs = [_row_to_dict(row) for row in rows]
    site_brief = next((brief for brief in briefs if _clean_line(brief.get("scope_type")).lower() == "site"), None)
    theme_briefs = [brief for brief in briefs if _clean_line(brief.get("scope_type")).lower() == "theme"]
    tone_distribution = Counter(
        _clean_line(((brief.get("meta") or {}).get("tone") or {}).get("primary")).lower() or "unknown"
        for brief in briefs
    )
    topic_distribution = Counter(_clean_line((brief.get("meta") or {}).get("focus_label")).lower() or "unknown" for brief in briefs)
    role_distribution = Counter(
        _clean_line(role.get("role")).lower() or "context"
        for brief in briefs
        for role in ((brief.get("meta") or {}).get("source_roles") or [])
    )
    return {
        "site_brief": site_brief,
        "theme_briefs": theme_briefs,
        "stats": {
            "brief_count": len(briefs),
            "tone_distribution": dict(tone_distribution),
            "topic_distribution": {key: value for key, value in topic_distribution.items() if key != "unknown"},
            "role_distribution": dict(role_distribution),
        },
    }


async def build_analysis_dashboard(
    db: AsyncSession,
    *,
    story_limit: int = 4,
    memory_limit: int = 8,
) -> dict[str, Any]:
    overview = await get_analysis_overview(db, limit=max(int(settings.analysis_max_briefs), story_limit + 2))
    site_brief = _trim_brief_for_dashboard(overview.get("site_brief"), memory_limit=max(1, memory_limit))
    theme_briefs = [
        _trim_brief_for_dashboard(brief, memory_limit=max(1, memory_limit))
        for brief in (overview.get("theme_briefs") or [])
    ][: max(1, story_limit)]
    primary_brief = site_brief or (theme_briefs[0] if theme_briefs else None)
    primary_meta = (primary_brief or {}).get("meta") or {}
    latest_analyst = None
    if primary_brief:
        latest_analyst = {
            "analysis_headline": _clean_line(primary_brief.get("title") or primary_brief.get("label") or "Analysis board live"),
            "pattern_read": _clean_line(primary_meta.get("pattern") or primary_brief.get("summary") or ""),
            "tone_lane": _clean_line(((primary_meta.get("tone") or {}).get("primary")) or ""),
            "topic_tone_map": [
                {
                    "topic": _clean_line((brief.get("meta") or {}).get("focus_label") or brief.get("label") or brief.get("scope_key")),
                    "tone": _clean_line((((brief.get("meta") or {}).get("tone") or {}).get("primary")) or ""),
                    "story_target": _clean_line((((brief.get("meta") or {}).get("story_targets") or {}).get("long_form_label")) or ""),
                }
                for brief in theme_briefs
            ],
        }
    return {
        **overview,
        "site_brief": site_brief,
        "theme_briefs": theme_briefs,
        "latest_analyst": latest_analyst,
        "theme_cards": theme_briefs,
    }


def format_analysis_brief(brief: dict[str, Any] | None) -> str:
    if not brief:
        return "Analysis engine brief:\n- No persisted analysis yet. Use the retrieval facts and stay disciplined."
    meta = brief.get("meta") or {}
    tone = meta.get("tone") or {}
    story_targets = meta.get("story_targets") or {}
    dialectic = meta.get("dialectic") or {}
    analysis_flags = meta.get("analysis_flags") or {}
    lines = ["Analysis engine brief:"]
    if brief.get("label"):
        lines.append(f"- Focus lane: {_clean_line(brief.get('label'))}")
    if brief.get("title"):
        lines.append(f"- Selected angle: {_clean_line(brief.get('title'))}")
    if meta.get("pattern"):
        lines.append(f"- Pattern: {_clean_line(meta.get('pattern'))}")
    if meta.get("contradiction_core"):
        lines.append(f"- Contradiction core: {_clean_line(meta.get('contradiction_core'))}")
    if meta.get("why_now"):
        lines.append(f"- Why now: {_clean_line(meta.get('why_now'))}")
    if tone.get("primary"):
        lines.append(f"- Tone primary: {_clean_line(tone.get('primary'))}")
    if tone.get("long_form"):
        lines.append(f"- Long-form tone: {_clean_line(tone.get('long_form'))}")
    if tone.get("short_form"):
        lines.append(f"- Short-form tone: {_clean_line(tone.get('short_form'))}")
    if story_targets.get("long_form_label"):
        lines.append(f"- Long-form target: {_clean_line(story_targets.get('long_form_label'))}")
    if story_targets.get("short_form"):
        lines.append(f"- Short-form target: {_clean_line(story_targets.get('short_form'))}")
    if dialectic.get("thesis"):
        lines.append(f"- Thesis to prove: {_clean_line(dialectic.get('thesis'))}")
    if dialectic.get("counterforce"):
        lines.append(f"- Counterforce: {_clean_line(dialectic.get('counterforce'))}")
    if dialectic.get("synthesis"):
        lines.append(f"- Synthesis to land: {_clean_line(dialectic.get('synthesis'))}")
    if dialectic.get("gold_thread"):
        lines.append(f"- Gold thread: {_clean_line(dialectic.get('gold_thread'))}")
    if analysis_flags.get("tell_kind"):
        lines.append(f"- Tell kind: {_clean_line(analysis_flags.get('tell_kind'))}")
    if analysis_flags.get("claim_vs_receipt"):
        lines.append(f"- Claim vs receipt: {_clean_line(analysis_flags.get('claim_vs_receipt'))}")
    if analysis_flags.get("institutional_stress"):
        lines.append(f"- Institutional stress: {_clean_line(analysis_flags.get('institutional_stress'))}")
    if analysis_flags.get("beneficiary"):
        lines.append(f"- Beneficiary: {_clean_line(analysis_flags.get('beneficiary'))}")
    if analysis_flags.get("cost_bearer"):
        lines.append(f"- Cost bearer: {_clean_line(analysis_flags.get('cost_bearer'))}")
    if analysis_flags.get("evidence_strength"):
        lines.append(f"- Evidence strength: {_clean_line(analysis_flags.get('evidence_strength'))}")
    for signal in (meta.get("pattern_signals") or [])[:3]:
        lines.append(f"- Pattern signal: {_clean_line(signal)}")
    for role in (meta.get("source_roles") or [])[:3]:
        lines.append(
            "- Link role: "
            f"{_clean_line(role.get('role_label'))} via {_clean_line(role.get('outlet'))} "
            f"({ROLE_TONE_FIT.get(_clean_line(role.get('role')), _clean_line(role.get('tone_fit')))})"
        )
    for loop in (meta.get("open_loops") or [])[:3]:
        lines.append(f"- Open loop: {_clean_line(loop)}")
    for beat in (meta.get("argument_spine") or [])[:4]:
        lines.append(f"- Paragraph job: {_clean_line(beat)}")
    return "\n".join(lines)
