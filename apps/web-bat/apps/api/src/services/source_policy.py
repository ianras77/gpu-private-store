from __future__ import annotations

from datetime import datetime, timedelta, timezone
import re
from typing import Any
from urllib.parse import urlparse

from dateutil import parser as date_parser

from config import settings
from models import Source

ISO_DATE_RE = re.compile(r"\b\d{4}-\d{2}-\d{2}(?:[T ][0-9:.+-Z]+)?\b")
SLASH_DATE_RE = re.compile(r"\b\d{4}/\d{1,2}/\d{1,2}\b|\b\d{1,2}/\d{1,2}/\d{2,4}\b")
MONTH_DATE_RE = re.compile(
    r"\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|"
    r"sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2},\s+\d{4}\b",
    flags=re.IGNORECASE,
)
RELATIVE_DATE_RE = re.compile(
    r"\b(?:(?P<count>\d+)\s+(?P<unit>minute|hour|day|week)s?\s+ago|(?P<label>today|yesterday))\b",
    flags=re.IGNORECASE,
)
TRUMP_TIGHT_SIGNALS = (
    "trump",
    "donald trump",
    "maga",
    "white house",
)
BAT_POWER_SIGNALS = (
    "trump",
    "donald trump",
    "maga",
    "white house",
    "administration",
    "president",
    "pentagon",
    "state department",
    "national security",
    "congress",
    "senate",
    "house",
    "gop",
    "republican",
    "cabinet",
    "justice department",
    "doj",
    "homeland security",
    "ice",
)
BAT_FOREIGN_POLICY_SIGNALS = (
    "iran",
    "tehran",
    "israel",
    "israeli",
    "gaza",
    "middle east",
    "strait of hormuz",
    "oil prices",
    "missile",
    "strike",
    "airstrike",
    "ceasefire",
    "retaliation",
    "military",
    "troops",
    "nuclear",
    "diplomacy",
)
BAT_INSTITUTIONAL_STRESS_SIGNALS = (
    "court",
    "courts",
    "judge",
    "judges",
    "injunction",
    "lawsuit",
    "appeal",
    "filing",
    "executive order",
    "order",
    "federal agency",
    "justice department",
    "doj",
    "homeland security",
    "ice",
    "deportation",
    "immigration",
    "tariff",
    "trade",
    "backlash",
    "ethics",
    "watchdog",
    "inspector general",
    "donor",
    "lobbyist",
    "conflict of interest",
    "cabinet",
    "congress",
    "senate",
    "house",
)
HIGH_CREDIBILITY_HOSTS = {
    "apnews.com",
    "reuters.com",
    "nytimes.com",
    "washingtonpost.com",
    "wsj.com",
    "bbc.com",
    "bbc.co.uk",
    "npr.org",
    "abcnews.go.com",
    "abcnews.com",
    "nbcnews.com",
    "cbsnews.com",
    "cnn.com",
    "politico.com",
    "propublica.org",
    "usatoday.com",
    "theguardian.com",
    "bloomberg.com",
    "time.com",
    "theatlantic.com",
}
HOST_LABEL_OVERRIDES = {
    "apnews.com": "AP News",
    "reuters.com": "Reuters",
    "nytimes.com": "The New York Times",
    "washingtonpost.com": "The Washington Post",
    "wsj.com": "The Wall Street Journal",
    "bbc.com": "BBC",
    "bbc.co.uk": "BBC",
    "npr.org": "NPR",
    "abcnews.go.com": "ABC News",
    "abcnews.com": "ABC News",
    "nbcnews.com": "NBC News",
    "cbsnews.com": "CBS News",
    "cnn.com": "CNN",
    "politico.com": "POLITICO",
    "propublica.org": "ProPublica",
    "usatoday.com": "USA Today",
    "theguardian.com": "The Guardian",
    "bloomberg.com": "Bloomberg",
    "time.com": "TIME",
    "theatlantic.com": "The Atlantic",
    "newrepublic.com": "The New Republic",
    "arkansasonline.com": "Arkansas Online",
    "foxnews.com": "Fox News",
    "washingtonexaminer.com": "Washington Examiner",
    "ag.ny.gov": "New York AG",
    "atg.wa.gov": "Washington AG",
    "ballotpedia.org": "Ballotpedia",
    "wikipedia.org": "Wikipedia",
    "reddit.com": "Reddit",
    "facebook.com": "Facebook",
    "x.com": "X",
    "twitter.com": "X",
}
REFERENCE_HOST_MARKERS = (
    "ballotpedia",
    "wikipedia",
    "britannica",
    "quickonomics",
    "investopedia",
    "dictionary",
)
FORUM_HOST_MARKERS = (
    "reddit",
    "forum",
)
SOCIAL_HOST_MARKERS = (
    "facebook",
    "instagram",
    "tiktok",
    "x.com",
    "twitter.com",
    "truthsocial",
    "youtube.com",
)
FUNDAMENTAL_VIEW_MARKERS = (
    "analysis",
    "explainer",
    "opinion",
    "column",
    "essay",
    "interview",
    "profile",
    "guide",
    "constitutional",
    "constitution",
    "court order",
    "court orders",
    "what courts can do",
    "history",
)
PLACEHOLDER_MARKERS = (
    "draft pending source refresh",
    "current retrieval context does not contain enough high-quality grounded sources",
)
PROMPT_LEAK_MARKERS = (
    "use velvet hammer",
    "output labels required",
    "3 tight paragraphs",
    "must have 3 short paragraphs",
    "forbidden phrases",
    "paragraph 1 should",
    "paragraph 2 should",
    "paragraph 3 should",
    "must avoid",
    "style constraints",
    "story brief",
    "analysis engine brief",
    "continuity note",
    "voice blueprint override",
    "analysis directive",
    "recurring pattern bucket",
    "a nearby bat piece already ran",
    "the site was already on this lane",
)
STANDALONE_DATEISH_RE = re.compile(
    r"^\s*(?:"
    r"\d{4}-\d{2}-\d{2}(?:[T ][0-9:.+-Z]+)?|"
    r"\d{4}/\d{1,2}/\d{1,2}|"
    r"\d{1,2}/\d{1,2}/\d{2,4}|"
    r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|"
    r"sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2},\s+\d{4}|"
    r"(?:\d+\s+(?:minute|hour|day|week)s?\s+ago)|today|yesterday"
    r")\s*$",
    flags=re.IGNORECASE,
)


def source_host(value: str | None) -> str:
    raw = (value or "").strip().lower()
    if not raw:
        return ""
    if "://" not in raw and "/" not in raw:
        return raw.removeprefix("www.")
    return (urlparse(raw).netloc or "").lower().removeprefix("www.")


def source_kind(value: str | None) -> str:
    host = source_host(value)
    if not host:
        return "other"
    if host.endswith(".gov"):
        return "institutional"
    if any(marker in host for marker in SOCIAL_HOST_MARKERS):
        return "social"
    if any(marker in host for marker in FORUM_HOST_MARKERS):
        return "forum"
    if any(marker in host for marker in REFERENCE_HOST_MARKERS):
        return "reference"
    if host.endswith(".edu") or "court" in host:
        return "institutional"
    return "reporting"


def source_label(value: str | None, fallback: str | None = None) -> str:
    host = source_host(value)
    if host in HOST_LABEL_OVERRIDES:
        return HOST_LABEL_OVERRIDES[host]

    if host:
        parts = host.split(".")
        if len(parts) >= 2:
            root = parts[-2]
        else:
            root = parts[0]
        root = root.replace("-", " ").strip()
        if root:
            return " ".join(piece.capitalize() for piece in root.split())

    cleaned_fallback = (fallback or "").strip()
    return cleaned_fallback or "News Desk"


def _normalize_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return _normalize_datetime(value)
    try:
        return _normalize_datetime(date_parser.parse(str(value)))
    except (TypeError, ValueError, OverflowError):
        return None


def _extract_relative_datetime(text: str) -> datetime | None:
    match = RELATIVE_DATE_RE.search(text or "")
    if not match:
        return None

    now = datetime.now(timezone.utc)
    label = (match.group("label") or "").lower()
    if label == "today":
        return now
    if label == "yesterday":
        return now - timedelta(days=1)

    count = int(match.group("count") or 0)
    unit = (match.group("unit") or "").lower()
    if count <= 0:
        return None
    if unit == "minute":
        return now - timedelta(minutes=count)
    if unit == "hour":
        return now - timedelta(hours=count)
    if unit == "day":
        return now - timedelta(days=count)
    if unit == "week":
        return now - timedelta(weeks=count)
    return None


def extract_datetime_from_text(*values: str | None) -> datetime | None:
    for raw in values:
        text = (raw or "").strip()
        if not text:
            continue

        relative = _extract_relative_datetime(text)
        if relative is not None:
            return relative

        if STANDALONE_DATEISH_RE.match(text):
            direct = parse_datetime(text)
            if direct is not None:
                return direct

        for pattern in (ISO_DATE_RE, SLASH_DATE_RE, MONTH_DATE_RE):
            match = pattern.search(text)
            if not match:
                continue
            parsed = parse_datetime(match.group(0))
            if parsed is not None:
                return parsed
    return None


def age_days_from_datetime(value: datetime | None) -> int | None:
    resolved = _normalize_datetime(value)
    if resolved is None:
        return None
    delta_seconds = (datetime.now(timezone.utc) - resolved).total_seconds()
    return max(0, int(delta_seconds // 86400))


def combined_text(*values: str | None) -> str:
    return " ".join(part.strip() for part in values if isinstance(part, str) and part.strip())


def _contains_signal(text: str, signal: str) -> bool:
    normalized = re.sub(r"\s+", " ", signal.strip().lower())
    if not normalized:
        return False
    pattern = r"(?<![a-z0-9])" + re.escape(normalized).replace(r"\ ", r"\s+") + r"(?![a-z0-9])"
    return bool(re.search(pattern, text))


def has_trump_focus(*values: str | None) -> bool:
    return has_bat_focus(*values)


def has_bat_focus(*values: str | None) -> bool:
    lowered = combined_text(*values).lower()
    if any(_contains_signal(lowered, signal) for signal in TRUMP_TIGHT_SIGNALS):
        return True

    has_power = any(_contains_signal(lowered, signal) for signal in BAT_POWER_SIGNALS)
    has_foreign_policy = any(_contains_signal(lowered, signal) for signal in BAT_FOREIGN_POLICY_SIGNALS)
    has_institutional_stress = any(_contains_signal(lowered, signal) for signal in BAT_INSTITUTIONAL_STRESS_SIGNALS)
    return has_power and (has_foreign_policy or has_institutional_stress)


def looks_like_fundamental_view(*values: str | None) -> bool:
    lowered = combined_text(*values).lower()
    return any(marker in lowered for marker in FUNDAMENTAL_VIEW_MARKERS)


def contains_prompt_leak(*values: str | None) -> bool:
    lowered = combined_text(*values).lower()
    return any(marker in lowered for marker in PROMPT_LEAK_MARKERS)


def editorial_looks_placeholder(title: str | None, body: str | None) -> bool:
    lowered = combined_text(title, body).lower()
    if any(marker in lowered for marker in PLACEHOLDER_MARKERS):
        return True
    if contains_prompt_leak(title, body):
        return True
    return False


def current_news_assessment(
    *,
    query_text: str | None = None,
    title: str | None,
    snippet: str | None,
    raw_text: str | None,
    published_hint: Any = None,
    published_at: datetime | None = None,
    quality_score: float = 0.0,
    credibility_tier: str | None = None,
    fallback_dt: datetime | None = None,
) -> dict[str, Any]:
    explicit_dt = (
        parse_datetime(published_at)
        or parse_datetime(published_hint)
        or extract_datetime_from_text(snippet, title, (raw_text or "")[:600])
    )
    resolved_dt = explicit_dt or _normalize_datetime(fallback_dt)
    age_days = age_days_from_datetime(resolved_dt)
    year = resolved_dt.year if resolved_dt is not None else None
    bat_focus = has_bat_focus(query_text, title, snippet, raw_text)
    credibility = str(credibility_tier or "").lower()
    explicit_quality_floor = float(settings.current_news_explicit_min_quality_score)
    if credibility == "low":
        explicit_quality_floor = max(explicit_quality_floor, float(settings.current_news_explicit_min_quality_score) + 0.8)

    explicit_pass = bool(
        bat_focus
        and explicit_dt is not None
        and year is not None
        and year >= int(settings.current_news_min_year)
        and age_days is not None
        and age_days <= int(settings.current_news_max_age_days)
        and quality_score >= explicit_quality_floor
    )
    # "Tight by time" means we only treat a source as current news when we can
    # ground recency in an explicit published date or relative date expression.
    undated_pass = bool(
        bat_focus
        and explicit_dt is None
        and resolved_dt is not None
        and age_days is not None
        and age_days <= int(settings.current_news_max_age_days)
        and credibility == "high"
        and quality_score >= float(settings.current_news_undated_min_quality_score)
    )
    current_news_eligible = explicit_pass or undated_pass
    recency_mode = (
        "explicit"
        if explicit_dt is not None
        else ("undated_fallback" if undated_pass else ("fetched_fallback" if resolved_dt is not None else "missing"))
    )

    fundamental_view_candidate = bool(
        bat_focus
        and resolved_dt is not None
        and year is not None
        and year < int(settings.current_news_min_year)
        and credibility == "high"
        and quality_score >= float(settings.fundamental_view_min_quality_score)
        and looks_like_fundamental_view(title, snippet, raw_text)
    )

    return {
        "resolved_at": resolved_dt,
        "published_year": year,
        "age_days": age_days,
        "recency_mode": recency_mode,
        "bat_focus": bat_focus,
        "trump_focus": bat_focus,
        "current_news_eligible": current_news_eligible,
        "fundamental_view_candidate": fundamental_view_candidate,
    }


def source_current_news_assessment(source: Source) -> dict[str, Any]:
    metadata = source.meta or {}
    quality_score = float(metadata.get("quality_score") or 0)
    credibility_tier = str(metadata.get("credibility_tier") or "")
    host = source_host(source.canonical_url or source.source_url or "")
    query_text = str(metadata.get("query_original") or metadata.get("query") or "")
    assessment = current_news_assessment(
        query_text=query_text,
        title=source.title,
        snippet=str(metadata.get("search_snippet") or ""),
        raw_text=source.raw_text,
        published_hint=metadata.get("published_hint"),
        published_at=source.published_at,
        quality_score=quality_score,
        credibility_tier=credibility_tier,
        fallback_dt=source.fetched_at,
    )
    return {
        **assessment,
        "quality_score": quality_score,
        "credibility_tier": credibility_tier,
        "source_kind": str(metadata.get("source_kind") or source_kind(host)),
        "source_host": host,
        "source_label": str(metadata.get("source_host_label") or source_label(host) or source.source_name or "News Desk"),
    }
