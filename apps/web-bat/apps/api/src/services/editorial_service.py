from collections import Counter
from datetime import datetime, timedelta, timezone
import re
from typing import Any
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models import EditorialObject, HomepageSnapshot, SocialPost, Source, Theme, VoiceMemory
from services.analysis_engine import _merge_retrieval_bundles, build_analysis_brief, select_analysis_brief
from services.cat_client import generate_with_cat, load_prompt
from services.retrieval_service import build_retrieval_bundle
from services.revision_service import record_revision
from services.source_policy import contains_prompt_leak, editorial_looks_placeholder, has_trump_focus, source_current_news_assessment
from services.structured_logging import get_logger, log_event
from utils import slugify_loose

logger = get_logger("bat.editorial")

PUBLIC_GROUNDING_NOTE = "AI-assisted analysis grounded in linked source reporting."
SYSTEM_SETTING_MEMORY_TYPE = "system_setting"
SYSTEM_SETTING_DIRECT_PUBLISH = "direct_publish"
SYSTEM_SETTING_X_LIVE_POSTING = "x_live_posting"
SYSTEM_SETTING_X_RESEARCH_ENABLED = "x_research_enabled"
PRIMARY_ENTRY_KEY = "primary"

SECTION_LABEL_RE = re.compile(
    r"^\*{0,2}\s*(headline|title|dek|summary|lede|lead|paragraph\s*\d+|pattern signals?)\s*\*{0,2}\s*:?\s*(.*)$",
    flags=re.IGNORECASE,
)
SOCIAL_VARIANT_RE = re.compile(r"^\*{0,2}\s*(x_short|x_long|thread(?:_\d+)?)\s*\*{0,2}\s*:\s*(.+)$", flags=re.IGNORECASE)
MARKDOWN_DECORATION_RE = re.compile(r"[*_`]+")
WHITESPACE_RE = re.compile(r"\s+")
QUOTE_EDGE_CHARS = "\"'`“”‘’* "
FALLBACK_TITLE_BY_TYPE = {
    "lead_story": "Lead Story Draft",
    "theme_take": "Theme Take Draft",
}
STYLE_THRESHOLD_BY_LANE = {
    "editorial": 68,
    "social": 62,
    "live_social": 64,
}
STYLE_POLITICAL_SIGNALS = (
    "trump",
    "white house",
    "administration",
    "maga",
    "gop",
    "republican",
    "cabinet",
    "congress",
    "court",
    "order",
    "filing",
    "injunction",
)
STYLE_HARD_FAIL_PATTERNS = [
    re.compile(r"\bin a world where\b", flags=re.IGNORECASE),
    re.compile(r"\bthis satire\b", flags=re.IGNORECASE),
    re.compile(r"\babsurdities and contradictions\b", flags=re.IGNORECASE),
    re.compile(r"^\*{0,2}\s*x_(?:short|long)\s*\*{0,2}\s*:\s*$", flags=re.IGNORECASE | re.MULTILINE),
    re.compile(r"^\*{0,2}\s*thread_\d+\s*\*{0,2}\s*:\s*$", flags=re.IGNORECASE | re.MULTILINE),
    re.compile(
        r"\b(output labels required|sources are minimal|we need|we must|no stock intro phrasing|must be grounded in sources)\b",
        flags=re.IGNORECASE,
    ),
]
STYLE_SOFT_FAIL_PATTERNS = [
    re.compile(r"\bit is clear that\b", flags=re.IGNORECASE),
    re.compile(r"\bin a move that\b", flags=re.IGNORECASE),
    re.compile(r"\bhas sparked\b", flags=re.IGNORECASE),
    re.compile(r"\bperfect storm\b", flags=re.IGNORECASE),
    re.compile(r"\bthe pattern is clear\b", flags=re.IGNORECASE),
    re.compile(r"\bthe contradiction is stark\b", flags=re.IGNORECASE),
    re.compile(r"\bthe stakes are high\b", flags=re.IGNORECASE),
    re.compile(r"\bthe fallout is clear\b", flags=re.IGNORECASE),
    re.compile(r"\bbridges and power plants\b", flags=re.IGNORECASE),
    re.compile(r"\belection experts are confused\b", flags=re.IGNORECASE),
]
GENERIC_EDITORIAL_FILLER_MARKERS = (
    "not just a political flourish",
    "latest chapter in",
    "sobering reminder",
    "active participant in the drama",
    "latest nail in the coffin",
    "latest blow in a series",
    "in a nutshell",
    "sharper turn than the last headline cycle",
)
EDITORIAL_META_QUERY_PREFIX_RE = re.compile(r"^(?:prefer|surface|translate|use|open|sound|let)\b", flags=re.IGNORECASE)
EDITORIAL_META_QUERY_PHRASES = (
    "prefer sources with documents",
    "documents, filings, transcripts",
    "direct quotes",
    "who benefits",
    "absorbs the risk",
    "what makes this story distinct",
    "yesterday's outrage cycle",
)
VOICE_POLISH_REPLACEMENTS = (
    (re.compile(r"\bin a world where\b", flags=re.IGNORECASE), "In plain terms,"),
    (re.compile(r"\bit is clear that\b", flags=re.IGNORECASE), "the record shows"),
    (re.compile(r"\bin a move that\b", flags=re.IGNORECASE), "when"),
    (re.compile(r"\bhas sparked\b", flags=re.IGNORECASE), "has triggered"),
    (re.compile(r"\bthis satire\b", flags=re.IGNORECASE), "this analysis"),
    (re.compile(r"\babsurdities and contradictions\b", flags=re.IGNORECASE), "the contradiction"),
    (re.compile(r"\bcaught between a rock and a hard place\b", flags=re.IGNORECASE), "boxed in by its own filings"),
    (re.compile(r"\bperfect storm\b", flags=re.IGNORECASE), "hard collision"),
    (re.compile(r"^\s*we need to (produce|craft)\b[^.\n]*[.:]?\s*", flags=re.IGNORECASE), ""),
    (re.compile(r"^\s*the sources are minimal:?\s*", flags=re.IGNORECASE), ""),
    (re.compile(r"^\s*we must ground claims in source:?\s*", flags=re.IGNORECASE), ""),
)
EDITORIAL_META_SECTION_MARKERS = (
    "writer packet",
    "story brief",
    "analysis engine brief",
    "assigned structure",
    "repetition guard",
    "launch packet",
    "voice state",
    "voice blueprint override",
    "analysis directive",
    "theme focus",
    "focus theme",
    "priority evidence deck",
    "theme memory",
    "trend ledger",
    "angle card",
    "receipts to use",
    "pressure points",
    "non-public memory",
    "social card",
    "evidence lines",
    "story signal",
)
EDITORIAL_META_LINE_MARKERS = (
    "theme lane:",
    "file this as:",
    "story form label:",
    "focus lane:",
    "angle to advance:",
    "angle:",
    "selected angle:",
    "analysis summary:",
    "contradiction core:",
    "contradiction to expose:",
    "contradiction to puncture:",
    "why now:",
    "why now in plain english:",
    "freshest evidence:",
    "stakes for readers:",
    "trend signal:",
    "reader value:",
    "pattern underneath it:",
    "pattern to reveal:",
    "continuity note:",
    "continuation point:",
    "source mix:",
    "tone primary:",
    "tone guide:",
    "analysis target:",
    "target length:",
    "target words:",
    "form instruction:",
    "movement note:",
    "paragraph movement:",
    "body paragraphs:",
    "recent angle on site:",
    "recent bat move to advance, not restate:",
    "avoid bat phrase:",
    "retire this stale site phrase:",
    "social hook:",
    "open loop:",
    "thread worth pulling:",
    "thread to extend:",
    "link role:",
    "query spine:",
    "fresh trigger:",
    "angle shift:",
    "keep watching:",
    "voice pressure:",
    "live vibe from editor:",
    "quote-card line in orbit:",
    "hook worth stealing from yourself:",
    "body beat:",
)
EDITORIAL_META_PHRASE_MARKERS = (
    "recurring pattern bucket:",
    "a nearby bat piece already ran",
    "the site was already on this lane",
    "bat moved from '",
    "treat this as the next site note",
    "this should read like the next site note",
    "not a reset button",
    "story brief",
    "analysis engine brief",
    "voice blueprint override",
    "analysis directive",
)
INTERNAL_PROCESS_LINE_MARKERS = (
    "the site was already on this lane",
    "a nearby bat piece already ran",
    "a bat piece already touched this",
    "this lane already ran",
    "advance the thread instead of replaying",
    "advance the thought process",
    "the site was already on this lane earlier today",
    "bat moved from '",
)
PUBLIC_PACKET_META_MARKERS = (
    "moved the lane from",
    "deserves a cleaner second look",
    "put the freshest receipt on the board",
    "put a fresher receipt on the board",
    "gives this lane a sharper turn",
    "generic recap",
    "next pass worth doing",
)
ANGLE_REJECT_MARKERS = (
    "ballotpedia",
    "wikipedia",
    "reddit",
    "startpage",
    "brave",
    "bing",
    "google news",
)
LOW_SIGNAL_TITLE_MARKERS = (
    "top stories",
    "cartoons",
    "commentary",
    "price chart",
    "price today",
    "prices today",
    "oil price",
    "periodic reviews",
    "primary results",
    "definition, history",
    "definition",
    "history, & beliefs",
)
EDITORIAL_QUERY_STOPWORDS = {
    "2024",
    "2025",
    "2026",
    "2027",
    "analysis",
    "administration",
    "donald",
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
GROUNDING_PERSON_NAME_RE = re.compile(r"\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,2}\b")
GROUNDING_NUMERIC_RE = re.compile(
    r"\$[\d.,]+(?:\s?(?:trillion|billion|million))?"
    r"|\b\d+(?:\.\d+)?\s?(?:percent|%)\b"
    r"|\b20\d{2}\b"
)
GROUNDING_DATE_RE = re.compile(
    r"\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,\s*20\d{2})?\b"
)
GROUNDING_QUOTE_RE = re.compile(r"[\"“”]([^\"“”]{18,180})[\"“”]")
GROUNDING_PERSON_NAME_STOPWORDS = {
    "Administration",
    "American",
    "Associated",
    "Budget",
    "Catholic",
    "Chief",
    "Church",
    "Congress",
    "Congressional",
    "Court",
    "Director",
    "House",
    "Iran",
    "Justice",
    "March",
    "News",
    "Office",
    "Pentagon",
    "Reuters",
    "States",
    "Trump",
    "United",
    "War",
    "White",
    "World",
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
EDITORIAL_FOREIGN_POLICY_MARKERS = (
    "iran",
    "tehran",
    "middle east",
    "israel",
    "gaza",
    "war",
    "war powers",
    "strike",
    "airstrike",
    "missile",
    "retaliation",
    "ceasefire",
    "oil",
    "hormuz",
    "pentagon",
    "troops",
    "nuclear",
    "sanctions",
)
SHOWCASE_SOURCE_KINDS = {"reporting", "institutional"}
OUTLET_SUFFIX_RE = re.compile(
    r"\s*(?:\||-|:)\s*(AP News|Associated Press|Reuters|The New York Times|The Washington Post|POLITICO|NBC News|ABC News|CBS News|CNN|NPR|BBC|Bloomberg|TIME|USA Today|The Guardian)\s*$",
    flags=re.IGNORECASE,
)
PROMPTISH_META_MARKERS = (
    "x_short",
    "x_long",
    "thread",
    "post",
    "tweet",
    "reply",
    "caption",
    "paragraph",
    "receipt",
    "receipts",
    "sharp line",
    "quote card",
    "quote-card",
    "hook",
    "hooks",
    "reading-room",
    "output exactly",
    "label only",
    "story brief",
)
PROMPTISH_START_RE = re.compile(
    r"^\s*(?:we need|we must|you are|task prompt|must be grounded in sources|no stock intro phrasing|output labels required|write|create|draft|make|generate|produce|compose|build|give me|turn this into|keep|use|include)\b",
    flags=re.IGNORECASE,
)
DIRECTIVEISH_START_RE = re.compile(
    r"^\s*(?:write|create|draft|make|generate|compose|build|give me|turn this into|keep|use|include|lead with|focus on|center|anchor)\b",
    flags=re.IGNORECASE,
)
LEADING_SENTENCE_RE = re.compile(r"^\s*([^.!?\n]+[.!?]+)\s*(.*)$", flags=re.S)
PROMPT_TOPIC_RE = re.compile(r"\b(?:about|on|regarding|around|re)\s+([^.!?\n]+)", flags=re.IGNORECASE)
PROMPT_TOPIC_TAIL_RE = re.compile(
    r"\s+(?:with|using|plus|keep|include|featuring|and keep)\s+(?:one|two|three|a|an)\s+"
    r"(?:concrete\s+)?(?:receipt|receipts|line|lines|quote|quotes|hook|hooks|thread|threads|post|posts|reply|replies|caption|captions)\b.*$",
    flags=re.IGNORECASE,
)
ANGLE_PREFIX_RE = re.compile(
    r"^(?:live updates?:|analysis:|watch live:|latest:|breaking:|opinion:)\s*",
    flags=re.IGNORECASE,
)
RECENT_COVERAGE_LOOKBACK_HOURS = 36
RECENT_COVERAGE_LIMIT = 12
NOISY_MEMORY_MARKERS = (
    "260 chars max",
    "max 260 chars",
    "must be dispatch",
    "dispatch:",
    "something like:",
    "should be like dispatch",
    "count chars",
    "blondesagainsttrump briefing",
)
STALE_SITE_PHRASES = (
    "fresh reporting in the last 24 hours keeps this contradiction live enough to hit hard",
    "the reporting is still warm, which means the angle is moving instead of archival",
    "the pattern is clear",
    "the contradiction is stark",
    "the fallout is clear",
    "bridges and power plants",
    "election experts are confused",
    "the only thing ending is his credibility",
    "when the only thing ending is his credibility, the war keeps going",
    "executive overreach in foreign policy is back in the headlines",
)
STORY_FORM_PROFILES: dict[str, dict[str, object]] = {
    "lead_analysis": {
        "label": "Lead Analysis",
        "body_paragraphs": 4,
        "extra_heading": "",
        "extra_label": "",
        "extra_count": 0,
        "target_words": "900-1300",
        "instruction": (
            "Write the site's filed lead analysis. Give it four developed body paragraphs: stakes, receipts, "
            "widening pressure, and an earned close that advances the site's ongoing argument instead of restarting it."
        ),
    },
    "lead_update": {
        "label": "Lead Update",
        "body_paragraphs": 3,
        "extra_heading": "## What Changed",
        "extra_label": "What changed",
        "extra_count": 3,
        "target_words": "620-880",
        "instruction": (
            "Write this like a real filed follow-up, not a caption with line breaks. Emphasize what actually changed since "
            "the last pass, but keep enough room for receipts, consequence, and a sharper continuation."
        ),
    },
    "theme_column": {
        "label": "Theme Column",
        "body_paragraphs": 4,
        "extra_heading": "",
        "extra_label": "",
        "extra_count": 0,
        "target_words": "720-980",
        "instruction": (
            "Write a real theme column. Move fast, prove the contradiction cleanly with multiple receipts, and close on "
            "political consequence instead of vibe."
        ),
    },
    "theme_update": {
        "label": "Signal Update",
        "body_paragraphs": 3,
        "extra_heading": "## Update Notes",
        "extra_label": "Update note",
        "extra_count": 3,
        "target_words": "420-620",
        "instruction": (
            "Write a shorter but still filed follow-up. Treat it like the next site note on a live lane, not a brand-new "
            "essay, and use the bullets for the freshest turns."
        ),
    },
    "notebook_entry": {
        "label": "Notebook Entry",
        "body_paragraphs": 4,
        "extra_heading": "## What I'm Tracking",
        "extra_label": "Notebook note",
        "extra_count": 3,
        "target_words": "680-920",
        "instruction": (
            "Write this like a public notebook entry with real reporting weight. Keep the voice authored and specific, and "
            "let the extra section hold the lines the site wants to keep open."
        ),
    },
}
STORY_FORM_WORD_FLOORS = {
    "lead_analysis": 760,
    "lead_update": 520,
    "theme_column": 620,
    "theme_update": 380,
    "notebook_entry": 560,
}
EDITORIAL_MAX_TOKENS_BY_FORM = {
    # Keep one editorial pass inside a practical request budget. A second
    # full-length challenger pass was making otherwise good pieces wait
    # several minutes, then fall back to the thin deterministic template.
    "lead_analysis": 1800,
    "lead_update": 1400,
    "theme_column": 1700,
    "theme_update": 1200,
    "notebook_entry": 1500,
}


def _lexical_diversity(text: str) -> float:
    tokens = re.findall(r"[a-z0-9']+", (text or "").lower())
    if len(tokens) < 8:
        return 0.0
    unique = len(set(tokens))
    return unique / max(len(tokens), 1)


def _sentence_count(text: str) -> int:
    return len([part for part in re.split(r"[.!?]+", text or "") if part.strip()])


def _word_count(text: str | None) -> int:
    return len(re.findall(r"[a-z0-9']+", (text or "").lower()))


def _normalize_editorial_labels(text: str) -> str:
    lines = [(line or "").strip() for line in (text or "").splitlines()]
    out: list[str] = []
    in_signal_block = False
    for raw in lines:
        if not raw:
            if out and out[-1] != "":
                out.append("")
            continue
        label_match = SECTION_LABEL_RE.match(raw)
        if label_match:
            label = re.sub(r"\s+", " ", label_match.group(1).lower()).strip()
            value = _clean_line(label_match.group(2))
            if label in {"headline", "title"}:
                out.append(f"# {value}" if value else "# Untitled")
                in_signal_block = False
                continue
            if label == "dek":
                if value:
                    out.append(value)
                in_signal_block = False
                continue
            if label.startswith("paragraph"):
                if value:
                    out.append(value)
                in_signal_block = False
                continue
            if label.startswith("pattern signal"):
                out.append("## Pattern Signals")
                in_signal_block = True
                if value:
                    out.append(f"- {value}")
                continue

        cleaned = _clean_line(raw)
        if not cleaned:
            continue
        if re.match(r"^(grounding[_\s-]?note|disclosure)\s*:", cleaned, flags=re.IGNORECASE):
            continue
        if in_signal_block and not cleaned.startswith("-"):
            out.append(f"- {cleaned}")
            continue
        out.append(cleaned)

    normalized = "\n".join(out)
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    return normalized.strip()


def _apply_voice_polish(text: str, *, lane: str) -> str:
    polished = _normalize_editorial_labels(text) if lane == "editorial" else text
    polished = polished.replace("\r\n", "\n").replace("\r", "\n")
    for pattern, replacement in VOICE_POLISH_REPLACEMENTS:
        polished = pattern.sub(replacement, polished)
    polished = re.sub(r"^\s*\.?\s*thread_?\d+\s*[:.\-)]\s*", "", polished, flags=re.IGNORECASE)
    polished = _strip_instructional_opening(polished)
    if lane == "editorial":
        lines = polished.splitlines()
        cleaned_lines: list[str] = []
        for raw in lines:
            line = raw.strip()
            if re.match(r"^(layer [a-d]|task prompt|output labels required)\b", line, flags=re.IGNORECASE):
                continue
            cleaned_lines.append(raw)
        polished = "\n".join(cleaned_lines)
        polished = _strip_editorial_packet_echo(polished)
    elif lane in {"social", "live_social"}:
        polished = "\n".join(raw for raw in polished.splitlines() if not _looks_like_editorial_meta_line(raw))
    polished = re.sub(r"[ \t]+", " ", polished)
    polished = re.sub(r"\n{3,}", "\n\n", polished).strip()
    return polished


def evaluate_style_gate(text: str, *, lane: str) -> dict[str, object]:
    normalized = (text or "").strip()
    lowered = normalized.lower()
    score = 100
    reasons: list[str] = []
    hard_fail = False

    min_len = 280 if lane == "editorial" else 90
    if len(normalized) < min_len:
        score -= 28
        reasons.append("too_short_for_lane")

    if lane == "editorial" and _sentence_count(normalized) < 3:
        score -= 24
        reasons.append("not_enough_sentences")

    diversity = _lexical_diversity(normalized)
    if diversity < 0.38:
        score -= 12
        reasons.append("low_lexical_diversity")

    missing_political_specificity = not any(signal in lowered for signal in STYLE_POLITICAL_SIGNALS)
    if missing_political_specificity:
        score -= 22
        reasons.append("missing_political_specificity")
        if lane in {"social", "live_social"}:
            hard_fail = True

    for pattern in STYLE_SOFT_FAIL_PATTERNS:
        hits = len(pattern.findall(normalized))
        if hits:
            score -= min(16, hits * 6)
            reasons.append(f"soft_pattern:{pattern.pattern}")

    for pattern in STYLE_HARD_FAIL_PATTERNS:
        if pattern.search(normalized):
            score -= 35
            hard_fail = True
            reasons.append(f"hard_pattern:{pattern.pattern}")

    if normalized.count("!") > 1:
        score -= 6
        reasons.append("overexcited_punctuation")

    if lane in {"social", "live_social"} and len(normalized) < 65:
        hard_fail = True
        reasons.append("social_post_too_short")

    threshold = int(STYLE_THRESHOLD_BY_LANE.get(lane, 65))
    score = max(0, min(100, score))
    passes = (not hard_fail) and score >= threshold
    return {
        "lane": lane,
        "score": score,
        "threshold": threshold,
        "passes": passes,
        "hard_fail": hard_fail,
        "reasons": reasons[:8],
    }


def _is_disclosure_text(text: str) -> bool:
    normalized = re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()
    return normalized.startswith("ai assisted analysis") or "disclosure reminder" in normalized


def _clean_line(text: str) -> str:
    cleaned = MARKDOWN_DECORATION_RE.sub("", text or "")
    cleaned = cleaned.strip().strip(QUOTE_EDGE_CHARS)
    cleaned = WHITESPACE_RE.sub(" ", cleaned)
    return cleaned.strip()


def _leading_sentence(text: str) -> str:
    match = LEADING_SENTENCE_RE.match(text or "")
    if match:
        return _clean_line(match.group(1))
    return _clean_line(text)


def _looks_like_prompt_instruction(text: str) -> bool:
    cleaned = _clean_line(text)
    if not cleaned:
        return False
    lowered = cleaned.lower()
    if any(marker in lowered for marker in ("output exactly", "do not output", "x_short", "x_long", "thread_")):
        return True
    if re.search(
        r"\b(?:one|two|three|3|exactly)\s+(?:post|posts|paragraph|paragraphs|receipt|receipts|line|lines|thread|threads|reply|replies|hook|hooks)\b",
        lowered,
    ):
        return True
    meta_hits = sum(1 for marker in PROMPTISH_META_MARKERS if marker in lowered)
    return bool(PROMPTISH_START_RE.match(cleaned)) and meta_hits > 0


def _looks_like_editor_directive(text: str) -> bool:
    cleaned = _clean_line(text)
    if not cleaned:
        return False
    if _looks_like_prompt_instruction(cleaned):
        return True
    return bool(DIRECTIVEISH_START_RE.match(cleaned)) and len(cleaned.split()) <= 16


def _strip_instructional_opening(text: str, *, max_sentences: int = 3) -> str:
    remainder = text or ""
    for _ in range(max_sentences):
        match = LEADING_SENTENCE_RE.match(remainder)
        if not match:
            break
        sentence = _clean_line(match.group(1))
        if not sentence:
            break
        if _looks_like_prompt_instruction(sentence) or (_looks_like_editor_directive(sentence) and not has_trump_focus(sentence)):
            remainder = match.group(2)
            continue
        break

    cleaned_remainder = _clean_line(remainder)
    if cleaned_remainder and _looks_like_prompt_instruction(cleaned_remainder):
        return ""
    return remainder.strip()


def _normalize_prompt_topic(text: str) -> str:
    cleaned = _clean_line(text)
    if not cleaned:
        return ""
    if not (_looks_like_prompt_instruction(cleaned) or _looks_like_editor_directive(cleaned)):
        return cleaned

    topic_match = PROMPT_TOPIC_RE.search(cleaned)
    if topic_match:
        candidate = PROMPT_TOPIC_TAIL_RE.sub("", _clean_line(topic_match.group(1))).strip()
        if candidate and not _looks_like_prompt_instruction(candidate):
            return candidate[:180]

    stripped = PROMPT_TOPIC_TAIL_RE.sub("", _clean_line(_strip_instructional_opening(cleaned))).strip()
    if stripped and not (_looks_like_prompt_instruction(stripped) or _looks_like_editor_directive(stripped)):
        return stripped[:180]
    return ""


def _meta_query_candidate(value: str) -> bool:
    cleaned = _normalize_prompt_topic(value) or _clean_line(value)
    if not cleaned:
        return True
    lowered = cleaned.lower()
    if _looks_like_prompt_instruction(cleaned) or _looks_like_editor_directive(cleaned):
        return True
    if EDITORIAL_META_QUERY_PREFIX_RE.match(cleaned):
        return True
    if any(phrase in lowered for phrase in EDITORIAL_META_QUERY_PHRASES):
        return True
    generic_markers = (
        "remains active",
        "still the contradiction lane",
        "live contradiction lane",
        "keeps rolling",
        "is still the live",
        "is still the contradiction",
    )
    return any(marker in lowered for marker in generic_markers)


def _is_placeholder_title(text: str) -> bool:
    normalized = re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()
    if not normalized:
        return True
    if normalized in {"headline", "title", "dek", "lede", "lead"}:
        return True
    if normalized.startswith("satirical draft fallback"):
        return True
    if normalized.startswith("ai assisted analysis"):
        return True
    if re.fullmatch(r"paragraph\s*\d+", normalized):
        return True
    return False


def _as_bool(value: str | None, default: bool = False) -> bool:
    normalized = (value or "").strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


def _first_signal_line(text: str | None, *, default: str) -> str:
    if not text:
        return default
    for raw in text.splitlines():
        line = _clean_line(raw.lstrip("#").lstrip("-").lstrip(">"))
        if not line:
            continue
        if _is_disclosure_text(line):
            continue
        return line[:220]
    return default


def _voice_memory_key_from_text(text: str, fallback: str) -> str:
    slug = slugify_loose(text)[:64]
    return slug or fallback


def _parse_social_variants(generated: str, title: str) -> tuple[str, str, list[str]]:
    parts = [p.strip() for p in (generated or "").split("\n") if p.strip()]
    x_short = ""
    x_long = ""
    thread_lines: list[str] = []
    non_label_parts: list[str] = []

    for line in parts:
        match = SOCIAL_VARIANT_RE.match(line)
        if not match:
            cleaned_line = _clean_line(line)
            if cleaned_line:
                non_label_parts.append(cleaned_line)
            continue
        label = match.group(1).lower()
        value = _clean_line(match.group(2))
        if not value:
            continue
        if label == "x_short":
            x_short = value[:260]
        elif label == "x_long":
            x_long = value[:500]
        else:
            thread_lines.append(value[:260])

    if not x_short:
        fallback = non_label_parts[0] if non_label_parts else f"{title} | BlondesAgainstTrump briefing."
        x_short = fallback[:260]
    if not x_long:
        fallback = non_label_parts[1] if len(non_label_parts) > 1 else (non_label_parts[0] if non_label_parts else x_short)
        x_long = fallback[:500]
    if not thread_lines:
        fallback_thread = [p[:260] for p in non_label_parts[:5]]
        thread_lines = fallback_thread if fallback_thread else [x_short]
    return x_short, x_long, thread_lines[:7]


def _extract_headline_from_body(body: str | None) -> str | None:
    if not body:
        return None

    lines = [line.strip() for line in body.splitlines()]
    for index, raw in enumerate(lines):
        if not raw:
            continue

        if raw.startswith("#"):
            candidate = _clean_line(raw.lstrip("#"))
            if candidate and not _is_placeholder_title(candidate) and not _is_disclosure_text(candidate):
                return candidate

        label_match = SECTION_LABEL_RE.match(raw)
        if label_match and label_match.group(1).lower() in {"headline", "title"}:
            inline = _clean_line(label_match.group(2))
            if inline and not _is_placeholder_title(inline):
                return inline
            for follow in lines[index + 1 : index + 6]:
                if not follow:
                    continue
                follow_match = SECTION_LABEL_RE.match(follow)
                if follow_match:
                    continue
                candidate = _clean_line(follow.lstrip("- ").lstrip("#"))
                if candidate and not _is_placeholder_title(candidate) and not _is_disclosure_text(candidate):
                    return candidate

    for raw in lines:
        if not raw or raw.startswith(("-", "* ")):
            continue
        match = SECTION_LABEL_RE.match(raw)
        if match:
            continue
        candidate = _clean_line(raw.lstrip("#"))
        if candidate and not _is_placeholder_title(candidate) and not _is_disclosure_text(candidate):
            return candidate

    return None


def derive_editorial_title(title: str | None, body: str | None, object_type: str) -> str:
    preferred = _clean_line(title or "")
    if preferred and not _is_placeholder_title(preferred):
        return preferred[:140]

    extracted = _extract_headline_from_body(body)
    if extracted and not _is_disclosure_text(extracted):
        return extracted[:140]

    fallback = FALLBACK_TITLE_BY_TYPE.get(object_type, f"{object_type.replace('_', ' ').title()} Draft")
    return fallback[:140]


def _extract_dek(body: str | None) -> str | None:
    if not body:
        return None

    lines = [line.strip() for line in body.splitlines()]
    for index, raw in enumerate(lines):
        if not raw:
            continue
        label_match = SECTION_LABEL_RE.match(raw)
        if not label_match or label_match.group(1).lower() != "dek":
            continue

        inline = _clean_line(label_match.group(2))
        if inline and not _is_placeholder_title(inline):
            return inline

        for follow in lines[index + 1 : index + 4]:
            if not follow:
                continue
            follow_match = SECTION_LABEL_RE.match(follow)
            if follow_match:
                continue
            candidate = _clean_line(follow.lstrip("- ").lstrip("#"))
            if candidate:
                return candidate

    # Support natural markdown outputs where dek is the first non-heading line.
    for raw in lines[:8]:
        if not raw:
            continue
        if raw.startswith("#"):
            continue
        if raw.startswith(("-", "* ")):
            continue
        if SECTION_LABEL_RE.match(raw):
            continue
        candidate = _clean_line(raw)
        if not candidate:
            continue
        if len(candidate) < 12:
            continue
        return candidate[:240]
    return None


def _build_summary(body: str, limit: int = 280) -> str:
    body_paragraphs = _body_paragraphs(body)
    if body_paragraphs:
        summary = WHITESPACE_RE.sub(" ", " ".join(body_paragraphs[:2])).strip()
        return summary[:limit]
    plain = body.replace("\r", "\n")
    plain = re.sub(r"[#>*_`-]", " ", plain)
    plain = WHITESPACE_RE.sub(" ", plain).strip()
    return plain[:limit]


def _word_count(text: str | None) -> int:
    return len(re.findall(r"[a-z0-9']+", (text or "").lower()))


def _safe_float(value: object) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _dedupe_clean_lines(values: list[str], *, minimum_len: int = 8, limit: int = 5) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []
    for value in values:
        cleaned = _clean_line(value)
        if len(cleaned) < minimum_len:
            continue
        fingerprint = re.sub(r"[^a-z0-9]+", " ", cleaned.lower()).strip()
        if not fingerprint or fingerprint in seen:
            continue
        seen.add(fingerprint)
        deduped.append(cleaned)
        if len(deduped) >= limit:
            break
    return deduped


def _source_display_name(source: dict[str, object]) -> str:
    return _clean_line(str(source.get("source_label") or source.get("source_name") or "news desk"))


def _source_text(source: dict[str, object]) -> str:
    return " ".join(
        part
        for part in [
            _clean_line(str(source.get("title") or "")),
            _clean_line(str(source.get("snippet") or "")),
            _clean_line(str(source.get("source_label") or source.get("source_name") or "")),
        ]
        if part
    )


def _source_has_low_signal_title(source: dict[str, object]) -> bool:
    title = _clean_line(str(source.get("title") or "")).lower()
    return bool(title) and any(marker in title for marker in LOW_SIGNAL_TITLE_MARKERS)


def _query_focus_terms(query_text: str) -> list[str]:
    return [
        token
        for token in re.findall(r"[a-z0-9']+", (query_text or "").lower())
        if len(token) >= 3 and not token.isdigit() and token not in EDITORIAL_QUERY_STOPWORDS
    ]


def _theme_query_hint(theme: Theme | None) -> str:
    if not theme:
        return ""
    return _clean_line(THEME_QUERY_HINTS.get(_clean_line(str(theme.slug or "")).lower(), ""))


def _query_requires_foreign_policy_context(query_text: str) -> bool:
    lowered = (query_text or "").lower()
    return any(marker in lowered for marker in EDITORIAL_FOREIGN_POLICY_MARKERS)


def _story_focus_query(
    *,
    selected_angle: str = "",
    freshest_evidence: str = "",
    source_roles: list[dict[str, object]] | None = None,
    fallback_query: str = "",
) -> str:
    candidates = _dedupe_clean_lines(
        [
            _clean_angle_candidate(selected_angle),
            _clean_angle_candidate(freshest_evidence),
            *[
                _clean_angle_candidate(str((role or {}).get("title") or ""))
                for role in (source_roles or [])[:3]
            ],
            _clean_angle_candidate(fallback_query),
        ],
        minimum_len=8,
        limit=4,
    )
    return _clean_line(" ".join(candidates))[:220]


def _source_matches_query_context(source: dict[str, object], query_text: str) -> bool:
    if not query_text:
        return True
    lowered = _source_text(source).lower()
    if not lowered:
        return False
    if _query_requires_foreign_policy_context(query_text):
        return any(marker in lowered for marker in EDITORIAL_FOREIGN_POLICY_MARKERS)
    focus_terms = _query_focus_terms(query_text)
    if len(focus_terms) >= 2:
        threshold = _query_alignment_threshold(query_text)
        return _query_alignment_score(source, query_text) >= threshold
    return True


def _query_alignment_threshold(query_text: str) -> int:
    focus_terms = _query_focus_terms(query_text)
    if len(focus_terms) >= 6:
        return 4
    if len(focus_terms) >= 4:
        return 3
    if len(focus_terms) >= 2:
        return 2
    return 1 if focus_terms else 0


def _text_focus_hits(text: str | None, *, query_text: str) -> int:
    cleaned = _clean_line(text or "")
    if not cleaned:
        return 0
    lowered = cleaned.lower()
    return sum(1 for term in _query_focus_terms(query_text) if term in lowered)


def _excerpt_matches_query_context(text: str | None, query_text: str) -> bool:
    cleaned = _clean_line(text or "")
    if not cleaned:
        return False
    if not query_text:
        return True
    lowered = cleaned.lower()
    if _query_requires_foreign_policy_context(query_text) and not any(
        marker in lowered for marker in EDITORIAL_FOREIGN_POLICY_MARKERS
    ):
        return False
    focus_terms = _query_focus_terms(query_text)
    if not focus_terms:
        return True
    required_hits = 2 if len(focus_terms) >= 4 else 1
    return _text_focus_hits(cleaned, query_text=query_text) >= required_hits


def _query_alignment_score(source: dict[str, object], query_text: str) -> int:
    terms = _query_focus_terms(query_text)
    if not terms:
        return 0
    title_text = _clean_line(str(source.get("title") or "")).lower()
    source_text = _source_text(source).lower()
    title_tokens = set(re.findall(r"[a-z0-9']+", title_text))
    source_tokens = set(re.findall(r"[a-z0-9']+", source_text))
    title_hits = {term for term in terms if term in title_tokens}
    source_hits = {term for term in terms if term in source_tokens}
    return (len(title_hits) * 2) + len(source_hits)


def _credibility_priority(value: object) -> float:
    normalized = _clean_line(str(value or "")).lower()
    if normalized == "high":
        return 2.0
    if normalized == "medium":
        return 1.0
    return 0.0


def _source_kind_priority(source: dict[str, object]) -> float:
    normalized = _clean_line(str(source.get("source_kind") or "")).lower()
    if normalized == "reporting":
        return 2.0
    if normalized == "institutional":
        return 0.75
    return 0.0


def _source_title_seed(source: dict[str, object]) -> str:
    cleaned = _clean_line(str(source.get("title") or ""))
    if not cleaned:
        return ""
    cleaned = _clean_angle_candidate(cleaned) or cleaned
    cleaned = OUTLET_SUFFIX_RE.sub("", cleaned).strip()
    if len(cleaned) < 18:
        return ""
    if cleaned.endswith("...") or "..." in cleaned:
        return ""
    lowered = cleaned.lower()
    if any(marker in lowered for marker in ANGLE_REJECT_MARKERS):
        return ""
    if _source_has_low_signal_title({"title": cleaned}):
        return ""
    if str(source.get("source_kind") or "other").lower() not in SHOWCASE_SOURCE_KINDS:
        return ""
    return cleaned[:180]


def _source_priority_tuple(source: dict[str, object], *, query_text: str = "") -> tuple[float, float, float, float, float, float]:
    alignment = float(_query_alignment_score(source, query_text))
    source_kind = _source_kind_priority(source)
    retrieval_score = _safe_float(source.get("retrieval_score"))
    editorial_priority = _safe_float(source.get("editorial_priority_score"))
    quality = _safe_float(source.get("quality_score"))
    credibility = _credibility_priority(source.get("credibility_tier"))
    age_days = source.get("age_days")
    freshness = -float(age_days if age_days is not None else 9999)
    return (credibility, source_kind, alignment, retrieval_score or editorial_priority or quality, quality, freshness)


def _preferred_story_sources(
    sources: list[dict[str, object]],
    *,
    limit: int = 4,
    query_text: str = "",
) -> list[dict[str, object]]:
    candidates = [source for source in sources if _source_title_seed(source)]
    contextual_candidates = [source for source in candidates if _source_matches_query_context(source, query_text)]
    ranked_candidates = contextual_candidates or candidates
    return sorted(
        ranked_candidates,
        key=lambda source: _source_priority_tuple(source, query_text=query_text),
        reverse=True,
    )[:limit]


def _limit_text(text: str, limit: int) -> str:
    cleaned = _clean_line(text)
    if len(cleaned) <= limit:
        return cleaned
    clipped = cleaned[: max(0, limit - 3)].rstrip()
    if " " in clipped:
        clipped = clipped.rsplit(" ", 1)[0]
    clipped = clipped.rstrip(" ,;:-")
    return f"{clipped or cleaned[: max(0, limit - 3)]}..."


def _terminal_sentence(text: str) -> str:
    cleaned = _clean_line(text)
    if not cleaned:
        return ""
    if cleaned[-1] in ".!?":
        return cleaned
    return f"{cleaned}."


def _story_form_headline(base_headline: str, *, story_form_key: str, focus_label: str) -> str:
    seed = _clean_line(base_headline or focus_label or "Trump administration watch")
    if story_form_key == "lead_update":
        if ":" in seed or len(seed) > 92:
            return _limit_text(f"{seed} Update", 120)
        return _limit_text(f"{seed}: What Changed", 120)
    if story_form_key == "theme_update":
        return _limit_text(f"{seed} Update", 120)
    if story_form_key == "notebook_entry":
        label = _clean_line(focus_label or seed)
        if ":" in label or len(label) > 96:
            return _limit_text(label, 120)
        return _limit_text(f"{label}: Notebook", 120)
    return _limit_text(seed, 120)


def _text_fingerprint(text: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", " ", _clean_line(text or "").lower()).strip()


def _looks_like_headlineish_text(text: str | None) -> bool:
    cleaned = _clean_line(text or "")
    if not cleaned:
        return False
    lowered = cleaned.lower()
    if any(marker in lowered for marker in NOISY_MEMORY_MARKERS):
        return True
    if len(cleaned) > 150:
        return False
    if cleaned[-1] in ".!?":
        return False
    words = cleaned.split()
    if not words:
        return False
    capitalized_ratio = sum(1 for word in words if word[:1].isupper()) / max(len(words), 1)
    return capitalized_ratio >= 0.45


def _clean_angle_candidate(text: str | None) -> str:
    cleaned = _clean_line(text or "")
    if not cleaned:
        return ""
    cleaned = OUTLET_SUFFIX_RE.sub("", cleaned).strip()
    cleaned = ANGLE_PREFIX_RE.sub("", cleaned).strip()
    cleaned = re.sub(r"\b20\d{2}\b", "", cleaned)
    cleaned = re.sub(r"\b(?:today'?s|latest|news|live|updates?)\b", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -:|")
    if re.search(
        r"\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\b",
        cleaned,
        flags=re.IGNORECASE,
    ):
        return ""
    if cleaned.lower() in {"trump administration", "sitewide"} or cleaned.lower().endswith("trump administration"):
        return ""
    return cleaned[:180] if len(cleaned) >= 12 else ""


def _friendly_focus_label(query_text: str, *, object_type: str) -> str:
    cleaned = _clean_angle_candidate(_normalize_prompt_topic(query_text))
    if not cleaned:
        return ""
    tokens = _query_focus_terms(cleaned)
    lowered_tokens = set(tokens)
    if {"iran", "war"} <= lowered_tokens:
        return "Iran War Watch" if object_type == "lead_story" else "Iran War Lane"
    if "executive" in lowered_tokens and ("order" in lowered_tokens or "overreach" in lowered_tokens):
        return "Executive Overreach"
    if "court" in lowered_tokens or "filing" in lowered_tokens:
        return "Court Watch" if object_type == "lead_story" else "Court Pressure"
    pretty = " ".join(token.capitalize() for token in tokens[:4])
    if not pretty:
        return cleaned
    if object_type == "lead_story" and not pretty.endswith("Watch"):
        return f"{pretty} Watch"
    return pretty


def _story_specific_directive_hook(directive_line: str, *, normalized_query_text: str, theme_name: str) -> str:
    directive_hook = _normalize_prompt_topic(directive_line) if directive_line else ""
    if not directive_hook:
        return ""
    if has_trump_focus(directive_hook):
        return directive_hook
    directive_terms = set(_query_focus_terms(directive_hook))
    story_terms = set(_query_focus_terms(" ".join([normalized_query_text, theme_name]).strip()))
    if directive_terms and story_terms and directive_terms & story_terms:
        return directive_hook
    return ""


def _story_argument_spine(
    *,
    selected_angle: str,
    why_now: str,
    query_text: str,
    preferred_sources: list[dict[str, object]],
    analysis_flags: dict[str, object],
    counterforce: str,
    synthesis_to_land: str,
    gold_thread: str,
    writer_north_star: str,
) -> list[str]:
    lead_receipt = (
        _source_receipt_sentence(preferred_sources[0], role="lead", query_text=query_text) if preferred_sources else ""
    )
    support_receipt = (
        _source_receipt_sentence(preferred_sources[1], role="support", query_text=query_text)
        if len(preferred_sources) > 1
        else ""
    )
    claim_vs_receipt = _clean_line(str(analysis_flags.get("claim_vs_receipt") or counterforce))
    tell_kind = _clean_line(str(analysis_flags.get("tell_kind") or "pressure point"))
    institutional_stress = _clean_line(str(analysis_flags.get("institutional_stress") or ""))
    beneficiary = _clean_line(str(analysis_flags.get("beneficiary") or ""))
    cost_bearer = _clean_line(str(analysis_flags.get("cost_bearer") or ""))
    closing_move = _clean_line(gold_thread or synthesis_to_land or writer_north_star)

    return _dedupe_clean_lines(
        [
            f"Open on '{selected_angle}' and make the why-now concrete: {why_now}",
            lead_receipt,
            support_receipt,
            f"Break the line against the record: {claim_vs_receipt}" if claim_vs_receipt else "",
            (
                f"Name the {tell_kind} and the stress point: {institutional_stress}"
                if institutional_stress
                else f"Name the {tell_kind} hiding under the headline."
            ),
            (
                f"Spell out the power trade: beneficiary is {beneficiary}; cost lands on {cost_bearer}."
                if beneficiary or cost_bearer
                else ""
            ),
            closing_move,
        ],
        minimum_len=18,
        limit=6,
    )


def _paragraph_job_lines(story_brief: dict[str, object]) -> list[str]:
    body_paragraphs = max(2, int(story_brief.get("body_paragraphs") or 3))
    analysis_flags = story_brief.get("analysis_flags") if isinstance(story_brief.get("analysis_flags"), dict) else {}
    tell_kind = _clean_line(str(analysis_flags.get("tell_kind") or "tell"))
    if body_paragraphs >= 4:
        return [
            "Paragraph 1 opens on the concrete turn or consequence.",
            "Paragraph 2 puts the lead receipt and one corroborating receipt on the page.",
            f"Paragraph 3 names the claim-versus-receipt gap and the {tell_kind}.",
            "Paragraph 4 names who benefits, who absorbs the cost, and lands the consequence.",
        ]
    return [
        "Paragraph 1 opens on what changed or the concrete turn.",
        "Paragraph 2 makes the lead receipt and the counterforce do visible work.",
        f"Paragraph 3 cashes out the {tell_kind} by naming who benefits, who absorbs the cost, and why it matters now.",
    ]


def _aligned_trend_signal(
    trends: list[dict[str, object]],
    *,
    theme_name: str,
    theme_slug: str,
    query_text: str,
) -> str:
    focus_terms = set(_query_focus_terms(" ".join(filter(None, [theme_name, theme_slug.replace("-", " "), query_text]))))
    generic_fallback = ""
    for trend in trends:
        title = _clean_line(str(trend.get("title") or ""))
        summary = _clean_line(str(trend.get("summary") or ""))
        if not title and not summary:
            continue
        candidate = title or summary
        merged = f"{title} {summary}".lower()
        if focus_terms and any(term in merged for term in focus_terms):
            return candidate
        if not generic_fallback and not candidate.lower().endswith("remains active"):
            generic_fallback = candidate
    if theme_slug and focus_terms:
        return ""
    if len(trends) <= 1:
        return generic_fallback
    return ""


def _pick_distinct_angle(candidates: list[str], recent_coverage: list[dict[str, object]]) -> str:
    recent_fingerprints = {
        fingerprint
        for item in recent_coverage
        for fingerprint in (
            _text_fingerprint(str(item.get("selected_angle") or "")),
            _text_fingerprint(str(item.get("title") or "")),
        )
        if fingerprint
    }
    cleaned_candidates = [_clean_angle_candidate(candidate) for candidate in candidates if _clean_angle_candidate(candidate)]

    def _candidate_score(candidate: str) -> tuple[int, int]:
        score = 0
        if has_trump_focus(candidate):
            score += 4
        score += min(4, len(_query_focus_terms(candidate)))
        word_count = len(candidate.split())
        if len(candidate) >= 45:
            score += 2
        if word_count <= 4:
            score -= 3
        lowered = candidate.lower()
        if any(marker in lowered for marker in ("headline drama", "sitewide", "deserves a cleaner second look")):
            score -= 6
        return score, len(candidate)

    annotated_candidates = [(candidate, _candidate_score(candidate)) for candidate in cleaned_candidates]
    if not annotated_candidates:
        return ""

    best_candidate, best_score = max(annotated_candidates, key=lambda item: item[1])
    for candidate, score in annotated_candidates:
        if _text_fingerprint(candidate) not in recent_fingerprints and score[0] >= max(3, best_score[0] - 1):
            return candidate
    if best_score[0] >= 3:
        return best_candidate
    for candidate, _ in annotated_candidates:
        if _text_fingerprint(candidate) not in recent_fingerprints:
            return candidate
    return cleaned_candidates[0] if cleaned_candidates else ""


def _coverage_time_label(item: dict[str, object]) -> str:
    age_hours = int(item.get("age_hours") or 0)
    if age_hours <= 6:
        return "earlier today"
    if age_hours <= 24:
        return "in the last day"
    return "recently"


def _story_form_profile(
    *,
    object_type: str,
    theme_slug: str,
    freshest_age_days: int | None,
    recent_coverage: list[dict[str, object]],
) -> dict[str, object]:
    same_theme = [item for item in recent_coverage if theme_slug and str(item.get("theme_slug") or "") == theme_slug]
    same_type = [item for item in recent_coverage if str(item.get("object_type") or "") == object_type]
    recent_window_hours = 6
    same_theme_hot = [item for item in same_theme if int(item.get("age_hours") or 9999) <= recent_window_hours]
    same_type_hot = [item for item in same_type if int(item.get("age_hours") or 9999) <= recent_window_hours]
    if object_type == "lead_story":
        if len(same_type_hot) >= 2 and freshest_age_days is not None and freshest_age_days <= 1:
            return {"key": "lead_update", **STORY_FORM_PROFILES["lead_update"]}
        return {"key": "lead_analysis", **STORY_FORM_PROFILES["lead_analysis"]}
    if len(same_theme_hot) >= 3 and freshest_age_days is not None and freshest_age_days <= 1:
        return {"key": "notebook_entry", **STORY_FORM_PROFILES["notebook_entry"]}
    if len(same_theme_hot) >= 2 and freshest_age_days is not None and freshest_age_days <= 1:
        return {"key": "theme_update", **STORY_FORM_PROFILES["theme_update"]}
    return {"key": "theme_column", **STORY_FORM_PROFILES["theme_column"]}


def _analysis_story_form_is_compatible(object_type: str, story_form_key: str) -> bool:
    normalized = _clean_line(story_form_key).lower()
    if normalized not in STORY_FORM_PROFILES:
        return False
    if object_type == "lead_story":
        return normalized in {"lead_analysis", "lead_update"}
    if object_type == "theme_take":
        return normalized in {"theme_column", "theme_update", "notebook_entry"}
    return True


def _build_why_now_line(
    preferred_sources: list[dict[str, object]],
    *,
    theme_name: str,
    trend_signal: str,
    recent_coverage: list[dict[str, object]],
) -> str:
    outlets = _dedupe_clean_lines([_source_display_name(source) for source in preferred_sources], minimum_len=2, limit=2)
    titles = [_clean_angle_candidate(_source_title_seed(source)) for source in preferred_sources[:2]]
    titles = [title for title in titles if title]
    if recent_coverage:
        outlet_text = " and ".join(outlets) if outlets else theme_name
        if titles:
            return (
                f"{outlet_text} just put a fresher receipt on the board, and {titles[0].lower()} gives this lane a sharper turn than a generic recap."
            )[:240]
        return f"{outlet_text or 'Fresh reporting'} moved this lane from atmosphere into a more concrete argument, which makes the next pass worth doing."[:220]
    if len(outlets) >= 2 and titles:
        return (
            f"{outlets[0]} and {outlets[1]} are carrying different sides of the same contradiction, "
            f"which gives this pass more movement than a simple recap."
        )[:220]
    if outlets and titles:
        return f"{outlets[0]} put the freshest receipt on the board, and this piece should move from that fact instead of from atmosphere alone."[:220]
    if trend_signal:
        return f"The {trend_signal.lower()} line is still warm, but this story has a cleaner turn than the generic trend label lets on."[:220]
    return f"The angle keeps mutating inside the {theme_name.lower() or 'current'} lane, which is exactly why the site needs a fresh pass instead of a rerun."[:220]


def _build_continuity_note(
    *,
    object_type: str,
    theme_name: str,
    recent_coverage: list[dict[str, object]],
) -> str:
    if recent_coverage:
        prior = recent_coverage[0]
        prior_title = _clean_line(str(prior.get("title") or ""))
        return (
            f"A nearby BAT piece already ran {_coverage_time_label(prior)} under the line '{prior_title}'. "
            "Advance the thought process, name what changed, and do not reopen with the same first move."
        )
    if object_type == "lead_story":
        return "Open the main site line cleanly, but leave the next pass somewhere real to go."
    return f"Treat {theme_name or 'this lane'} like a continuing notebook, not a disposable one-off."


def _build_repetition_guard(
    recent_coverage: list[dict[str, object]],
    *,
    current_angle: str,
) -> dict[str, object]:
    nearby_titles = [
        _clean_line(str(item.get("title") or ""))
        for item in recent_coverage[:4]
        if _clean_line(str(item.get("title") or ""))
    ]
    avoid_phrases = _dedupe_clean_lines(
        list(STALE_SITE_PHRASES)
        + [
            _clean_line(str(item.get("why_now") or ""))
            for item in recent_coverage
            if len(_clean_line(str(item.get("why_now") or ""))) <= 180
        ]
        + [
            _clean_line(str(item.get("pull_quote") or ""))
            for item in recent_coverage
            if 20 <= len(_clean_line(str(item.get("pull_quote") or ""))) <= 180
        ],
        minimum_len=16,
        limit=8,
    )
    recent_angles = _dedupe_clean_lines(
        [str(item.get("selected_angle") or "") for item in recent_coverage] + [current_angle],
        minimum_len=12,
        limit=6,
    )
    return {
        "avoid_phrases": avoid_phrases,
        "recent_titles": nearby_titles[:4],
        "recent_angles": recent_angles[:5],
    }


def _repetition_penalty(
    text: str,
    *,
    title: str | None,
    recent_coverage: list[dict[str, object]] | None = None,
    repetition_guard: dict[str, object] | None = None,
) -> tuple[int, list[str], bool]:
    recent_coverage = recent_coverage or []
    repetition_guard = repetition_guard or {}
    penalty = 0
    reasons: list[str] = []
    hard_fail = False
    normalized_text = _text_fingerprint(text)

    repeated_site_lines = 0
    for phrase in repetition_guard.get("avoid_phrases", [])[:8]:
        fingerprint = _text_fingerprint(str(phrase))
        if fingerprint and fingerprint in normalized_text:
            penalty += 12
            repeated_site_lines += 1
            reasons.append(f"repeated_site_phrase:{_limit_text(str(phrase), 48)}")

    title_fingerprint = _text_fingerprint(title or "")
    recent_title_fingerprints = {_text_fingerprint(str(item.get("title") or "")) for item in recent_coverage if item.get("title")}
    if title_fingerprint and title_fingerprint in recent_title_fingerprints:
        penalty += 24
        hard_fail = True
        reasons.append("headline_repeats_recent_coverage")

    opening_fingerprint = _text_fingerprint(_leading_sentence(text))
    recent_openings = {
        _text_fingerprint(str(item.get("opening_line") or ""))
        for item in recent_coverage
        if item.get("opening_line")
    }
    if opening_fingerprint and opening_fingerprint in recent_openings:
        penalty += 18
        reasons.append("opening_line_repeats_recent_coverage")

    if repeated_site_lines >= 2:
        hard_fail = True

    return penalty, reasons, hard_fail


def _internal_repetition_penalty(text: str) -> tuple[int, list[str], bool]:
    blocks = [chunk.strip() for chunk in re.split(r"\n\s*\n", text or "") if chunk.strip()]
    paragraphs: list[str] = []
    for block in blocks:
        block_lines = [raw.strip() for raw in block.splitlines() if raw.strip()]
        if not block_lines:
            continue
        if block_lines[0].lower().startswith("story form label:"):
            continue
        if block_lines[0].startswith("##"):
            break
        lines: list[str] = []
        for raw in block.splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or line.startswith("-") or line.startswith("*"):
                continue
            match = SECTION_LABEL_RE.match(line)
            if match and match.group(1).lower().startswith("pattern signal"):
                continue
            if match:
                value = _clean_line(match.group(2))
                if value:
                    lines.append(value)
                continue
            cleaned = _clean_line(line.lstrip(">"))
            if cleaned:
                lines.append(cleaned)
        paragraph = " ".join(lines).strip()
        if paragraph:
            paragraphs.append(paragraph)
    sentences: list[str] = []
    for paragraph in paragraphs:
        for sentence in re.split(r"(?<=[.!?])\s+", paragraph or ""):
            cleaned = _clean_line(sentence)
            if len(cleaned) >= 24:
                sentences.append(cleaned)
    if not sentences:
        return 0, [], False

    penalty = 0
    reasons: list[str] = []
    hard_fail = False

    exact_counts = Counter(_text_fingerprint(sentence) for sentence in sentences if _text_fingerprint(sentence))
    repeated_exact = [fingerprint for fingerprint, count in exact_counts.items() if count >= 2]
    if repeated_exact:
        penalty += min(24, len(repeated_exact) * 12)
        reasons.append("duplicate_sentence")
        hard_fail = True

    stem_counts: Counter[str] = Counter()
    for sentence in sentences:
        tokens = re.findall(r"[a-z0-9']+", sentence.lower())
        if len(tokens) < 5:
            continue
        stem = " ".join(tokens[:5])
        if len(set(tokens[:5])) < 4:
            continue
        stem_counts[stem] += 1
    repeated_stems = [stem for stem, count in stem_counts.items() if count >= 2]
    for stem in repeated_stems[:2]:
        penalty += 8
        reasons.append(f"repeated_sentence_stem:{_limit_text(stem, 42)}")

    return penalty, reasons, hard_fail


def _style_rank(report: dict[str, object]) -> tuple[int, int, int]:
    return (
        1 if bool(report.get("passes")) else 0,
        0 if bool(report.get("hard_fail")) else 1,
        int(report.get("score") or 0),
    )


def _assess_style_candidate(
    text: str,
    *,
    lane: str,
    title: str | None = None,
    recent_coverage: list[dict[str, object]] | None = None,
    repetition_guard: dict[str, object] | None = None,
    story_brief: dict[str, object] | None = None,
) -> dict[str, object]:
    report = evaluate_style_gate(text, lane=lane)
    score = int(report.get("score") or 0)
    hard_fail = bool(report.get("hard_fail"))
    reasons = [str(reason) for reason in (report.get("reasons") or [])]
    lead_sentence = _leading_sentence(text)
    word_count = _word_count(text)
    body_metrics = _body_metrics(text) if lane == "editorial" else {"paragraph_count": 0, "word_count": 0}

    if editorial_looks_placeholder(title, text):
        score = min(score, 12)
        hard_fail = True
        reasons.append("placeholder_or_prompt_leak")
    elif contains_prompt_leak(title, text):
        score = min(score, 22)
        hard_fail = True
        reasons.append("prompt_leak")
    elif _looks_like_prompt_instruction(text) or _looks_like_prompt_instruction(lead_sentence):
        score = min(score, 22)
        hard_fail = True
        reasons.append("instructional-prompt-echo")

    if lane == "editorial":
        lowered = text.lower()
        generic_hits = [marker for marker in GENERIC_EDITORIAL_FILLER_MARKERS if marker in lowered]
        if generic_hits:
            score = max(0, score - min(18, 6 + (len(generic_hits) * 4)))
            reasons.append("generic_editorial_filler")

    if lane == "editorial" and not has_trump_focus(title, text):
        score = max(0, score - 18)
        reasons.append("missing_trump_focus")

    if lane == "editorial":
        word_floor = _story_form_word_floor(story_brief)
        body_word_count = int(body_metrics.get("word_count") or 0)
        required_paragraphs = max(2, int((story_brief or {}).get("body_paragraphs") or 3))
        body_paragraph_count = int(body_metrics.get("paragraph_count") or 0)
        if body_paragraph_count < required_paragraphs:
            score = max(0, score - min(28, 8 + ((required_paragraphs - body_paragraph_count) * 8)))
            reasons.append(f"body_paragraph_count:{body_paragraph_count}/{required_paragraphs}")
            hard_fail = True
        if body_word_count < word_floor:
            deficit = word_floor - body_word_count
            score = max(0, score - min(36, 10 + max(0, deficit // 10)))
            reasons.append(f"below_story_form_floor:{body_word_count}/{word_floor}")
            hard_fail = True

    repetition_penalty, repetition_reasons, repetition_hard_fail = _repetition_penalty(
        text,
        title=title,
        recent_coverage=recent_coverage,
        repetition_guard=repetition_guard,
    )
    score = max(0, score - repetition_penalty)
    hard_fail = hard_fail or repetition_hard_fail
    reasons.extend(repetition_reasons)

    internal_repetition_penalty, internal_repetition_reasons, internal_repetition_hard_fail = _internal_repetition_penalty(text)
    score = max(0, score - internal_repetition_penalty)
    hard_fail = hard_fail or internal_repetition_hard_fail
    reasons.extend(internal_repetition_reasons)

    threshold = int(report.get("threshold") or STYLE_THRESHOLD_BY_LANE.get(lane, 65))
    score = max(0, min(100, score))
    return {
        **report,
        "score": score,
        "threshold": threshold,
        "passes": (not hard_fail) and score >= threshold,
        "hard_fail": hard_fail,
        "word_count": word_count,
        "body_word_count": int(body_metrics.get("word_count") or 0) if lane == "editorial" else None,
        "body_paragraph_count": int(body_metrics.get("paragraph_count") or 0) if lane == "editorial" else None,
        "word_floor": _story_form_word_floor(story_brief) if lane == "editorial" else None,
        "reasons": _dedupe_clean_lines(reasons, minimum_len=4, limit=8),
    }


def _assess_grounded_editorial_candidate(
    text: str,
    *,
    title: str | None,
    recent_coverage: list[dict[str, object]] | None,
    repetition_guard: dict[str, object] | None,
    story_brief: dict[str, object],
    retrieval_bundle: dict[str, object],
    analysis_brief: dict[str, object] | None,
) -> dict[str, object]:
    style_report = _assess_style_candidate(
        text,
        lane="editorial",
        title=title,
        recent_coverage=recent_coverage,
        repetition_guard=repetition_guard,
        story_brief=story_brief,
    )
    grounding_report = _grounding_report(
        text,
        retrieval_bundle=retrieval_bundle,
        story_brief=story_brief,
        analysis_brief=analysis_brief,
    )
    return _apply_grounding_penalty(style_report, grounding_report)


def _political_focus_seed(retrieval_bundle: dict[str, object], story_brief: dict[str, object]) -> str:
    normalized_query = _normalize_prompt_topic(str(retrieval_bundle.get("query_text") or ""))
    candidate_lines = [
        str(story_brief.get("selected_angle") or ""),
        str(story_brief.get("freshest_evidence") or ""),
        normalized_query,
        str(story_brief.get("focus_label") or ""),
    ]
    for candidate in candidate_lines:
        cleaned = _clean_line(candidate)
        if _looks_like_prompt_instruction(cleaned):
            continue
        if cleaned and has_trump_focus(cleaned):
            return cleaned[:180]

    fallback = _clean_line(str(normalized_query or story_brief.get("focus_label") or ""))
    if fallback:
        if has_trump_focus(fallback):
            return fallback[:180]
        return _limit_text(f"Trump administration {fallback}", 180)
    return "Trump administration pattern watch"


def _story_evidence_lines(
    source: dict[str, object],
    *,
    query_text: str,
    limit: int = 1,
) -> list[str]:
    def _clean_story_support_line(text: str | None) -> str:
        cleaned = _clean_line(text or "")
        if not cleaned:
            return ""
        cleaned = re.sub(
            r"\b\d{1,2}\s+[A-Z][a-z]{2}\s+20\d{2},\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)\s+\w+\b",
            "",
            cleaned,
        )
        cleaned = re.sub(r"\b(?:LIVE|Live)\s+Updates?:\s*", "", cleaned)
        cleaned = re.sub(r"\s{2,}", " ", cleaned).strip(" -:|")
        return cleaned

    seen: set[str] = set()
    lines: list[str] = []
    candidates = [
        str(source.get("snippet") or ""),
        *[str(item) for item in (source.get("evidence_excerpts") or [])],
    ]
    for candidate in candidates:
        cleaned = _clean_story_support_line(candidate)
        if len(cleaned) < 40:
            continue
        if query_text and not _excerpt_matches_query_context(cleaned, query_text):
            continue
        fingerprint = _text_fingerprint(cleaned)
        if not fingerprint or fingerprint in seen:
            continue
        seen.add(fingerprint)
        lines.append(_limit_text(cleaned, 240))
        if len(lines) >= limit:
            break
    return lines[:limit]


def _story_support_snippet(source: dict[str, object], *, query_text: str) -> str:
    snippet = _clean_line(str(source.get("snippet") or ""))
    snippet = re.sub(
        r"\b\d{1,2}\s+[A-Z][a-z]{2}\s+20\d{2},\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)\s+\w+\b",
        "",
        snippet,
    )
    snippet = re.sub(r"\b(?:LIVE|Live)\s+Updates?:\s*", "", snippet)
    snippet = re.sub(r"\s{2,}", " ", snippet).strip(" -:|")
    if len(snippet) < 32:
        return ""
    if query_text and not _excerpt_matches_query_context(snippet, query_text):
        return ""
    return snippet


def _looks_truncated_source_line(text: str) -> bool:
    cleaned = _clean_line(text)
    if not cleaned:
        return False
    if "..." in cleaned or "…" in cleaned:
        return True
    return bool(re.search(r"\$[\d.,]+(?:\.\.\.|…)$", cleaned))


def _source_receipt_sentence(source: dict[str, object], *, role: str = "lead", query_text: str = "") -> str:
    title = _source_title_seed(source)
    fallback_title = ""
    raw_title = _clean_line(str(source.get("title") or ""))
    if raw_title and not _source_has_low_signal_title({"title": raw_title}):
        fallback_title = raw_title
    snippet = _story_support_snippet(source, query_text=query_text)
    evidence_excerpt = _clean_line(str((_story_evidence_lines(source, query_text=query_text, limit=1) or [""])[0] or ""))
    snippet = re.sub(r"^(?:\d+\s+(?:minute|hour|day|week)s?\s+ago|today|yesterday)\s*[|·-]\s*", "", snippet, flags=re.IGNORECASE)
    snippet = _limit_text(snippet, 160)
    evidence_excerpt = _limit_text(evidence_excerpt, 180)
    if _looks_truncated_source_line(snippet):
        snippet = ""
    if _looks_truncated_source_line(evidence_excerpt):
        evidence_excerpt = ""
    outlet = _source_display_name(source)
    if not title and not fallback_title and not snippet and not evidence_excerpt and not outlet:
        return ""

    if role == "lead":
        intro = "has the clearest receipt"
    elif role == "support":
        intro = "keeps the same pattern in view"
    else:
        intro = "adds another useful receipt"

    if outlet and title:
        sentence = f"{outlet} {intro}: {title}"
        if evidence_excerpt and evidence_excerpt.lower() not in sentence.lower():
            sentence = f"{sentence}. {evidence_excerpt}"
    elif title:
        sentence = f"{title}. {evidence_excerpt}" if evidence_excerpt and evidence_excerpt.lower() not in title.lower() else title
    elif fallback_title:
        sentence = f"{outlet} {intro}: {fallback_title}" if outlet else fallback_title
        if evidence_excerpt and evidence_excerpt.lower() not in sentence.lower():
            sentence = f"{sentence}. {evidence_excerpt}"
    elif outlet and snippet:
        sentence = f"{outlet} keeps the line concrete: {snippet}"
    elif evidence_excerpt and outlet:
        sentence = f"{outlet} keeps the line concrete: {evidence_excerpt}"
    else:
        sentence = evidence_excerpt or snippet or outlet

    return _terminal_sentence(_limit_text(sentence, 240))


def _outlet_mix_sentence(story_brief: dict[str, object]) -> str:
    source_mix = story_brief.get("source_mix") or {}
    if not isinstance(source_mix, dict):
        return ""
    top_outlets = [str(outlet) for outlet in (source_mix.get("top_outlets") or []) if _clean_line(str(outlet))]
    if not top_outlets:
        return ""
    outlet_text = ", ".join(_clean_line(outlet) for outlet in top_outlets[:3])
    return _terminal_sentence(f"The strongest source mix in this read runs through {outlet_text}")


def _fallback_pattern_signals(
    retrieval_bundle: dict[str, object],
    story_brief: dict[str, object],
    sources: list[dict[str, object]],
) -> list[str]:
    signal_candidates: list[str] = []
    for idx, source in enumerate(sources[:3], start=1):
        title = _source_title_seed(source) or _limit_text(_clean_line(str(source.get("snippet") or "")), 140)
        outlet = _source_display_name(source)
        if title and outlet:
            label = "Lead receipt" if idx == 1 else "Supporting receipt"
            signal_candidates.append(f"{label}: {outlet} keeps the angle on {title}")
    signal_candidates.extend(
        [
            str(story_brief.get("why_now") or ""),
            str(story_brief.get("trend_signal") or ""),
            _outlet_mix_sentence(story_brief),
            str(story_brief.get("audience_hook") or ""),
            str(story_brief.get("theme_context") or ""),
            _political_focus_seed(retrieval_bundle, story_brief),
        ]
    )
    signals = [
        _limit_text(signal, 180)
        for signal in _dedupe_clean_lines(signal_candidates, minimum_len=18, limit=6)
        if signal and not _looks_like_public_packet_meta_line(signal)
    ]
    if len(signals) < 2:
        signals = [
            _limit_text(signal, 180)
            for signal in _dedupe_clean_lines(
                [
                    _public_packet_line(
                        story_brief.get("freshest_evidence"),
                        story_brief.get("selected_angle"),
                        fallback=_political_focus_seed(retrieval_bundle, story_brief),
                    ),
                    _public_packet_line(
                        story_brief.get("why_now"),
                        story_brief.get("trend_signal"),
                        fallback="Fresh reporting is still forcing the line into something more concrete than spin.",
                    ),
                    _public_packet_line(
                        story_brief.get("audience_hook"),
                        story_brief.get("theme_context"),
                        fallback="Readers can see who gets protected, who absorbs the cost, and what the paperwork says anyway.",
                    ),
                ],
                minimum_len=16,
                limit=4,
            )
            if signal and not _looks_like_public_packet_meta_line(signal)
        ]
    return signals[:4]


def _fallback_focus_subject(*candidates: str) -> str:
    for candidate in candidates:
        cleaned = _clean_line(candidate)
        if cleaned and has_trump_focus(cleaned):
            return cleaned[:180]
    for candidate in candidates:
        cleaned = _clean_line(candidate)
        if cleaned:
            return cleaned[:180]
    return "Trump administration pattern watch"


def _fallback_public_sentence(text: str, *, focus_subject: str = "") -> str:
    cleaned = _clean_line(text)
    if not cleaned:
        return ""

    cleaned = re.sub(
        r"^(?:new receipt|fresh trigger|freshest evidence|angle shift|keep watching)\s*:\s*",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    lowered = cleaned.lower()
    if any(marker in lowered for marker in EDITORIAL_META_PHRASE_MARKERS):
        return ""
    if _looks_like_public_packet_meta_line(cleaned):
        return ""

    sentence = _terminal_sentence(cleaned)
    if focus_subject and sentence and not has_trump_focus(sentence):
        lead = sentence[0].lower() + sentence[1:] if len(sentence) > 1 else sentence.lower()
        sentence = _terminal_sentence(f"In {focus_subject.lower()}, {lead}")
    return _limit_text(sentence, 320)


def _fallback_public_paragraph(*sentences: str, focus_subject: str) -> str:
    lines: list[str] = []
    seen: set[str] = set()
    for sentence in sentences:
        candidate = _fallback_public_sentence(sentence, focus_subject=focus_subject if not lines else "")
        fingerprint = _text_fingerprint(candidate)
        if not candidate or not fingerprint or fingerprint in seen:
            continue
        seen.add(fingerprint)
        lines.append(candidate)
        if len(lines) >= 5:
            break
    return " ".join(lines).strip()


def _expand_fallback_body_sections(
    body_sections: list[str],
    supplemental_sections: list[str],
    *,
    story_brief: dict[str, object],
) -> list[str]:
    sections = [_clean_line(section) for section in body_sections if _clean_line(section)]
    extras = [_clean_line(section) for section in supplemental_sections if _clean_line(section)]
    if not sections:
        return []

    target_words = max(280, _target_body_word_range(story_brief)[0])
    total_words = sum(_word_count(section) for section in sections)
    for extra in extras:
        if total_words >= target_words:
            break
        if any(_text_fingerprint(extra) == _text_fingerprint(section) for section in sections):
            continue
        section_index = min(range(len(sections)), key=lambda idx: _word_count(sections[idx]))
        sections[section_index] = f"{sections[section_index]} {extra}".strip()
        total_words += _word_count(extra)
    return sections


def _build_grounded_editorial_fallback(
    retrieval_bundle: dict[str, object],
    story_brief: dict[str, object],
    *,
    object_type: str,
) -> str:
    raw_sources = retrieval_bundle.get("raw_sources", []) or []
    focus_query = _story_focus_query(
        selected_angle=str(story_brief.get("selected_angle") or ""),
        freshest_evidence=str(story_brief.get("freshest_evidence") or ""),
        fallback_query=str(retrieval_bundle.get("query_text") or ""),
    )
    preferred_sources = _preferred_story_sources(
        raw_sources,
        limit=3,
        query_text=focus_query or str(retrieval_bundle.get("query_text") or ""),
    ) or raw_sources[:3]
    political_seed = _political_focus_seed(retrieval_bundle, story_brief)
    selected_angle = _clean_line(str(story_brief.get("selected_angle") or ""))
    freshest_evidence = _clean_line(str(story_brief.get("freshest_evidence") or ""))
    why_now = _terminal_sentence(str(story_brief.get("why_now") or "")) or _terminal_sentence(
        "Fresh reporting keeps the Trump story live enough to merit a tight read"
    )
    trend_signal = _clean_line(str(story_brief.get("trend_signal") or ""))
    theme_context = _clean_line(str(story_brief.get("theme_context") or ""))
    audience_hook = _clean_line(str(story_brief.get("audience_hook") or ""))
    continuity_note = _clean_line(str(story_brief.get("continuity_note") or ""))
    story_mode = _clean_line(str(story_brief.get("story_mode") or _story_mode_label(object_type)))
    story_form_key = str(story_brief.get("story_form") or "").strip().lower()
    focus_label = _clean_line(str(story_brief.get("focus_label") or story_mode or political_seed))
    body_paragraphs = max(2, int(story_brief.get("body_paragraphs") or 3))
    raw_extra_heading = str(story_brief.get("extra_heading") or "").strip()
    extra_heading = _clean_line(raw_extra_heading)
    extra_count = max(0, int(story_brief.get("extra_count") or 0))

    headline_seed = (
        selected_angle
        if selected_angle and has_trump_focus(selected_angle)
        else freshest_evidence
        if freshest_evidence and has_trump_focus(freshest_evidence)
        else political_seed
    )
    headline = _story_form_headline(headline_seed or political_seed, story_form_key=story_form_key, focus_label=focus_label)
    focus_subject = _fallback_focus_subject(focus_label, selected_angle, freshest_evidence, political_seed, headline)
    dek = _limit_text(
        _clean_line(str(story_brief.get("why_now") or "")) or f"Grounded on {freshest_evidence or political_seed}.",
        220,
    )

    lead_sentence = _terminal_sentence(f"{headline} is the cleanest read on the board right now")
    focus_query = _story_focus_query(
        selected_angle=selected_angle,
        freshest_evidence=freshest_evidence,
        fallback_query=str(retrieval_bundle.get("query_text") or ""),
    )
    source_focus_query = focus_query or str(retrieval_bundle.get("query_text") or "")
    lead_receipt = (
        _source_receipt_sentence(preferred_sources[0], role="lead", query_text=source_focus_query)
        if preferred_sources
        else ""
    )
    support_receipt = (
        _source_receipt_sentence(preferred_sources[1], role="support", query_text=source_focus_query)
        if len(preferred_sources) > 1
        else ""
    )
    third_receipt = (
        _source_receipt_sentence(preferred_sources[2], role="support", query_text=source_focus_query)
        if len(preferred_sources) > 2
        else ""
    )
    outlet_mix = _outlet_mix_sentence(story_brief)

    pattern_signals = _fallback_pattern_signals(retrieval_bundle, story_brief, preferred_sources)
    if len(pattern_signals) < 2:
        pattern_signals = [
            _limit_text(_political_focus_seed(retrieval_bundle, story_brief), 180),
            _limit_text(_clean_line(str(story_brief.get("why_now") or why_now)), 180),
        ]

    if story_form_key == "lead_update":
        body_sections = [
            _fallback_public_paragraph(
                f"What changed in {focus_subject} is now on the page, and the cleanest receipt is finally doing the talking",
                lead_receipt or why_now,
                support_receipt,
                f"The Trump story here is that {selected_angle or headline} keeps reading differently once the paperwork is doing the speaking.",
                focus_subject=focus_subject,
            ),
            _fallback_public_paragraph(
                why_now,
                continuity_note,
                trend_signal,
                audience_hook or f"For readers, {focus_subject.lower()} matters because the costs land before the talking points do.",
                outlet_mix or third_receipt,
                focus_subject=focus_subject,
            ),
        ]
        extra_candidates = [
            freshest_evidence,
            selected_angle,
            why_now,
            trend_signal,
            continuity_note,
        ]
    elif story_form_key == "theme_update":
        body_sections = [
            _fallback_public_paragraph(
                f"In {focus_subject}, the new turn is {selected_angle or headline}",
                lead_receipt or why_now,
                support_receipt,
                focus_subject=focus_subject,
            ),
            _fallback_public_paragraph(
                why_now,
                continuity_note,
                theme_context,
                third_receipt or outlet_mix,
                f"The administration would prefer {focus_subject.lower()} to read like a quick reset, but the receipts are moving in the opposite direction.",
                focus_subject=focus_subject,
            ),
        ]
        extra_candidates = [
            freshest_evidence,
            trend_signal,
            why_now,
            audience_hook,
            continuity_note,
        ]
    elif story_form_key == "notebook_entry":
        body_sections = [
            _fallback_public_paragraph(
                f"{focus_subject} stays in the notebook because the receipts keep moving",
                lead_receipt or why_now,
                support_receipt,
                focus_subject=focus_subject,
            ),
            _fallback_public_paragraph(
                why_now,
                theme_context,
                trend_signal,
                outlet_mix or third_receipt,
                focus_subject=focus_subject,
            ),
            _fallback_public_paragraph(
                continuity_note,
                audience_hook,
                f"The point of keeping {focus_subject.lower()} open is that the official line is still losing ground to the record.",
                focus_subject=focus_subject,
            ),
        ]
        extra_candidates = [
            selected_angle,
            freshest_evidence,
            trend_signal,
            why_now,
            audience_hook,
        ]
    elif story_form_key == "theme_column":
        body_sections = [
            _fallback_public_paragraph(
                lead_sentence,
                lead_receipt,
                support_receipt or why_now,
                f"The clean version of {focus_subject.lower()} still comes apart once the institutional actors are on the record.",
                focus_subject=focus_subject,
            ),
            _fallback_public_paragraph(
                theme_context,
                trend_signal,
                third_receipt or outlet_mix,
                f"What keeps this lane alive is that {focus_subject.lower()} now has multiple receipts pulling in the same direction.",
                focus_subject=focus_subject,
            ),
            _fallback_public_paragraph(
                continuity_note,
                "The bigger story is the administration trying to sell a cleaner line than the record will allow.",
                audience_hook,
                focus_subject=focus_subject,
            ),
            _fallback_public_paragraph(
                freshest_evidence or why_now,
                f"The consequence in {focus_subject.lower()} is that the paper trail keeps asking for more seriousness than the performance offers.",
                "That is where the column earns its point: the Trump line gets judged by the cleanup it creates, not the shine it borrows.",
                focus_subject=focus_subject,
            ),
        ]
        extra_candidates = [continuity_note, why_now, freshest_evidence, *pattern_signals]
    else:
        body_sections = [
            _fallback_public_paragraph(
                lead_sentence,
                lead_receipt,
                support_receipt or why_now,
                f"The first read on {focus_subject.lower()} is already under strain once the source trail is laid out in full.",
                focus_subject=focus_subject,
            ),
            _fallback_public_paragraph(
                theme_context or why_now,
                f"{trend_signal} is the bigger pattern underneath this cycle" if trend_signal else "",
                outlet_mix or third_receipt,
                focus_subject=focus_subject,
            ),
            _fallback_public_paragraph(
                continuity_note,
                f"This {story_mode.lower() or 'piece'} should move from the receipts to the consequence instead of pretending the archive has no memory.",
                audience_hook,
                focus_subject=focus_subject,
            ),
            _fallback_public_paragraph(
                freshest_evidence,
                "The point is to move the notebook forward while the facts are still changing.",
                third_receipt if third_receipt and not outlet_mix else "",
                focus_subject=focus_subject,
            ),
        ]
        extra_candidates = [continuity_note, why_now, freshest_evidence, *pattern_signals]

    if not preferred_sources:
        body_sections[0] = _fallback_public_paragraph(
            f"{focus_subject} stays on the watch board even with a thinner source mix",
            why_now,
            "That means the read stays tied to the strongest documented signal instead of pretending to know more than the receipts allow.",
            focus_subject=focus_subject,
        )
        if len(body_sections) > 1 and not _clean_line(body_sections[1]):
            body_sections[1] = _fallback_public_paragraph(
                theme_context or "The pattern still matters because the recent reporting window has not fully cooled.",
                trend_signal,
                focus_subject=focus_subject,
            )

    supplemental_sections = [
        _fallback_public_paragraph(
            "The first job is to separate the public performance from the institutional burden it creates.",
            "That keeps the piece attached to evidence instead of treating the newest outrage as self-explanatory.",
            f"The useful read on {focus_subject.lower()} starts with what the administration asks everyone else to absorb.",
            focus_subject="",
        ),
        _fallback_public_paragraph(
            "The second job is to show how the same pattern keeps resurfacing under a different headline.",
            f"The pressure point in {focus_subject.lower()} is that the record is moving faster than the public sales pitch.",
            "That movement gives the piece its spine: promise, receipt, consequence.",
            focus_subject="",
        ),
        _fallback_public_paragraph(
            "The third job is to make the cost legible without pretending every new detail is equally important.",
            f"For the site, {focus_subject.lower()} is the kind of story that gets cleaner, not calmer, once the receipts stack up.",
            "The stronger inference comes from the combination of sources, not from one overworked sentence.",
            focus_subject="",
        ),
        _fallback_public_paragraph(
            f"The useful question is who gets the performance value from {focus_subject.lower()} and who has to carry the operational risk after the applause fades.",
            "That is the difference between a message event and a governing record.",
            f"The Trump White House can sell the first part quickly, but the second part stays with the institutions asked to make the story hold.",
            focus_subject="",
        ),
        _fallback_public_paragraph(
            f"The administrative tell in {focus_subject.lower()} is the distance between the clean public line and the messier work of implementation.",
            "Courts, markets, agencies, allies, and voters tend to find that distance before the talking points admit it.",
            "The record matters because it measures the cleanup, not the pose.",
            focus_subject="",
        ),
        _fallback_public_paragraph(
            f"The political cost of {focus_subject.lower()} is cumulative, because each new receipt makes the prior reassurance harder to sell.",
            "That is why the strongest version of the piece follows the paper trail before it delivers the sting.",
            "A good close does not need to overstate the case when the sequence is already doing the damage.",
            focus_subject="",
        ),
        _fallback_public_paragraph(
            f"The close has to land on consequence: {focus_subject.lower()} is not just a fresh item, it is another test of whether the official story can survive contact with the record.",
            "That is the useful inference from the sources, and it is the part worth publishing.",
            "When the record is this loud, restraint is sharper than decoration.",
            focus_subject="",
        ),
    ]

    extra_lines = _dedupe_clean_lines(
        [
            _fallback_public_sentence(candidate, focus_subject=focus_subject)
            for candidate in extra_candidates
        ],
        minimum_len=18,
        limit=max(0, extra_count),
    )
    body_sections = _expand_fallback_body_sections(
        body_sections,
        supplemental_sections,
        story_brief=story_brief,
    )
    paragraph_candidates = [
        _clean_line(section)
        for section in body_sections
        if _clean_line(section)
    ]
    supplemental_candidates = [
        _clean_line(section)
        for section in supplemental_sections
        if _clean_line(section)
    ]
    if len(paragraph_candidates) < body_paragraphs:
        for section in supplemental_candidates:
            if any(_text_fingerprint(section) == _text_fingerprint(existing) for existing in paragraph_candidates):
                continue
            paragraph_candidates.append(section)
            if len(paragraph_candidates) >= body_paragraphs:
                break
    body_sections = _dedupe_clean_lines(paragraph_candidates, minimum_len=60, limit=max(body_paragraphs, len(paragraph_candidates)))
    if len(body_sections) < body_paragraphs:
        body_sections.extend(
            section
            for section in paragraph_candidates
            if _clean_line(section) and section not in body_sections and len(body_sections) < body_paragraphs
        )
    body_sections = body_sections[:body_paragraphs]
    body_parts = [
        f"# {headline}",
        dek,
        *body_sections,
        *([raw_extra_heading or extra_heading, *[f"- {line}" for line in extra_lines]] if extra_heading and extra_lines else []),
        "## Pattern Signals",
        *[f"- {signal}" for signal in pattern_signals[:4]],
    ]
    return "\n\n".join(part for part in body_parts if _clean_line(part))


def _live_intent_candidate(
    intent: str,
    *,
    anchor: str,
    freshest_evidence: str,
    lead_receipt: str,
    support_receipt: str,
    why_now: str,
) -> str:
    normalized_intent = slugify_loose(intent).replace("-", "_")
    if normalized_intent == "reading_room":
        return (
            f"{anchor}. {lead_receipt} Put this one on the reading-room shelf before the spin hardens."
            if lead_receipt
            else f"{anchor}. {freshest_evidence} belongs on the reading-room shelf because the receipt is cleaner than the performance."
        )
    if normalized_intent == "group_chat":
        return (
            f"{anchor}. {freshest_evidence} is the screenshot answer when the group chat asks what the record actually says."
            if freshest_evidence
            else f"{anchor}. {why_now} This is the group-chat answer because the receipt is doing more work than the spin."
        )
    if normalized_intent == "notebook":
        return (
            f"{anchor}. {lead_receipt} Logging it here because the paperwork keeps telling on the performance."
            if lead_receipt
            else f"{anchor}. {why_now} Logging it here because the pattern keeps surviving the spin."
        )
    return (
        f"{anchor}. {freshest_evidence} is the line to keep open tonight. The receipts are doing more work than the spin."
        if freshest_evidence
        else f"{anchor}. {why_now}"
    )


def _build_live_social_fallback_candidates(
    prompt: str,
    intent: str,
    retrieval_bundle: dict[str, object],
    story_brief: dict[str, object],
) -> list[str]:
    raw_sources = retrieval_bundle.get("raw_sources", []) or []
    focus_query = _story_focus_query(
        selected_angle=str(story_brief.get("selected_angle") or ""),
        freshest_evidence=str(story_brief.get("freshest_evidence") or ""),
        fallback_query=str(retrieval_bundle.get("query_text") or prompt or ""),
    )
    preferred_sources = _preferred_story_sources(
        raw_sources,
        limit=2,
        query_text=focus_query or str(retrieval_bundle.get("query_text") or prompt or ""),
    ) or raw_sources[:2]
    selected_angle = _clean_line(str(story_brief.get("selected_angle") or ""))
    prompt_topic = _normalize_prompt_topic(prompt)
    why_now = _terminal_sentence(str(story_brief.get("why_now") or "")) or _terminal_sentence(
        "Fresh reporting keeps the Trump story live"
    )
    freshest_evidence = _clean_line(str(story_brief.get("freshest_evidence") or ""))
    political_seed = _political_focus_seed(retrieval_bundle, story_brief)
    anchor = (
        selected_angle
        if selected_angle and has_trump_focus(selected_angle)
        else prompt_topic
        if prompt_topic and has_trump_focus(prompt_topic)
        else political_seed
    )
    source_focus_query = focus_query or str(retrieval_bundle.get("query_text") or prompt or "")
    lead_receipt = (
        _source_receipt_sentence(preferred_sources[0], role="lead", query_text=source_focus_query)
        if preferred_sources
        else ""
    )
    support_receipt = (
        _source_receipt_sentence(preferred_sources[1], role="support", query_text=source_focus_query)
        if len(preferred_sources) > 1
        else ""
    )
    intent_label = _clean_line(intent.replace("_", " ")) or "response"

    candidates = _dedupe_social_candidates(
        [
            _live_intent_candidate(
                intent,
                anchor=anchor,
                freshest_evidence=freshest_evidence,
                lead_receipt=lead_receipt,
                support_receipt=support_receipt,
                why_now=why_now,
            ),
            f"{anchor}. {freshest_evidence} is the freshest receipt. {why_now}" if freshest_evidence else "",
            f"{anchor}. {lead_receipt} {why_now}",
            f"{anchor}. {support_receipt or why_now} This {intent_label} stays with the documented receipts.",
        ],
        minimum_len=72,
        limit=4,
    )

    normalized: list[str] = []
    for candidate in candidates:
        polished = _limit_text(_apply_voice_polish(candidate, lane="live_social"), 260)
        if not polished or _looks_like_prompt_instruction(polished):
            continue
        text = polished if has_trump_focus(polished) else f"Trump watch: {polished}"
        normalized.append(_limit_text(text, 260))
    return _dedupe_social_candidates(normalized, minimum_len=72, limit=4)[:4]


def _frontpage_source_ready(source: Source, *, min_quality: float) -> bool:
    assessment = source_current_news_assessment(source)
    if str(assessment.get("source_kind") or "other") not in SHOWCASE_SOURCE_KINDS:
        return False
    if not bool(assessment.get("current_news_eligible")):
        return False
    age_days = assessment.get("age_days")
    if int(age_days if age_days is not None else 9999) > int(settings.current_news_max_age_days):
        return False
    if _safe_float(assessment.get("quality_score")) < min_quality:
        return False
    title = _clean_line(source.title or "")
    if not title or title.endswith("...") or "..." in title:
        return False
    if any(marker in title.lower() for marker in ANGLE_REJECT_MARKERS):
        return False
    if not _source_title_seed(
        {
            "title": source.title,
            "snippet": str((source.meta or {}).get("search_snippet") or ""),
            "source_kind": str(assessment.get("source_kind") or "other"),
            "source_name": source.source_name,
            "source_label": assessment.get("source_label"),
        }
    ):
        return False
    return True


def _social_post_frontpage_ready(post: SocialPost) -> bool:
    style_gate = (post.meta or {}).get("style_gate") or evaluate_style_gate(post.body or "", lane="social")
    body = _clean_line(post.body or "")
    if not body:
        return False
    if editorial_looks_placeholder("", body):
        return False
    if contains_prompt_leak(body):
        return False
    if not bool(style_gate.get("passes")):
        return False
    return has_trump_focus(body, str((post.meta or {}).get("editorial_angle") or ""))


def _curate_source_links(recent_sources: list[Source], *, limit: int, min_quality: float) -> list[dict[str, object]]:
    links: list[dict[str, object]] = []
    seen_urls: set[str] = set()
    seen_hosts: set[str] = set()
    seen_titles: set[str] = set()
    ranked = sorted(
        recent_sources,
        key=lambda row: (
            _credibility_priority((row.meta or {}).get("credibility_tier")),
            _safe_float((row.meta or {}).get("quality_score")),
            _safe_float((row.meta or {}).get("editorial_priority_score")),
            (row.published_at or row.fetched_at or datetime.min).isoformat()
            if (row.published_at or row.fetched_at)
            else "",
        ),
        reverse=True,
    )
    for source in ranked:
        url = source.source_url or source.canonical_url or ""
        if not url or url in seen_urls:
            continue
        if not _frontpage_source_ready(source, min_quality=min_quality):
            continue
        assessment = source_current_news_assessment(source)
        host = _clean_line(str(assessment.get("source_host") or ""))
        title = _clean_line(source.title or "Untitled source")
        title_key = re.sub(r"[^a-z0-9]+", " ", title.lower()).strip()
        if host and host in seen_hosts:
            continue
        if title_key and title_key in seen_titles:
            continue
        seen_urls.add(url)
        if host:
            seen_hosts.add(host)
        if title_key:
            seen_titles.add(title_key)
        links.append(
            {
                "title": title,
                "url": url,
                "source_name": _clean_line(str(assessment.get("source_label") or source.source_name or "news desk")),
                "quality_score": _safe_float((source.meta or {}).get("quality_score")),
                "credibility_tier": str((source.meta or {}).get("credibility_tier") or ""),
                "source_kind": str(assessment.get("source_kind") or (source.meta or {}).get("source_kind") or "other"),
            }
        )
        if len(links) >= limit:
            break
    return links


def _looks_like_dek_block(block: str, *, remaining_blocks: int) -> bool:
    if remaining_blocks <= 0:
        return False
    word_count = _word_count(block)
    if word_count < 6 or word_count > 36:
        return False
    if "\n" in block:
        return False
    return _sentence_count(block) <= 2


def _body_paragraphs(body: str | None) -> list[str]:
    if not body:
        return []

    blocks = [chunk.strip() for chunk in re.split(r"\n\s*\n", body) if chunk.strip()]
    paragraphs: list[str] = []
    dek_consumed = False
    body_started = False
    for index, chunk in enumerate(blocks):
        lines: list[str] = []
        chunk_lines = [raw.strip() for raw in chunk.splitlines() if raw.strip()]
        if not chunk_lines:
            continue
        if chunk_lines[0].lower().startswith("story form label:"):
            continue
        if chunk_lines[0].startswith("##"):
            if body_started:
                break
            continue
        for raw in chunk.splitlines():
            line = raw.strip()
            if not line:
                continue
            if line.startswith("#") or line.startswith("-") or line.startswith("*"):
                continue
            match = SECTION_LABEL_RE.match(line)
            if match and match.group(1).lower().startswith("pattern signal"):
                continue
            if match:
                if match.group(1).lower().startswith("story form label"):
                    continue
                value = _clean_line(match.group(2))
                if value:
                    lines.append(value)
                continue
            cleaned = _clean_line(line.lstrip(">"))
            if cleaned:
                lines.append(cleaned)
        paragraph = " ".join(lines).strip()
        if paragraph:
            if not dek_consumed and _looks_like_dek_block(paragraph, remaining_blocks=len(blocks) - index - 1):
                dek_consumed = True
                continue
            body_started = True
            paragraphs.append(paragraph)
    return paragraphs


def _body_metrics(body: str | None) -> dict[str, int]:
    paragraphs = _body_paragraphs(body)
    return {
        "paragraph_count": len(paragraphs),
        "word_count": sum(_word_count(paragraph) for paragraph in paragraphs),
    }


def _extract_pattern_signals(body: str | None) -> list[str]:
    if not body:
        return []

    signals: list[str] = []
    in_signal_block = False
    for raw in body.splitlines():
        line = raw.strip()
        if not line:
            continue
        if re.match(r"^##+\s*pattern signals\b", line, flags=re.IGNORECASE):
            in_signal_block = True
            continue
        label_match = SECTION_LABEL_RE.match(line)
        if label_match and label_match.group(1).lower().startswith("pattern signal"):
            in_signal_block = True
            inline = _clean_line(label_match.group(2))
            if inline:
                signals.append(inline)
            continue
        if in_signal_block:
            if line.startswith("#"):
                break
            value = _clean_line(line.replace("- ", "", 1))
            if value:
                signals.append(value)
    return _dedupe_clean_lines(signals, minimum_len=10, limit=4)


def _story_mode_label(object_type: str) -> str:
    if object_type == "lead_story":
        return "Lead Story"
    if object_type == "theme_take":
        return "Theme Take"
    return object_type.replace("_", " ").title()


def _analysis_meta(analysis_brief: dict[str, object] | None) -> dict[str, object]:
    if not isinstance(analysis_brief, dict):
        return {}
    meta = analysis_brief.get("meta")
    return meta if isinstance(meta, dict) else {}


def _analysis_lines(values: object, *, minimum_len: int = 12, limit: int = 4) -> list[str]:
    if not isinstance(values, list):
        return []
    return _dedupe_clean_lines([str(value) for value in values], minimum_len=minimum_len, limit=limit)


def _build_story_brief(
    retrieval_bundle: dict,
    *,
    object_type: str,
    theme: Theme | None = None,
    directive: str = "",
    recent_coverage: list[dict[str, object]] | None = None,
    analysis_brief: dict[str, object] | None = None,
) -> dict[str, object]:
    recent_coverage = recent_coverage or []
    sources = retrieval_bundle.get("raw_sources", []) or []
    trends = retrieval_bundle.get("trend_ledger", []) or []
    focus_theme = retrieval_bundle.get("focus_theme") or {}
    analysis_meta = _analysis_meta(analysis_brief)
    analysis_focus_label = _clean_line(analysis_meta.get("focus_label") or (analysis_brief or {}).get("label") or "")
    analysis_theme_slug = _clean_line(analysis_meta.get("theme_slug") or "")
    analysis_selected_angle = _clean_line(analysis_meta.get("selected_angle") or (analysis_brief or {}).get("title") or "")
    analysis_pattern = _clean_line(analysis_meta.get("pattern") or "")
    analysis_contradiction = _clean_line(analysis_meta.get("contradiction_core") or "")
    analysis_why_now = _clean_line(analysis_meta.get("why_now") or (analysis_brief or {}).get("summary") or "")
    analysis_tone = analysis_meta.get("tone") if isinstance(analysis_meta.get("tone"), dict) else {}
    analysis_story_targets = (
        analysis_meta.get("story_targets") if isinstance(analysis_meta.get("story_targets"), dict) else {}
    )
    analysis_flags = analysis_meta.get("analysis_flags") if isinstance(analysis_meta.get("analysis_flags"), dict) else {}
    analysis_social_hooks = _analysis_lines(analysis_meta.get("social_hooks"), minimum_len=14, limit=4)
    analysis_open_loops = _analysis_lines(analysis_meta.get("open_loops"), minimum_len=14, limit=4)
    analysis_source_roles = analysis_meta.get("source_roles") if isinstance(analysis_meta.get("source_roles"), list) else []
    analysis_dialectic = analysis_meta.get("dialectic") if isinstance(analysis_meta.get("dialectic"), dict) else {}
    thesis_to_prove = _clean_line(analysis_dialectic.get("thesis") or analysis_selected_angle)
    counterforce = _clean_line(analysis_dialectic.get("counterforce") or "")
    synthesis_to_land = _clean_line(analysis_dialectic.get("synthesis") or "")
    gold_thread = _clean_line(analysis_dialectic.get("gold_thread") or "")
    writer_north_star = _clean_line(analysis_dialectic.get("writer_north_star") or "")
    normalized_query_text = _normalize_prompt_topic(str(retrieval_bundle.get("query_text") or ""))
    initial_story_focus_query = _story_focus_query(
        selected_angle=analysis_selected_angle,
        source_roles=analysis_source_roles,
        fallback_query=normalized_query_text,
    )
    preferred_sources = _preferred_story_sources(
        sources,
        limit=4,
        query_text=initial_story_focus_query or normalized_query_text,
    )
    theme_slug = (theme.slug if theme else None) or str(focus_theme.get("slug") or "") or analysis_theme_slug

    theme_name = _clean_line(
        (theme.name if theme else None)
        or focus_theme.get("name")
        or analysis_focus_label
        or _friendly_focus_label(normalized_query_text, object_type=object_type)
        or normalized_query_text
        or object_type.replace("_", " ")
    )
    theme_description = _clean_line((theme.description if theme else None) or focus_theme.get("description") or "")
    top_source = preferred_sources[0] if preferred_sources else (sources[0] if sources else {})
    second_source = preferred_sources[1] if len(preferred_sources) > 1 else (sources[1] if len(sources) > 1 else {})
    freshest_age_days = min((int(source.get("age_days") or 0) for source in sources), default=None)
    top_outlets = _dedupe_clean_lines(
        [_source_display_name(source) for source in preferred_sources or sources],
        minimum_len=2,
        limit=4,
    )
    avg_quality = round(sum(_safe_float(source.get("quality_score")) for source in sources) / len(sources), 2) if sources else 0.0
    high_credibility_count = sum(1 for source in sources if str(source.get("credibility_tier") or "") == "high")
    freshest_title = _source_title_seed(top_source) or _source_title_seed(second_source)
    freshest_evidence = freshest_title
    if freshest_title:
        outlet_name = _source_display_name(top_source or second_source)
        freshest_evidence = f"{freshest_title} ({outlet_name})" if outlet_name else freshest_title

    trend_signal = _aligned_trend_signal(
        trends,
        theme_name=theme_name,
        theme_slug=theme_slug,
        query_text=normalized_query_text,
    ) or analysis_pattern
    angle_candidates = [
        analysis_selected_angle,
        _source_title_seed(top_source),
        _source_title_seed(second_source),
        trend_signal,
        normalized_query_text or theme_name,
    ]
    selected_angle_value = _pick_distinct_angle(angle_candidates, recent_coverage) or theme_name
    story_focus_query = _story_focus_query(
        selected_angle=selected_angle_value,
        source_roles=analysis_source_roles,
        fallback_query=normalized_query_text,
    )
    preferred_sources = _preferred_story_sources(
        sources,
        limit=4,
        query_text=story_focus_query or normalized_query_text,
    )
    top_source = preferred_sources[0] if preferred_sources else (sources[0] if sources else {})
    second_source = preferred_sources[1] if len(preferred_sources) > 1 else (sources[1] if len(sources) > 1 else {})
    top_outlets = _dedupe_clean_lines(
        [_source_display_name(source) for source in preferred_sources or sources],
        minimum_len=2,
        limit=4,
    )
    freshest_title = _source_title_seed(top_source) or _source_title_seed(second_source)
    freshest_evidence = freshest_title
    if freshest_title:
        outlet_name = _source_display_name(top_source or second_source)
        freshest_evidence = f"{freshest_title} ({outlet_name})" if outlet_name else freshest_title
    directive_line = _clean_line(directive.splitlines()[0]) if directive.strip() else ""
    story_form = _story_form_profile(
        object_type=object_type,
        theme_slug=theme_slug,
        freshest_age_days=freshest_age_days,
        recent_coverage=recent_coverage,
    )
    analysis_story_form = str(analysis_story_targets.get("long_form") or "").strip().lower()
    if _analysis_story_form_is_compatible(object_type, analysis_story_form):
        story_form = {"key": analysis_story_form, **STORY_FORM_PROFILES[analysis_story_form]}
    why_now = _story_why_now_line(
        analysis_why_now or _build_why_now_line(
            preferred_sources or sources[:2],
            theme_name=theme_name,
            trend_signal=trend_signal,
            recent_coverage=recent_coverage,
        ),
        selected_angle=selected_angle_value,
        freshest_evidence=freshest_evidence,
        focus_label=theme_name,
    )
    continuity_note = _build_continuity_note(
        object_type=object_type,
        theme_name=theme_name,
        recent_coverage=recent_coverage,
    )
    if analysis_open_loops:
        continuity_note = _limit_text(f"{continuity_note} {_terminal_sentence(analysis_open_loops[0])}", 260)
    repetition_guard = _build_repetition_guard(recent_coverage, current_angle=selected_angle_value)

    directive_hook = _story_specific_directive_hook(
        directive_line,
        normalized_query_text=normalized_query_text,
        theme_name=theme_name,
    )
    audience_hook = (
        directive_hook
        or _clean_line(analysis_meta.get("audience_value") or analysis_contradiction)
        or writer_north_star
        or f"Give readers the contradiction behind {theme_name.lower() or 'this pattern'} before the talking points harden."
    )
    contradiction_map = [
        {
            "title": _source_title_seed(source)
            or _limit_text(_clean_line(str(source.get("snippet") or "")), 140)
            or _source_display_name(source),
            "outlet": _source_display_name(source),
            "quality_score": _safe_float(source.get("quality_score")),
            "age_days": source.get("age_days"),
            "credibility_tier": source.get("credibility_tier"),
        }
        for source in (preferred_sources or sources[:3])
        if _clean_line(source.get("title") or "")
    ]
    if analysis_source_roles:
        contradiction_map = [
            {
                "title": _clean_line((source or {}).get("title") or (source or {}).get("role_label") or theme_name),
                "outlet": _clean_line((source or {}).get("outlet") or ""),
                "quality_score": _safe_float((source or {}).get("quality_score")),
                "age_days": (source or {}).get("age_days"),
                "credibility_tier": None,
            }
            for source in analysis_source_roles[:3]
            if _clean_line((source or {}).get("title") or (source or {}).get("role_label") or "")
        ] or contradiction_map
    nearby_coverage = [
        {
            "title": _clean_line(str(item.get("title") or "")),
            "story_mode": _clean_line(str(item.get("story_mode") or "")),
            "selected_angle": _clean_line(str(item.get("selected_angle") or "")),
            "time_label": _coverage_time_label(item),
        }
        for item in recent_coverage[:4]
        if _clean_line(str(item.get("title") or ""))
    ]
    headline_seeds = [
        entry[:120]
        for entry in _dedupe_clean_lines(
            [analysis_selected_angle, analysis_pattern, selected_angle_value, trend_signal, theme_name, freshest_title, freshest_evidence],
            minimum_len=10,
            limit=4,
        )
    ]
    social_hooks = [
        entry[:220]
        for entry in _dedupe_clean_lines(
            [
                *analysis_social_hooks,
                selected_angle_value,
                why_now,
                freshest_evidence,
                trend_signal,
                thesis_to_prove,
                synthesis_to_land,
                gold_thread,
                writer_north_star,
                continuity_note,
                audience_hook,
                "" if theme_description.lower().startswith("recurring pattern bucket:") else theme_description,
            ],
            minimum_len=14,
            limit=4,
        )
    ]
    argument_spine = _story_argument_spine(
        selected_angle=selected_angle_value,
        why_now=why_now,
        query_text=story_focus_query or selected_angle_value or normalized_query_text,
        preferred_sources=preferred_sources or sources[:3],
        analysis_flags=analysis_flags,
        counterforce=counterforce,
        synthesis_to_land=synthesis_to_land,
        gold_thread=gold_thread,
        writer_north_star=writer_north_star,
    )

    return {
        "story_mode": str(story_form.get("label") or _story_mode_label(object_type)),
        "story_form": str(story_form.get("key") or ""),
        "form_instruction": str(story_form.get("instruction") or ""),
        "body_paragraphs": int(story_form.get("body_paragraphs") or 3),
        "extra_heading": str(story_form.get("extra_heading") or ""),
        "extra_label": str(story_form.get("extra_label") or ""),
        "extra_count": int(story_form.get("extra_count") or 0),
        "target_words": str(story_form.get("target_words") or ""),
        "focus_label": theme_name,
        "theme_slug": theme_slug or focus_theme.get("slug"),
        "selected_angle": selected_angle_value,
        "why_now": why_now,
        "freshest_evidence": freshest_evidence,
        "trend_signal": trend_signal,
        "theme_context": theme_description,
        "audience_hook": audience_hook,
        "continuity_note": continuity_note,
        "repetition_guard": repetition_guard,
        "nearby_coverage": nearby_coverage,
        "headline_seeds": headline_seeds,
        "social_hooks": social_hooks,
        "source_mix": {
            "count": len(sources),
            "high_credibility_count": high_credibility_count,
            "avg_quality": avg_quality,
            "freshest_age_days": freshest_age_days,
            "top_outlets": top_outlets,
        },
        "contradiction_map": contradiction_map,
        "analysis_summary": _clean_line((analysis_brief or {}).get("summary") or analysis_pattern or ""),
        "analysis_tone": analysis_tone,
        "analysis_open_loops": analysis_open_loops,
        "analysis_story_targets": analysis_story_targets,
        "analysis_source_roles": analysis_source_roles[:4],
        "analysis_dialectic": analysis_dialectic,
        "analysis_flags": analysis_flags,
        "argument_spine": argument_spine,
        "thesis_to_prove": thesis_to_prove,
        "counterforce": counterforce,
        "synthesis_to_land": synthesis_to_land,
        "gold_thread": gold_thread,
        "writer_north_star": writer_north_star,
    }


def _format_story_brief(story_brief: dict[str, object]) -> str:
    lines = ["Story brief:"]
    story_mode = _clean_line(str(story_brief.get("story_mode") or ""))
    focus = _clean_line(str(story_brief.get("focus_label") or ""))
    selected_angle = _clean_line(str(story_brief.get("selected_angle") or ""))
    why_now = _clean_line(str(story_brief.get("why_now") or ""))
    freshest = _clean_line(str(story_brief.get("freshest_evidence") or ""))
    trend_signal = _clean_line(str(story_brief.get("trend_signal") or ""))
    audience_hook = _clean_line(str(story_brief.get("audience_hook") or ""))
    continuity_note = _clean_line(str(story_brief.get("continuity_note") or ""))
    analysis_summary = _clean_line(str(story_brief.get("analysis_summary") or ""))
    thesis_to_prove = _clean_line(str(story_brief.get("thesis_to_prove") or ""))
    counterforce = _clean_line(str(story_brief.get("counterforce") or ""))
    synthesis_to_land = _clean_line(str(story_brief.get("synthesis_to_land") or ""))
    gold_thread = _clean_line(str(story_brief.get("gold_thread") or ""))
    writer_north_star = _clean_line(str(story_brief.get("writer_north_star") or ""))
    target_words = _clean_line(str(story_brief.get("target_words") or ""))
    form_instruction = _clean_line(str(story_brief.get("form_instruction") or ""))
    repetition_guard = story_brief.get("repetition_guard") or {}
    source_mix = story_brief.get("source_mix") or {}
    analysis_tone = story_brief.get("analysis_tone") or {}
    analysis_story_targets = story_brief.get("analysis_story_targets") or {}
    analysis_flags = story_brief.get("analysis_flags") if isinstance(story_brief.get("analysis_flags"), dict) else {}
    if story_mode:
        lines.append(f"- Story form: {story_mode}")
    if focus:
        lines.append(f"- Focus: {focus}")
    if selected_angle:
        lines.append(f"- Selected angle: {selected_angle}")
    if analysis_summary:
        lines.append(f"- Analysis summary: {analysis_summary}")
    if why_now:
        lines.append(f"- Why now: {why_now}")
    if continuity_note:
        lines.append(f"- Continuity note: {continuity_note}")
    if freshest:
        lines.append(f"- Freshest evidence: {freshest}")
    if trend_signal:
        lines.append(f"- Trend signal: {trend_signal}")
    if audience_hook:
        lines.append(f"- Audience hook: {audience_hook}")
    if thesis_to_prove:
        lines.append(f"- Thesis to prove: {thesis_to_prove}")
    if counterforce:
        lines.append(f"- Counterforce: {counterforce}")
    if synthesis_to_land:
        lines.append(f"- Synthesis to land: {synthesis_to_land}")
    if gold_thread:
        lines.append(f"- Gold thread: {gold_thread}")
    if writer_north_star:
        lines.append(f"- Writer north star: {writer_north_star}")
    for label, key in (
        ("Tell to surface", "tell_kind"),
        ("Claim vs receipt", "claim_vs_receipt"),
        ("Institutional stress point", "institutional_stress"),
        ("Who benefits", "beneficiary"),
        ("Who absorbs the cost", "cost_bearer"),
        ("Evidence strength", "evidence_strength"),
    ):
        value = _clean_line(str(analysis_flags.get(key) or ""))
        if value:
            lines.append(f"- {label}: {value}")
    if isinstance(analysis_tone, dict):
        tone_primary = _clean_line(str(analysis_tone.get("primary") or ""))
        tone_long = _clean_line(str(analysis_tone.get("long_form") or ""))
        if tone_primary:
            lines.append(f"- Tone primary: {tone_primary}")
        if tone_long:
            lines.append(f"- Tone guide: {tone_long}")
    if isinstance(analysis_story_targets, dict):
        target = _clean_line(str(analysis_story_targets.get("long_form_label") or ""))
        if target:
            lines.append(f"- Analysis target: {target}")
    if target_words:
        lines.append(f"- Target length: {target_words} words")
    if form_instruction:
        lines.append(f"- Form instruction: {form_instruction}")
    if isinstance(source_mix, dict):
        lines.append(
            "- Source mix: "
            f"count={int(source_mix.get('count') or 0)}, "
            f"high_credibility={int(source_mix.get('high_credibility_count') or 0)}, "
            f"avg_quality={_safe_float(source_mix.get('avg_quality')):.2f}, "
            f"freshest_age_days={source_mix.get('freshest_age_days')}"
        )
    for prior in story_brief.get("nearby_coverage", [])[:3]:
        title = _clean_line(str(prior.get("title") or ""))
        time_label = _clean_line(str(prior.get("time_label") or ""))
        if title:
            lines.append(f"- Nearby coverage ({time_label or 'recent'}): {title}")
    for phrase in (repetition_guard.get("avoid_phrases", []) if isinstance(repetition_guard, dict) else [])[:4]:
        cleaned = _clean_line(str(phrase))
        if cleaned:
            lines.append(f"- Avoid BAT phrase: {cleaned}")
    for angle in (repetition_guard.get("recent_angles", []) if isinstance(repetition_guard, dict) else [])[:3]:
        cleaned = _clean_line(str(angle))
        if cleaned:
            lines.append(f"- Recent angle on site: {cleaned}")
    for hook in story_brief.get("social_hooks", [])[:3]:
        lines.append(f"- Social hook: {_clean_line(str(hook))}")
    for loop in story_brief.get("analysis_open_loops", [])[:3]:
        lines.append(f"- Open loop: {_clean_line(str(loop))}")
    for beat in story_brief.get("argument_spine", [])[:5]:
        lines.append(f"- Paragraph job: {_clean_line(str(beat))}")
    return "\n".join(lines)


def _build_launch_packet(title: str, dek: str, body: str, story_brief: dict[str, object]) -> dict[str, object]:
    paragraphs = _body_paragraphs(body)
    signals = _launch_packet_signals(story_brief, _extract_pattern_signals(body))
    sentences: list[str] = []
    for paragraph in paragraphs:
        for piece in re.split(r"(?<=[.!?])\s+", paragraph):
            cleaned = _clean_line(piece)
            if cleaned:
                sentences.append(cleaned)

    opening_line = sentences[0] if sentences else _clean_line(dek or title)
    closing_line = sentences[-1] if sentences else _clean_line(str(story_brief.get("why_now") or title))
    quote_candidates = sentences[-2:] + signals + [_clean_line(str(story_brief.get("why_now") or ""))]
    pull_quote = next((candidate for candidate in quote_candidates if 36 <= len(candidate) <= 190), closing_line or opening_line)
    quote_card_line = next(
        (candidate for candidate in [pull_quote, opening_line] + signals if 24 <= len(candidate) <= 180),
        pull_quote or opening_line,
    )
    why_now = _story_why_now_line(
        _public_packet_line(
            story_brief.get("why_now"),
            signals[0] if signals else "",
            story_brief.get("freshest_evidence"),
            fallback=opening_line or title,
        ),
        selected_angle=_clean_line(str(story_brief.get("selected_angle") or title)),
        freshest_evidence=_clean_line(str(story_brief.get("freshest_evidence") or "")),
        focus_label=_clean_line(str(story_brief.get("focus_label") or "")),
    )
    focus_label = _clean_line(str(story_brief.get("focus_label") or ""))
    headline_variants = [
        variant[:120]
        for variant in _dedupe_clean_lines(
            [
                title,
                f"{focus_label}: {signals[0]}" if focus_label and signals else "",
                str(story_brief.get("selected_angle") or ""),
                f"{title}: {signals[0]}" if title and signals else "",
            ],
            minimum_len=12,
            limit=4,
        )
    ]
    social_hooks = [
        hook[:220]
        for hook in _dedupe_clean_lines(
            [
                hook
                for hook in list(story_brief.get("social_hooks", []))
                if not _looks_like_public_packet_meta_line(str(hook or ""))
            ]
            + [
                opening_line,
                quote_card_line,
                pull_quote,
                signals[0] if signals else "",
                why_now,
            ],
            minimum_len=16,
            limit=5,
        )
    ]
    return {
        "story_mode": story_brief.get("story_mode"),
        "selected_angle": _clean_line(str(story_brief.get("selected_angle") or title)),
        "why_now": why_now,
        "opening_line": opening_line[:220],
        "closing_line": closing_line[:220],
        "pull_quote": pull_quote[:220],
        "quote_card_line": quote_card_line[:220],
        "pattern_signals": signals[:4],
        "headline_variants": headline_variants[:3],
        "social_hooks": social_hooks[:4],
    }


def _build_poster_package(title: str, dek: str, launch_packet: dict[str, object], story_brief: dict[str, object]) -> dict[str, object]:
    focus_label = _clean_line(str(story_brief.get("focus_label") or launch_packet.get("story_mode") or "BAT Dispatch"))
    why_now = _clean_line(str(launch_packet.get("why_now") or story_brief.get("why_now") or dek or title))
    pull_quote = _clean_line(str(launch_packet.get("pull_quote") or launch_packet.get("quote_card_line") or title))
    signals = [str(item) for item in (launch_packet.get("pattern_signals") or [])]
    hooks = [str(item) for item in (launch_packet.get("social_hooks") or [])]
    screenshot_lines = _dedupe_clean_lines(
        [pull_quote, why_now, *hooks, *signals],
        minimum_len=18,
        limit=3,
    )
    group_chat_caption = _dedupe_clean_lines(
        [hooks[0] if hooks else "", why_now, pull_quote],
        minimum_len=18,
        limit=1,
    )

    return {
        "eyebrow": focus_label[:80],
        "share_title": _clean_line(str((launch_packet.get("headline_variants") or [title])[0] or title))[:140],
        "share_dek": why_now[:220],
        "quote_card_line": pull_quote[:220],
        "screenshot_lines": screenshot_lines,
        "group_chat_caption": (group_chat_caption[0] if group_chat_caption else why_now)[:240],
    }


def _format_launch_packet(launch_packet: dict[str, object]) -> str:
    lines = ["Launch packet:"]
    for key in ("selected_angle", "why_now", "pull_quote", "quote_card_line"):
        value = _clean_line(str(launch_packet.get(key) or ""))
        if value:
            lines.append(f"- {key.replace('_', ' ').title()}: {value}")
    for signal in launch_packet.get("pattern_signals", [])[:3]:
        lines.append(f"- Pattern signal: {_clean_line(str(signal))}")
    for hook in launch_packet.get("social_hooks", [])[:3]:
        lines.append(f"- Social hook: {_clean_line(str(hook))}")
    return "\n".join(lines)


def _publish_recommendation(
    *,
    style_report: dict[str, object],
    grounded_source_count: int,
    reroll_count: int,
    needs_research: bool,
    generation_path: str,
    freshness_age_days: int | None = None,
) -> dict[str, object]:
    freshness_ok = freshness_age_days is None or freshness_age_days <= int(settings.current_news_max_age_days)
    fallback_selected = generation_path == "fallback_grounded"
    recommended = (
        bool(style_report.get("passes"))
        and grounded_source_count >= max(1, int(settings.generation_min_grounded_sources))
        and not needs_research
        and freshness_ok
        and not fallback_selected
    )
    if needs_research:
        reason = "needs_more_grounded_sources"
    elif not freshness_ok:
        reason = "outside_current_news_window"
    elif fallback_selected:
        reason = "fallback_requires_model_rework"
    elif style_report.get("passes"):
        reason = "ready_for_publish"
    else:
        reason = "style_gate_hold"
    return {
        "recommended": recommended,
        "reason": reason,
        "style_score": int(style_report.get("score") or 0),
        "grounded_source_count": grounded_source_count,
        "reroll_count": reroll_count,
        "generation_path": generation_path,
        "freshness_age_days": freshness_age_days,
    }


def _editorial_retry_note(style_report: dict[str, object], story_brief: dict[str, object]) -> str:
    reasons = ", ".join(str(reason) for reason in style_report.get("reasons", [])[:3]) or "sharpen specificity"
    word_floor = _story_form_word_floor(story_brief)
    body_paragraphs = max(2, int(story_brief.get("body_paragraphs") or 3))
    leak_warning = ""
    heat_warning = (
        "Rewrite colder, smarter, and more female-authored: polished blonde Texan cadence, precise receipts, "
        "and one lacquered line that lands only after the evidence is on the page. "
    )
    if any("generic_editorial_filler" == str(reason) for reason in (style_report.get("reasons") or [])):
        heat_warning += (
            "Ban prestige-mag filler like 'sobering reminder', 'latest chapter', 'in a nutshell', "
            "'latest blow', or 'not just a political flourish'. "
        )
    if any("below_story_form_floor" in str(reason) for reason in (style_report.get("reasons") or [])):
        heat_warning += (
            "Do not stop at setup. Add another full receipts paragraph and a consequence paragraph before Pattern Signals. "
        )
    if any("prompt" in str(reason) or "placeholder" in str(reason) for reason in (style_report.get("reasons") or [])):
        leak_warning = (
            "Rewrite from scratch. Do not reuse wording from the packet, continuity note, nearby coverage, or the failed draft. "
            "Never write lines like Story brief, Analysis engine brief, Recurring pattern bucket, or A nearby BAT piece already ran. "
        )
    paragraph_jobs = " ".join(
        f"Paragraph job {idx}: {_clean_line(str(beat))}."
        for idx, beat in enumerate(story_brief.get("argument_spine", [])[:4], start=1)
        if _clean_line(str(beat))
    )
    return (
        "Revision focus: tighten the thesis, expand the body until it earns the full BAT read, "
        "advance the thread instead of restarting it, and fix these issues: "
        f"{reasons}. Use the why-now line, continuity note, and freshest evidence from the story brief. "
        f"{heat_warning}"
        f"{leak_warning}"
        f"{paragraph_jobs} "
        f"Keep the same markdown structure, land {body_paragraphs} real body paragraphs before any secondary heading, "
        f"clear the {word_floor}-word body floor, and avoid repeated phrasing."
    )


def _should_attempt_editorial_revision(style_report: dict[str, object]) -> bool:
    reasons = [str(reason) for reason in (style_report.get("reasons") or [])]
    structural_markers = (
        "below_story_form_floor",
        "body_paragraph_count",
        "too_short_for_lane",
        "generic_editorial_filler",
        "low_lexical_diversity",
    )
    return any(marker in reason for reason in reasons for marker in structural_markers)


def _needs_editorial_expansion(style_report: dict[str, object], story_brief: dict[str, object]) -> bool:
    word_floor = _story_form_word_floor(story_brief)
    required_paragraphs = max(2, int(story_brief.get("body_paragraphs") or 3))
    body_word_count = int(style_report.get("body_word_count") or 0)
    body_paragraph_count = int(style_report.get("body_paragraph_count") or 0)
    return body_word_count < word_floor or body_paragraph_count < required_paragraphs


def _build_editorial_expansion_prompt(style_report: dict[str, object], story_brief: dict[str, object]) -> str:
    word_floor = _story_form_word_floor(story_brief)
    story_mode = _clean_line(str(story_brief.get("story_mode") or "Dispatch"))
    required_paragraphs = max(2, int(story_brief.get("body_paragraphs") or 3))
    current_words = int(style_report.get("body_word_count") or 0)
    current_paragraphs = int(style_report.get("body_paragraph_count") or 0)
    lines = [
        "Expand the draft below into a fully filed BAT piece without discarding the best working lines.",
        f"- Story form stays: {story_mode}",
        f"- The body currently clears about {current_words} words; it must clear at least {word_floor} words.",
        f"- The body currently lands {current_paragraphs} real paragraphs; it must land {required_paragraphs} before any secondary heading.",
        "- Keep the strongest opening if it is factual, then add the missing receipts, consequence paragraph, and sharper close.",
        "- Add one paragraph that names who benefits, who absorbs the cost, and what bluff, vanity, or bureaucratic tell the paperwork exposes.",
        "- Fill the missing paragraph jobs instead of stretching the same observation thinner.",
        "- Make it read like a filed Blonde Desk piece: female-authored, dry, expensive, surgical, and much smarter than the spin room.",
        "- Do not invent named officials, committees, numbers, timelines, or scenes. If the evidence packet does not give you a proper noun or numeric claim, leave it out or describe it generically.",
        "- Do not print packet labels, backstage notes, or revision instructions.",
    ]
    for idx, beat in enumerate(story_brief.get("argument_spine", [])[:5], start=1):
        lines.append(f"- Paragraph job {idx}: {_clean_line(str(beat))}")
    return "\n".join(lines)


def _build_editorial_revision_prompt(style_report: dict[str, object], story_brief: dict[str, object]) -> str:
    word_floor = _story_form_word_floor(story_brief)
    story_mode = _clean_line(str(story_brief.get("story_mode") or "Dispatch"))
    reasons = ", ".join(str(reason) for reason in (style_report.get("reasons") or [])[:4]) or "thin argument"
    lines = [
        "Revise the draft below into a filed BAT piece, not a fresh generic rewrite.",
        f"- Story form stays: {story_mode}",
        f"- Current misses to correct: {reasons}",
        f"- Clear the {word_floor}-word body floor with real receipts and consequence.",
        "- Keep any strong factual opening if it is salvageable, but cut generic filler and magazine-think.",
        "- Add missing receipts, then add the paragraph that explains who benefits, who absorbs the cost, and why the line matters now.",
        "- Make the voice read like one very smart blonde Texan with better taste than the spin room: female-authored, dry, surgical, and amused only after the proof lands.",
        "- Do not print packet labels, revision notes, or backstage language.",
    ]
    for idx, beat in enumerate(story_brief.get("argument_spine", [])[:5], start=1):
        lines.append(f"- Paragraph job {idx}: {_clean_line(str(beat))}")
    return "\n".join(lines)


def _social_package_assessment(short: str, long: str, thread_parts: list[str]) -> dict[str, object]:
    short_style = _assess_style_candidate(short, lane="social")
    long_style = _assess_style_candidate(long, lane="social")
    thread_styles = [_assess_style_candidate(part, lane="social") for part in thread_parts]
    unique_thread_count = len(thread_parts)
    passing_thread_count = sum(1 for report in thread_styles if report["passes"])
    has_distinct_primary_posts = short.lower() != long.lower()
    has_enough_unique_variants = unique_thread_count >= 2 and has_distinct_primary_posts
    thread_publishable = passing_thread_count >= 2
    publishable = bool(short_style["passes"]) and bool(long_style["passes"]) and has_distinct_primary_posts
    score = int(short_style.get("score") or 0) + int(long_style.get("score") or 0)
    score += sum(int(report.get("score") or 0) for report in thread_styles[:3])
    if thread_publishable:
        score += 12
    elif thread_styles:
        score += min(6, unique_thread_count * 2)
    return {
        "short_style": short_style,
        "long_style": long_style,
        "thread_styles": thread_styles,
        "unique_thread_count": unique_thread_count,
        "passing_thread_count": passing_thread_count,
        "has_distinct_primary_posts": has_distinct_primary_posts,
        "has_enough_unique_variants": has_enough_unique_variants,
        "thread_publishable": thread_publishable,
        "publishable": publishable,
        "score": score,
    }


def _social_retry_note(assessment: dict[str, object], launch_packet: dict[str, object]) -> str:
    short_style = assessment.get("short_style", {})
    long_style = assessment.get("long_style", {})
    reasons = _dedupe_clean_lines(
        [*(short_style.get("reasons", []) or []), *(long_style.get("reasons", []) or [])],
        minimum_len=4,
        limit=4,
    )
    reason_text = ", ".join(reasons) if reasons else "diversify the hook types and sharpen specificity"
    quote_card = _clean_line(str(launch_packet.get("quote_card_line") or ""))
    return (
        "Revision focus: make x_short feel like a dispatch, make x_long feel like a quote-card caption, "
        "and make the thread move from hook to receipts to consequence without repeating itself. "
        f"Fix these issues: {reason_text}. "
        + (f"Keep this quotable line in orbit: {quote_card}." if quote_card else "")
    )


def _format_story_form_assignment(story_brief: dict[str, object]) -> str:
    lines = ["Assigned structure:"]
    story_mode = _clean_line(str(story_brief.get("story_mode") or "Dispatch"))
    body_paragraphs = int(story_brief.get("body_paragraphs") or 3)
    raw_extra_heading = str(story_brief.get("extra_heading") or "").strip()
    extra_heading = _clean_line(raw_extra_heading)
    extra_count = int(story_brief.get("extra_count") or 0)
    extra_label = _clean_line(str(story_brief.get("extra_label") or "note"))
    target_words = _clean_line(str(story_brief.get("target_words") or ""))
    form_instruction = _clean_line(str(story_brief.get("form_instruction") or ""))
    lines.append(f"- Form: {story_mode}")
    lines.append(f"- Body paragraphs: {body_paragraphs}")
    if target_words:
        lines.append(f"- Target words: {target_words}")
    if extra_heading and extra_count:
        lines.append(f"- Include {raw_extra_heading or extra_heading} with {extra_count} bullet {extra_label}(s).")
    else:
        lines.append("- Go directly from the body into ## Pattern Signals.")
    if form_instruction:
        lines.append(f"- Movement note: {form_instruction}")
    return "\n".join(lines)


def _story_form_word_floor(story_brief: dict[str, object] | None) -> int:
    if not isinstance(story_brief, dict):
        return 220
    story_form = str(story_brief.get("story_form") or "").strip().lower()
    if story_form in STORY_FORM_WORD_FLOORS:
        return int(STORY_FORM_WORD_FLOORS[story_form])
    body_paragraphs = int(story_brief.get("body_paragraphs") or 3)
    return 220 if body_paragraphs <= 2 else 280


def _target_body_word_range(story_brief: dict[str, object] | None) -> tuple[int, int]:
    word_floor = _story_form_word_floor(story_brief)
    low = max(word_floor + 120, int(word_floor * 1.22))
    low = ((low + 19) // 20) * 20
    return low, low + 100


def _source_role_label_for_source(source: dict[str, object], analysis_source_roles: list[dict[str, object]]) -> str:
    source_title_fp = _text_fingerprint(str(source.get("title") or ""))
    source_outlet = _clean_line(str(source.get("source_label") or source.get("source_name") or "")).lower()
    for role in analysis_source_roles:
        role_title_fp = _text_fingerprint(str(role.get("title") or ""))
        role_outlet = _clean_line(str(role.get("outlet") or "")).lower()
        if source_title_fp and role_title_fp and source_title_fp == role_title_fp:
            return _clean_line(str(role.get("role_label") or role.get("role") or ""))
        if source_outlet and role_outlet and source_outlet == role_outlet:
            return _clean_line(str(role.get("role_label") or role.get("role") or ""))
    fallback = _clean_line(str(source.get("source_kind") or "receipt"))
    return fallback.replace("_", " ").title() if fallback else "Receipt"


def _story_form_movement_note(story_brief: dict[str, object]) -> str:
    story_form = str(story_brief.get("story_form") or "").strip().lower()
    body_paragraphs = int(story_brief.get("body_paragraphs") or 3)
    if story_form in {"lead_update", "theme_update"}:
        return "Open on what changed, prove it with current receipts, then widen the consequence."
    if story_form == "notebook_entry":
        return "Log the moving receipt fast, connect it to the pattern, then leave one smart continuation point."
    if body_paragraphs >= 4:
        return "Move from stakes to receipts to widening pressure to an earned closer."
    if body_paragraphs == 3:
        return "Move from hard turn to proof to consequence."
    return "Move from what changed to why it matters."


def _catastrophic_editorial_underfill(style_report: dict[str, object], story_brief: dict[str, object]) -> bool:
    word_floor = _story_form_word_floor(story_brief)
    body_words = int(style_report.get("body_word_count") or 0)
    if body_words <= 0:
        return True
    if body_words < max(160, int(word_floor * 0.55)):
        return True
    reasons = [str(reason).lower() for reason in (style_report.get("reasons") or [])]
    return body_words < max(220, int(word_floor * 0.65)) and any(
        marker in reason for reason in reasons for marker in ("lowlexicaldiversity", "bodyparagraphcount")
    )


def _voice_note_lines(voice_entries: list[dict[str, object]] | None, *, limit: int = 3) -> list[str]:
    notes: list[str] = []
    for entry in voice_entries or []:
        value = _clean_line(str((entry or {}).get("value") or ""))
        if not value:
            continue
        if _voice_memory_value_is_noise(value):
            continue
        if _looks_like_headlineish_text(value) or _looks_like_prompt_instruction(value):
            continue
        lowered = value.lower()
        if any(marker in lowered for marker in EDITORIAL_META_PHRASE_MARKERS):
            continue
        notes.append(value)
    if not notes:
        notes.append("Blonde Texan cadence, Hayek-literate skepticism about power, receipts first, and one line sharp enough to travel.")
    return _dedupe_clean_lines(notes, minimum_len=18, limit=limit)


def _looks_like_editorial_meta_line(text: str) -> bool:
    candidate = text.strip().lstrip("#").lstrip("-").lstrip(">").strip()
    cleaned = _clean_line(candidate)
    if not cleaned:
        return False
    lowered = cleaned.lower()
    if any(lowered.startswith(marker) for marker in EDITORIAL_META_SECTION_MARKERS):
        return True
    if any(lowered.startswith(marker) for marker in EDITORIAL_META_LINE_MARKERS):
        return True
    if any(marker in lowered for marker in EDITORIAL_META_PHRASE_MARKERS):
        return True
    if lowered.startswith("[") and "| w=" in lowered:
        return True
    return False


def _strip_editorial_packet_echo(text: str) -> str:
    blocks = [block.strip() for block in re.split(r"\n{2,}", text or "") if block.strip()]
    kept_blocks: list[str] = []
    for block in blocks:
        kept_lines = [raw for raw in block.splitlines() if not _looks_like_editorial_meta_line(raw)]
        candidate = "\n".join(kept_lines).strip()
        if not candidate:
            continue
        candidate = _strip_instructional_opening(candidate)
        cleaned_candidate = _clean_line(candidate)
        if not cleaned_candidate:
            continue
        lowered = cleaned_candidate.lower()
        if any(marker in lowered for marker in EDITORIAL_META_PHRASE_MARKERS) and not has_trump_focus(candidate):
            continue
        if _looks_like_prompt_instruction(cleaned_candidate):
            continue
        if _looks_like_editor_directive(cleaned_candidate) and not has_trump_focus(candidate):
            continue
        kept_blocks.append(candidate)
    cleaned = "\n\n".join(kept_blocks)
    return re.sub(r"\n{3,}", "\n\n", cleaned).strip()


def _looks_like_internal_process_line(text: str | None) -> bool:
    cleaned = _clean_line(text or "")
    if not cleaned:
        return False
    lowered = cleaned.lower()
    return any(marker in lowered for marker in INTERNAL_PROCESS_LINE_MARKERS)


def _looks_like_public_packet_meta_line(text: str | None) -> bool:
    cleaned = _clean_line(text or "")
    if not cleaned:
        return False
    lowered = cleaned.lower()
    return _looks_like_internal_process_line(cleaned) or any(marker in lowered for marker in PUBLIC_PACKET_META_MARKERS)


def _story_why_now_line(
    candidate: str,
    *,
    selected_angle: str,
    freshest_evidence: str,
    focus_label: str,
) -> str:
    cleaned = _terminal_sentence(_clean_line(candidate))
    if cleaned and not _looks_like_public_packet_meta_line(cleaned):
        return cleaned[:220]

    selected_angle_seed = _clean_angle_candidate(selected_angle) or _clean_line(selected_angle)
    freshest_seed = _clean_angle_candidate(freshest_evidence) or _clean_line(freshest_evidence)
    if freshest_seed and selected_angle_seed and _text_fingerprint(freshest_seed) != _text_fingerprint(selected_angle_seed):
        return _limit_text(
            f"{freshest_evidence} is the freshest reporting that makes {selected_angle_seed.lower()} harder to wave away.",
            220,
        )
    if freshest_seed:
        return _limit_text(f"{freshest_evidence} is the freshest clean reporting in this story right now.", 220)
    if selected_angle_seed:
        return _limit_text(f"{selected_angle_seed} is now concrete enough to argue instead of just react to.", 220)
    return _limit_text(f"{focus_label or 'This story'} is still moving fast enough to merit a cleaner read right now.", 220)


def _launch_packet_signals(story_brief: dict[str, object], body_signals: list[str]) -> list[str]:
    candidates = _dedupe_clean_lines(
        [
            str(story_brief.get("counterforce") or ""),
            str(story_brief.get("synthesis_to_land") or ""),
            str(story_brief.get("gold_thread") or ""),
            str(story_brief.get("audience_hook") or ""),
            str(story_brief.get("freshest_evidence") or ""),
            *body_signals,
        ],
        minimum_len=18,
        limit=6,
    )
    cleaned_signals = [
        _limit_text(signal, 180)
        for signal in candidates
        if signal and not _looks_like_public_packet_meta_line(signal)
    ]
    return cleaned_signals[:4]


def _public_packet_line(*candidates: object, fallback: str = "") -> str:
    for candidate in candidates:
        cleaned = _terminal_sentence(_clean_line(str(candidate or "")))
        if not cleaned:
            continue
        if _looks_like_public_packet_meta_line(cleaned):
            continue
        return cleaned[:220]
    fallback_cleaned = _terminal_sentence(_clean_line(fallback))
    return fallback_cleaned[:220] if fallback_cleaned else ""


def _build_editorial_context_packet(
    retrieval_bundle: dict[str, object],
    story_brief: dict[str, object],
    analysis_brief: dict[str, object] | None,
    *,
    theme: Theme | None = None,
    voice_entries: list[dict[str, object]] | None = None,
) -> str:
    analysis_meta = _analysis_meta(analysis_brief)
    analysis_tone = story_brief.get("analysis_tone") if isinstance(story_brief.get("analysis_tone"), dict) else {}
    analysis_source_roles = analysis_meta.get("source_roles") if isinstance(analysis_meta.get("source_roles"), list) else []
    focus_query = _story_focus_query(
        selected_angle=str(story_brief.get("selected_angle") or ""),
        freshest_evidence=str(story_brief.get("freshest_evidence") or ""),
        source_roles=analysis_source_roles,
        fallback_query=str(retrieval_bundle.get("query_text") or ""),
    )
    source_focus_query = focus_query or str(retrieval_bundle.get("query_text") or "")
    preferred_sources = _preferred_story_sources(
        retrieval_bundle.get("raw_sources", []) or [],
        limit=4,
        query_text=source_focus_query,
    ) or (retrieval_bundle.get("raw_sources", []) or [])[:4]
    repetition_guard = story_brief.get("repetition_guard") if isinstance(story_brief.get("repetition_guard"), dict) else {}
    nearby_coverage = story_brief.get("nearby_coverage") if isinstance(story_brief.get("nearby_coverage"), list) else []
    open_loops = story_brief.get("analysis_open_loops") if isinstance(story_brief.get("analysis_open_loops"), list) else []
    focus_label = _clean_line(str(story_brief.get("focus_label") or ""))
    story_mode = _clean_line(str(story_brief.get("story_mode") or "Dispatch"))
    target_words = _clean_line(str(story_brief.get("target_words") or ""))
    selected_angle = _clean_line(str(story_brief.get("selected_angle") or ""))
    why_now = _clean_line(str(story_brief.get("why_now") or ""))
    audience_hook = _clean_line(str(story_brief.get("audience_hook") or ""))
    freshest_evidence = _clean_line(str(story_brief.get("freshest_evidence") or ""))
    trend_signal = _clean_line(str(story_brief.get("trend_signal") or ""))
    continuity_note = _clean_line(str(story_brief.get("continuity_note") or ""))
    contradiction_core = _clean_line(str(analysis_meta.get("contradiction_core") or ""))
    tone_primary = _clean_line(str(analysis_tone.get("primary") or ""))
    thesis_to_prove = _clean_line(str(story_brief.get("thesis_to_prove") or ""))
    counterforce = _clean_line(str(story_brief.get("counterforce") or ""))
    synthesis_to_land = _clean_line(str(story_brief.get("synthesis_to_land") or ""))
    gold_thread = _clean_line(str(story_brief.get("gold_thread") or ""))
    writer_north_star = _clean_line(str(story_brief.get("writer_north_star") or ""))
    analysis_flags = story_brief.get("analysis_flags") if isinstance(story_brief.get("analysis_flags"), dict) else {}
    argument_spine = story_brief.get("argument_spine") if isinstance(story_brief.get("argument_spine"), list) else []

    lines = [
        "Writer packet",
        "- Absorb the packet and write the finished piece only.",
        "- Never print packet labels, continuity notes, memory notes, or site-process language.",
    ]
    if theme:
        lines.append(f"- Theme lane: {theme.name} ({theme.slug})")
    lines.append("")
    lines.append("Angle card")
    lines.append(f"- File this as: {story_mode}" + (f" | target {target_words} words" if target_words else ""))
    if focus_label:
        lines.append(f"- Focus lane: {focus_label}")
    if selected_angle:
        lines.append(f"- Angle to advance: {selected_angle}")
    if why_now:
        lines.append(f"- Why now in plain English: {why_now}")
    if audience_hook:
        lines.append(f"- Stakes for readers: {audience_hook}")
    if freshest_evidence:
        lines.append(f"- Freshest receipt: {freshest_evidence}")
    if contradiction_core:
        lines.append(f"- Contradiction to expose: {contradiction_core}")
    if trend_signal:
        lines.append(f"- Pattern underneath it: {trend_signal}")
    if thesis_to_prove:
        lines.append(f"- Thesis to prove: {thesis_to_prove}")
    if counterforce:
        lines.append(f"- Counterforce pushing back: {counterforce}")
    if synthesis_to_land:
        lines.append(f"- Synthesis to land: {synthesis_to_land}")
    if gold_thread:
        lines.append(f"- Gold thread to mine: {gold_thread}")
    if writer_north_star:
        lines.append(f"- Writer north star: {writer_north_star}")
    if tone_primary:
        lines.append(f"- Tone lane: {tone_primary}")
    lines.append(f"- Paragraph movement: {_story_form_movement_note(story_brief)}")
    for label, key in (
        ("Tell to surface", "tell_kind"),
        ("Claim vs receipt", "claim_vs_receipt"),
        ("Institutional stress point", "institutional_stress"),
        ("Who benefits", "beneficiary"),
        ("Who absorbs the cost", "cost_bearer"),
        ("Evidence strength", "evidence_strength"),
    ):
        value = _clean_line(str(analysis_flags.get(key) or ""))
        if value:
            lines.append(f"- {label}: {value}")
    if continuity_note:
        lines.append(f"- Continuation point: {continuity_note}")
    if open_loops:
        lines.append(f"- Thread worth pulling: {_clean_line(str(open_loops[0]))}")
    for beat in argument_spine[:5]:
        lines.append(f"- Paragraph job: {_clean_line(str(beat))}")

    lines.append("")
    lines.append("Receipts to use")
    if not preferred_sources:
        lines.append("- No preferred sources are available yet. Stay disciplined and precise.")
    for source in preferred_sources:
        title = _clean_line(str(source.get("title") or "Untitled source"))
        outlet = _source_display_name(source)
        role_label = _source_role_label_for_source(source, analysis_source_roles)
        if title:
            lines.append("- " + f"{role_label}: {title}" + (f" ({outlet})" if outlet else ""))
        evidence_excerpts = _story_evidence_lines(source, query_text=source_focus_query, limit=1)
        if evidence_excerpts:
            lines.append(f"  use: {_limit_text(evidence_excerpts[0], 220)}")
        else:
            snippet = _story_support_snippet(source, query_text=source_focus_query)
            if snippet:
                lines.append(f"  use: {_limit_text(snippet, 220)}")

    lines.append("")
    lines.append("Pressure points")
    for title in [
        _clean_line(str((nearby_coverage[0] or {}).get("title") or "")) if nearby_coverage else "",
        *[_clean_line(str(angle)) for angle in (repetition_guard.get("recent_angles", []) if isinstance(repetition_guard, dict) else [])[:2]],
    ]:
        if title:
            lines.append(f"- Recent BAT move to advance, not restate: {title}")
    for phrase in (repetition_guard.get("avoid_phrases", []) if isinstance(repetition_guard, dict) else [])[:3]:
        cleaned = _clean_line(str(phrase))
        if cleaned:
            lines.append(f"- Retire this stale site phrase: {cleaned}")
    for note in _voice_note_lines(voice_entries, limit=3):
        lines.append(f"- Voice pressure: {note}")

    lines.append("")
    lines.append("Non-public memory")
    lines.append("- Never write lines like 'Story brief', 'Analysis engine brief', 'Recurring pattern bucket', or 'A nearby BAT piece already ran.'")
    lines.append("- Let the packet disappear into the prose; publish the argument, not the scaffolding.")
    return "\n".join(line for line in lines if line is not None)


def _build_social_context_packet(
    retrieval_bundle: dict[str, object],
    story_brief: dict[str, object],
    analysis_brief: dict[str, object] | None,
    *,
    launch_packet: dict[str, object] | None = None,
    title: str = "",
    body: str = "",
    voice_entries: list[dict[str, object]] | None = None,
    live_vibe: str = "",
) -> str:
    launch_packet = launch_packet or {}
    analysis_meta = _analysis_meta(analysis_brief)
    focus_query = _story_focus_query(
        selected_angle=str(launch_packet.get("selected_angle") or story_brief.get("selected_angle") or title),
        freshest_evidence=str(story_brief.get("freshest_evidence") or ""),
        source_roles=analysis_meta.get("source_roles") if isinstance(analysis_meta.get("source_roles"), list) else [],
        fallback_query=str(retrieval_bundle.get("query_text") or title or ""),
    )
    source_focus_query = focus_query or str(retrieval_bundle.get("query_text") or title or "")
    preferred_sources = _preferred_story_sources(
        retrieval_bundle.get("raw_sources", []) or [],
        limit=3,
        query_text=source_focus_query,
    ) or (retrieval_bundle.get("raw_sources", []) or [])[:3]
    body_paragraphs = _body_paragraphs(body)[:2]
    selected_angle = _clean_line(str(launch_packet.get("selected_angle") or story_brief.get("selected_angle") or title))
    why_now = _clean_line(str(launch_packet.get("why_now") or story_brief.get("why_now") or ""))
    quote_card_line = _clean_line(str(launch_packet.get("quote_card_line") or launch_packet.get("pull_quote") or ""))
    pattern_signal = _clean_line(str((launch_packet.get("pattern_signals") or [""])[0] or story_brief.get("trend_signal") or ""))
    social_hook = _clean_line(str((launch_packet.get("social_hooks") or [""])[0] or ""))
    open_loops = story_brief.get("analysis_open_loops") if isinstance(story_brief.get("analysis_open_loops"), list) else []
    gold_thread = _clean_line(str(story_brief.get("gold_thread") or ""))
    analysis_flags = story_brief.get("analysis_flags") if isinstance(story_brief.get("analysis_flags"), dict) else {}
    lines = [
        "Social card",
        "- Output only finished post language.",
        "- Never repeat packet labels, markdown headings, or workflow instructions.",
    ]
    if live_vibe:
        lines.append(f"- Live vibe from editor: {_clean_line(str(live_vibe))}")
    lines.append("")
    lines.append("Story signal")
    if selected_angle:
        lines.append(f"- Angle: {selected_angle}")
    if why_now:
        lines.append(f"- Why now: {why_now}")
    if quote_card_line:
        lines.append(f"- Quote-card line in orbit: {quote_card_line}")
    if social_hook:
        lines.append(f"- Hook worth stealing from yourself: {social_hook}")
    if pattern_signal:
        lines.append(f"- Pattern to reveal: {pattern_signal}")
    if gold_thread:
        lines.append(f"- Gold thread: {gold_thread}")
    for label, key in (
        ("Tell to surface", "tell_kind"),
        ("Claim vs receipt", "claim_vs_receipt"),
        ("Who benefits", "beneficiary"),
        ("Who absorbs the cost", "cost_bearer"),
    ):
        value = _clean_line(str(analysis_flags.get(key) or ""))
        if value:
            lines.append(f"- {label}: {value}")
    contradiction_core = _clean_line(str(analysis_meta.get("contradiction_core") or ""))
    if contradiction_core:
        lines.append(f"- Contradiction to puncture: {contradiction_core}")
    if open_loops:
        lines.append(f"- Thread to extend: {_clean_line(str(open_loops[0]))}")
    for paragraph in body_paragraphs:
        lines.append(f"- Body beat: {_limit_text(_clean_line(paragraph), 220)}")

    lines.append("")
    lines.append("Evidence lines")
    if not preferred_sources:
        lines.append("- No preferred sources are available yet. Stay factual and spare.")
    for source in preferred_sources:
        title_line = _clean_line(str(source.get("title") or "Untitled source"))
        outlet = _source_display_name(source)
        if title_line:
            lines.append("- " + title_line + (f" ({outlet})" if outlet else ""))
        evidence_excerpts = _story_evidence_lines(source, query_text=source_focus_query, limit=1)
        if evidence_excerpts:
            lines.append(f"  use: {_limit_text(evidence_excerpts[0], 180)}")
        else:
            snippet = _story_support_snippet(source, query_text=source_focus_query)
            if snippet:
                lines.append(f"  use: {_limit_text(snippet, 180)}")

    for note in _voice_note_lines(voice_entries, limit=2):
        lines.append(f"- Voice pressure: {note}")
    return "\n".join(line for line in lines if line is not None)


def _build_evidence_dossier(
    retrieval_bundle: dict[str, object],
    story_brief: dict[str, object],
    analysis_brief: dict[str, object] | None,
) -> str:
    raw_sources = retrieval_bundle.get("raw_sources", []) or []
    analysis_meta = _analysis_meta(analysis_brief)
    analysis_source_roles = analysis_meta.get("source_roles") if isinstance(analysis_meta.get("source_roles"), list) else []
    focus_query = _story_focus_query(
        selected_angle=str(story_brief.get("selected_angle") or ""),
        freshest_evidence=str(story_brief.get("freshest_evidence") or ""),
        source_roles=analysis_source_roles,
        fallback_query=str(retrieval_bundle.get("query_text") or ""),
    )
    source_focus_query = focus_query or str(retrieval_bundle.get("query_text") or "")
    preferred_sources = _preferred_story_sources(
        raw_sources,
        limit=4,
        query_text=source_focus_query,
    ) or raw_sources[:4]
    contradiction_map = story_brief.get("contradiction_map") if isinstance(story_brief.get("contradiction_map"), list) else []
    analysis_flags = story_brief.get("analysis_flags") if isinstance(story_brief.get("analysis_flags"), dict) else {}

    lines = ["Evidence dossier:"]
    if contradiction_map:
        lines.append("- Contradiction map:")
        for item in contradiction_map[:3]:
            title = _clean_line(str((item or {}).get("title") or ""))
            outlet = _clean_line(str((item or {}).get("outlet") or ""))
            if title:
                lines.append(f"  - {title}" + (f" ({outlet})" if outlet else ""))
    for label, key in (
        ("Tell to surface", "tell_kind"),
        ("Claim vs receipt", "claim_vs_receipt"),
        ("Institutional stress point", "institutional_stress"),
        ("Who benefits", "beneficiary"),
        ("Who absorbs the cost", "cost_bearer"),
    ):
        value = _clean_line(str(analysis_flags.get(key) or ""))
        if value:
            lines.append(f"- {label}: {value}")

    if not preferred_sources:
        lines.append("- No grounded sources are available yet. Stay precise and restrained.")
        return "\n".join(lines)

    for source in preferred_sources:
        title = _clean_line(str(source.get("title") or "Untitled source"))
        outlet = _source_display_name(source)
        role_label = _source_role_label_for_source(source, analysis_source_roles)
        lines.append(
            "- "
            f"{role_label}: {title} | {outlet} | age_days={source.get('age_days')} | "
            f"quality={_safe_float(source.get('quality_score')):.2f}"
        )
        evidence_excerpts = _story_evidence_lines(source, query_text=source_focus_query, limit=2)
        if evidence_excerpts:
            for excerpt in evidence_excerpts[:2]:
                lines.append(f"  evidence: {_limit_text(excerpt, 220)}")
        else:
            snippet = _story_support_snippet(source, query_text=source_focus_query)
            if snippet:
                lines.append(f"  snippet: {_limit_text(snippet, 220)}")

    return "\n".join(lines)


def _grounding_support_corpus(
    retrieval_bundle: dict[str, object],
    story_brief: dict[str, object],
    analysis_brief: dict[str, object] | None,
) -> str:
    raw_sources = retrieval_bundle.get("raw_sources", []) or []
    analysis_meta = _analysis_meta(analysis_brief)
    analysis_source_roles = analysis_meta.get("source_roles") if isinstance(analysis_meta.get("source_roles"), list) else []
    focus_query = _story_focus_query(
        selected_angle=_clean_line(str(story_brief.get("selected_angle") or "")),
        freshest_evidence=_clean_line(str(story_brief.get("freshest_evidence") or "")),
        source_roles=analysis_source_roles,
        fallback_query=str(retrieval_bundle.get("query_text") or ""),
    )
    source_focus_query = focus_query or str(retrieval_bundle.get("query_text") or "")
    preferred_sources = _preferred_story_sources(
        raw_sources,
        limit=4,
        query_text=source_focus_query,
    ) or raw_sources[:4]

    parts: list[str] = [
        str(story_brief.get("selected_angle") or ""),
        str(story_brief.get("freshest_evidence") or ""),
        str(story_brief.get("why_now") or ""),
        str(story_brief.get("thesis_to_prove") or ""),
        str(story_brief.get("counterforce") or ""),
        str(story_brief.get("synthesis_to_land") or ""),
        str(story_brief.get("gold_thread") or ""),
    ]
    analysis_flags = story_brief.get("analysis_flags") if isinstance(story_brief.get("analysis_flags"), dict) else {}
    for key in ("tell_kind", "claim_vs_receipt", "institutional_stress", "beneficiary", "cost_bearer", "evidence_strength"):
        parts.append(str(analysis_flags.get(key) or ""))
    for role in analysis_source_roles[:3]:
        parts.append(str((role or {}).get("title") or ""))
        parts.append(str((role or {}).get("outlet") or ""))
    for source in preferred_sources:
        parts.extend(
            [
                str(source.get("title") or ""),
                str(source.get("source_label") or source.get("source_name") or ""),
            ]
        )
        snippet = _story_support_snippet(source, query_text=source_focus_query)
        if snippet:
            parts.append(snippet)
        for excerpt in _story_evidence_lines(source, query_text=source_focus_query, limit=2):
            parts.append(str(excerpt or ""))
    return _clean_line(" ".join(part for part in parts if _clean_line(part)))


def _unsupported_person_names(text: str, *, corpus_lower: str) -> list[str]:
    unsupported: list[str] = []
    seen: set[str] = set()
    for match in GROUNDING_PERSON_NAME_RE.finditer(text or ""):
        candidate = _clean_line(match.group(0))
        if not candidate:
            continue
        start, end = match.span()
        left = (text or "")[max(0, start - 2) : start]
        right = (text or "")[end : min(len(text or ""), end + 2)]
        if any(char in "\"“”'" for char in f"{left}{right}"):
            continue
        fingerprint = candidate.lower()
        if fingerprint in seen or fingerprint in corpus_lower:
            continue
        words = [word for word in candidate.split() if word]
        if len(words) < 2:
            continue
        if any(word in GROUNDING_PERSON_NAME_STOPWORDS for word in words):
            continue
        seen.add(fingerprint)
        unsupported.append(candidate)
    return unsupported[:6]


def _unsupported_quotes(text: str, *, corpus_lower: str) -> list[str]:
    unsupported: list[str] = []
    seen: set[str] = set()
    for match in GROUNDING_QUOTE_RE.finditer(text or ""):
        candidate = _clean_line(match.group(1))
        fingerprint = candidate.lower()
        if not candidate or fingerprint in seen or fingerprint in corpus_lower:
            continue
        if len(candidate.split()) < 4:
            continue
        seen.add(fingerprint)
        unsupported.append(candidate)
    return unsupported[:4]


def _numeric_claim_supported(candidate: str, *, corpus_lower: str) -> bool:
    lowered = _clean_line(candidate).lower()
    if not lowered:
        return True
    variants = {
        lowered,
        lowered.replace("%", " percent"),
        lowered.replace(" percent", "%"),
        lowered.replace("$", ""),
    }
    variants |= {variant.replace(",", "") for variant in list(variants)}
    return any(variant and variant in corpus_lower for variant in variants)


def _grounding_report(
    text: str,
    *,
    retrieval_bundle: dict[str, object],
    story_brief: dict[str, object],
    analysis_brief: dict[str, object] | None,
) -> dict[str, object]:
    body_text = "\n\n".join(_body_paragraphs(text)) or _clean_line(text)
    support_corpus = _grounding_support_corpus(retrieval_bundle, story_brief, analysis_brief)
    corpus_lower = support_corpus.lower()
    unsupported_specifics = _unsupported_person_names(body_text, corpus_lower=corpus_lower)
    unsupported_specifics.extend(_unsupported_quotes(body_text, corpus_lower=corpus_lower))
    seen = {item.lower() for item in unsupported_specifics}

    for pattern in (GROUNDING_DATE_RE, GROUNDING_NUMERIC_RE):
        for raw_match in pattern.findall(body_text):
            candidate = _clean_line(raw_match)
            fingerprint = candidate.lower()
            if not candidate or fingerprint in seen:
                continue
            if _numeric_claim_supported(candidate, corpus_lower=corpus_lower):
                continue
            unsupported_specifics.append(candidate)
            seen.add(fingerprint)
            if len(unsupported_specifics) >= 10:
                break
        if len(unsupported_specifics) >= 10:
            break

    return {
        "passes": not unsupported_specifics,
        "unsupported_specifics": unsupported_specifics[:10],
        "support_corpus": support_corpus[:1200],
    }


def _apply_grounding_penalty(style_report: dict[str, object], grounding_report: dict[str, object]) -> dict[str, object]:
    unsupported_specifics = [str(item) for item in (grounding_report.get("unsupported_specifics") or []) if _clean_line(str(item))]
    if not unsupported_specifics:
        return {**style_report, "grounding_report": grounding_report}

    score = max(0, int(style_report.get("score") or 0) - min(30, 10 + (len(unsupported_specifics) * 4)))
    reasons = [f"unsupported_specifics:{len(unsupported_specifics)}", *list(style_report.get("reasons") or [])]
    return {
        **style_report,
        "score": score,
        "passes": False,
        "hard_fail": True,
        "reasons": _dedupe_clean_lines(reasons, minimum_len=4, limit=8),
        "unsupported_specifics": unsupported_specifics[:6],
        "grounding_report": grounding_report,
    }


def _build_grounding_repair_prompt(grounding_report: dict[str, object], story_brief: dict[str, object]) -> str:
    story_mode = _clean_line(str(story_brief.get("story_mode") or "Dispatch"))
    unsupported_specifics = ", ".join(str(item) for item in (grounding_report.get("unsupported_specifics") or [])[:6]) or "unsupported specifics"
    return "\n".join(
        [
            "Repair the draft below so every concrete specific stays inside the evidence packet.",
            f"- Story form stays: {story_mode}",
            f"- Remove or replace these unsupported specifics: {unsupported_specifics}",
            "- If a name, date, percentage, dollar figure, or scene is not in the evidence packet, replace it with a generic grounded description.",
            "- Keep the strongest structure and voice, but trade invented precision for documented precision.",
            "- Do not add new specifics while repairing the old ones.",
            "- Do not print packet labels, repair notes, or backstage language.",
        ]
    )


def _build_dialectic_challenger_prompt(
    *,
    style_report: dict[str, object],
    story_brief: dict[str, object],
    analysis_brief: dict[str, object] | None,
) -> str:
    meta = analysis_brief.get("meta") if isinstance(analysis_brief, dict) and isinstance(analysis_brief.get("meta"), dict) else {}
    dialectic = meta.get("dialectic") if isinstance(meta.get("dialectic"), dict) else {}
    branches = meta.get("content_branches") if isinstance(meta.get("content_branches"), list) else []
    branch_handoffs = [
        _clean_line(branch.get("writer_handoff"))
        for branch in branches
        if isinstance(branch, dict) and _clean_line(branch.get("writer_handoff"))
    ][:2]
    reasons = [str(reason) for reason in (style_report.get("reasons") or [])[:4]] if isinstance(style_report, dict) else []
    lines = [
        "Champion/challenger pass: challenge the draft once, then return a full strengthened draft.",
        "Act as the smaller RassyMind challenger: skeptical, concise, and useful. Do not write notes about the critique; rewrite the piece.",
        "Question the easiest reading, tighten the claim-versus-receipt gap, and improve the BAT voice without inventing facts.",
        f"Thesis to test: {_clean_line(dialectic.get('thesis') or story_brief.get('selected_angle'))}",
        f"Counterforce to take seriously: {_clean_line(dialectic.get('counterforce') or story_brief.get('counterforce'))}",
        f"Synthesis to strengthen: {_clean_line(dialectic.get('synthesis') or story_brief.get('synthesis_to_land'))}",
        f"Gold thread: {_clean_line(dialectic.get('gold_thread') or story_brief.get('gold_thread'))}",
    ]
    for handoff in branch_handoffs:
        lines.append(f"Content branch to advance: {handoff}")
    if reasons:
        lines.append("Current draft pressure points: " + "; ".join(reasons))
    lines.append("Return only the revised editorial markdown. Preserve grounded names, sources, and the core angle.")
    return "\n".join(line for line in lines if _clean_line(line))


def _build_editorial_task_prompt(
    base_prompt: str,
    story_brief: dict[str, object],
    retrieval_bundle: dict[str, object],
) -> str:
    story_mode = _clean_line(str(story_brief.get("story_mode") or "Dispatch"))
    story_form = str(story_brief.get("story_form") or "").strip().lower()
    word_floor = _story_form_word_floor(story_brief)
    target_low, target_high = _target_body_word_range(story_brief)
    body_paragraphs = int(story_brief.get("body_paragraphs") or 3)
    selected_angle = _clean_line(str(story_brief.get("selected_angle") or ""))
    why_now = _clean_line(str(story_brief.get("why_now") or ""))
    freshest_evidence = _clean_line(str(story_brief.get("freshest_evidence") or ""))
    audience_hook = _clean_line(str(story_brief.get("audience_hook") or ""))
    counterforce = _clean_line(str(story_brief.get("counterforce") or ""))
    synthesis_to_land = _clean_line(str(story_brief.get("synthesis_to_land") or ""))
    gold_thread = _clean_line(str(story_brief.get("gold_thread") or ""))
    writer_north_star = _clean_line(str(story_brief.get("writer_north_star") or ""))
    analysis_tone = story_brief.get("analysis_tone") if isinstance(story_brief.get("analysis_tone"), dict) else {}
    analysis_flags = story_brief.get("analysis_flags") if isinstance(story_brief.get("analysis_flags"), dict) else {}
    argument_spine = story_brief.get("argument_spine") if isinstance(story_brief.get("argument_spine"), list) else []
    tone_primary = _clean_line(str(analysis_tone.get("primary") or ""))
    query_text = _clean_line(str(retrieval_bundle.get("query_text") or ""))

    lines = [base_prompt.strip(), "", "This assignment overrides generic habits:"]
    lines.append(f"- Story form: {story_mode}")
    lines.append(f"- Minimum body length before Pattern Signals: {word_floor} words")
    lines.append(f"- Aim for {target_low}-{target_high} body words before Pattern Signals so the piece reads filed, not sketched.")
    if selected_angle:
        lines.append(f"- Lock the piece to this angle: {selected_angle}")
    if why_now:
        lines.append(f"- Keep the why-now line concrete: {why_now}")
    if freshest_evidence:
        lines.append(f"- Freshest receipt: {freshest_evidence}")
    if audience_hook:
        lines.append(f"- Reader value: {audience_hook}")
    if counterforce:
        lines.append(f"- Counterforce to break: {counterforce}")
    if synthesis_to_land:
        lines.append(f"- Synthesis to land: {synthesis_to_land}")
    if gold_thread:
        lines.append(f"- Gold thread to mine: {gold_thread}")
    if writer_north_star:
        lines.append(f"- Writer north star: {writer_north_star}")
    if tone_primary:
        lines.append(f"- Tone lane: {tone_primary}")
    if query_text:
        lines.append(f"- Query spine: {query_text}")
    for label, key in (
        ("Tell to surface", "tell_kind"),
        ("Claim vs receipt", "claim_vs_receipt"),
        ("Institutional stress point", "institutional_stress"),
        ("Who benefits", "beneficiary"),
        ("Who absorbs the cost", "cost_bearer"),
        ("Evidence strength", "evidence_strength"),
    ):
        value = _clean_line(str(analysis_flags.get(key) or ""))
        if value:
            lines.append(f"- {label}: {value}")
    for idx, beat in enumerate(argument_spine[:5], start=1):
        lines.append(f"- Paragraph job {idx}: {_clean_line(str(beat))}")
    lines.extend(
        [
            "- Absorb the packet and file the finished piece only. Do not quote packet labels, continuity notes, or site-memory language.",
            "- Sound like a blonde Texan with Hayek in the carry-on: female, polished, dryly funny, stylish about power, exact about receipts, never frothy.",
            "- Do not slip into prestige-mag filler: ban lines like 'sobering reminder', 'latest chapter', 'in a nutshell', 'latest blow', or 'not just a political flourish'.",
            "- Never write stock filler like 'the pattern is clear', 'the contradiction is stark', or 'the fallout is clear'.",
            "- Open with the fact pattern or consequence, not atmosphere.",
            "- Make at least two concrete receipts do work in the body; name the outlet or institutional actor when it sharpens the line.",
            "- Do not invent named officials, committees, numbers, timelines, or scenes. If a proper noun or numeric claim is not in the evidence packet, leave it out or keep it generic.",
            "- Work the dialectic, not just the headline: establish the claim, break it against the counterforce, then cash out the gold thread.",
            "- Find the most revealing thread under the headline: courtroom tell, bureaucratic tell, donor tell, allied tell, market tell, or vanity tell.",
            "- Each body paragraph must do a different job. No paragraph should just restate the previous one with shinier adjectives.",
            "- If this is a lead analysis or theme column and the body stops around five hundred words, you have not finished the job.",
            "- Once the gold thread is real, stay on the page long enough to sound filed and quotable, not skimmed.",
            "- Let one sentence sting, but only after the evidence is on the page.",
            "- Let the female point of view notice the bluff, vanity, cowardice, and status theater the men in the room think is invisible.",
            "- If the draft could fit any administration, any week, or any generic anti-Trump site, it is too weak.",
            "- Make the menace sound expensive, not frantic.",
        ]
    )
    if story_form in {"lead_update", "theme_update"}:
        lines.append("- State what changed since the last BAT pass in the opening paragraph.")
    lines.append(f"- Use paragraph movement: {_story_form_movement_note(story_brief)}")
    return "\n".join(line for line in lines if line)


def _build_social_task_prompt(
    base_prompt: str,
    launch_packet: dict[str, object],
    story_brief: dict[str, object],
    retrieval_bundle: dict[str, object],
) -> str:
    selected_angle = _clean_line(str(launch_packet.get("selected_angle") or story_brief.get("selected_angle") or ""))
    why_now = _clean_line(str(launch_packet.get("why_now") or story_brief.get("why_now") or ""))
    freshest_evidence = _clean_line(str(story_brief.get("freshest_evidence") or ""))
    gold_thread = _clean_line(str(story_brief.get("gold_thread") or ""))
    analysis_flags = story_brief.get("analysis_flags") if isinstance(story_brief.get("analysis_flags"), dict) else {}
    query_text = _clean_line(str(retrieval_bundle.get("query_text") or ""))
    lines = [base_prompt.strip(), "", "Non-negotiable package rules:"]
    if selected_angle:
        lines.append(f"- Center the package on: {selected_angle}")
    if why_now:
        lines.append(f"- Keep the urgency specific: {why_now}")
    if freshest_evidence:
        lines.append(f"- Best receipt available: {freshest_evidence}")
    if gold_thread:
        lines.append(f"- Gold thread to surface: {gold_thread}")
    if query_text:
        lines.append(f"- Query spine: {query_text}")
    for label, key in (
        ("Tell to surface", "tell_kind"),
        ("Claim vs receipt", "claim_vs_receipt"),
        ("Who benefits", "beneficiary"),
        ("Who absorbs the cost", "cost_bearer"),
    ):
        value = _clean_line(str(analysis_flags.get(key) or ""))
        if value:
            lines.append(f"- {label}: {value}")
    lines.extend(
        [
            "- Absorb the packet and output finished post language only; never repeat packet labels or workflow instructions.",
            "- Sound like a blonde Texan with receipts and a Hayek allergy to concentrated power.",
            "- x_short must read like the immediate post, not a teaser for another line.",
            "- x_long must feel screenshot-worthy and materially different from x_short.",
            "- x_short should carry the clean tell; x_long should carry the claim-versus-receipt gap with more polish.",
            "- thread_2 and thread_3 must add receipts, not remix the hook.",
            "- thread_4 should name who pays or where the institutional stress lands.",
            "- Across the package, name at least one concrete actor, outlet, filing, court, or institutional receipt.",
            "- Find the cleanest tell in the story and make that the line people repeat.",
            "- Let the feminine authored voice notice the vanity, bluff, or status performance hiding inside the policy move.",
            "- Keep the cattiness lacquered, not sloppy.",
            "- If a line could fit any random GOP news cycle, rewrite it.",
        ]
    )
    return "\n".join(line for line in lines if line)


def _format_repetition_guard(repetition_guard: dict[str, object]) -> str:
    lines = ["Repetition guard:"]
    for title in repetition_guard.get("recent_titles", [])[:3]:
        cleaned = _clean_line(str(title))
        if cleaned:
            lines.append(f"- Nearby headline already filed: {cleaned}")
    for angle in repetition_guard.get("recent_angles", [])[:3]:
        cleaned = _clean_line(str(angle))
        if cleaned:
            lines.append(f"- Do not reopen with this exact angle wording: {cleaned}")
    for phrase in repetition_guard.get("avoid_phrases", [])[:4]:
        cleaned = _clean_line(str(phrase))
        if cleaned:
            lines.append(f"- Avoid this stale site phrase: {cleaned}")
    return "\n".join(lines)


def _editorial_output_contract(object_type: str, story_brief: dict[str, object]) -> str:
    body_paragraphs = int(story_brief.get("body_paragraphs") or 3)
    raw_extra_heading = str(story_brief.get("extra_heading") or "").strip()
    extra_heading = _clean_line(raw_extra_heading)
    extra_count = int(story_brief.get("extra_count") or 0)
    extra_label = _clean_line(str(story_brief.get("extra_label") or "note"))
    story_mode = _clean_line(str(story_brief.get("story_mode") or "Dispatch"))
    target_words = _clean_line(str(story_brief.get("target_words") or ""))
    word_floor = _story_form_word_floor(story_brief)
    target_low, target_high = _target_body_word_range(story_brief)
    lines = [
        "Return markdown with this exact structure:",
        f"- Story form label: {story_mode}",
        "- # <headline>",
        "- <dek line>",
        f"- {body_paragraphs} body paragraphs with factual grounding",
    ]
    if target_words:
        lines.append(f"- Rough length target: {target_words} words")
    lines.append(f"- Body target: {target_low}-{target_high} words before Pattern Signals")
    lines.append(f"- The body before any secondary heading must clear {word_floor} words")
    for job_line in _paragraph_job_lines(story_brief):
        lines.append(f"- {job_line}")
    lines.append("- Never print packet labels or backstage phrases such as Story brief, Analysis engine brief, Continuity note, Voice blueprint, or Nearby BAT coverage.")
    if extra_heading and extra_count:
        lines.append(f"- {raw_extra_heading or extra_heading}")
        lines.append(f"- {extra_count} bullet {extra_label}(s)")
    lines.extend(
        [
            "- ## Pattern Signals",
            "- 2-4 bullets",
            "",
            "Do not invent quotes or events. Distinguish observed facts from commentary tone.",
            "Do not mention the prompt, the brief, the assignment, or what the site previously wrote as meta narration.",
            f"Object type: {object_type}",
        ]
    )
    return "\n".join(lines)


def _social_output_contract() -> str:
    return (
        "Output labels exactly:\n"
        "x_short: <<=260 chars>\n"
        "x_long: <<=500 chars>\n"
        "thread_1: ... thread_5:\n"
        "Use x_short as the immediate dispatch, x_long as the quote-card caption, "
        "and make the thread move from hook to receipts to consequence.\n"
        "x_short should carry the tell, x_long should carry the claim-versus-receipt gap.\n"
        "thread_2 and thread_3 must add receipts instead of repeating thread_1.\n"
        "thread_4 should name who pays or where the institutional stress lands.\n"
        "Ground every claim in provided source context and avoid generic lines."
    )


def _grounded_source_count(bundle: dict) -> int:
    count = 0
    for source in bundle.get("raw_sources", []):
        if float(source.get("quality_score") or 0) >= float(settings.retrieval_min_quality_score):
            count += 1
    return count


def _dedupe_social_candidates(values: list[str], *, minimum_len: int = 24, limit: int = 5) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []
    for value in values:
        cleaned = _clean_line(value)
        if len(cleaned) < minimum_len:
            continue
        fingerprint = re.sub(r"[^a-z0-9]+", " ", cleaned.lower()).strip()
        if not fingerprint or fingerprint in seen:
            continue
        seen.add(fingerprint)
        deduped.append(cleaned)
        if len(deduped) >= limit:
            break
    return deduped


async def _get_memory_value(db: AsyncSession, memory_type: str, key: str) -> str | None:
    row = (await db.execute(select(VoiceMemory).where(VoiceMemory.memory_type == memory_type, VoiceMemory.key == key))).scalar_one_or_none()
    if not row:
        return None
    return row.value


async def _recent_source_context(db: AsyncSession, limit: int = 6) -> str:
    sources = (await db.execute(select(Source).order_by(Source.fetched_at.desc()).limit(limit))).scalars().all()
    lines = []
    for source in sources:
        title = source.title or "Untitled"
        source_type = source.source_type or "source"
        lines.append(f"- [{source_type}] {title} ({source.source_url})")
    return "\n".join(lines) or "- No sources currently ingested"


async def _recent_editorial_coverage(
    db: AsyncSession,
    *,
    theme_slug: str | None = None,
    limit: int = RECENT_COVERAGE_LIMIT,
) -> list[dict[str, object]]:
    statuses = ["published", "approved"]
    cutoff = datetime.utcnow() - timedelta(hours=max(6, int(RECENT_COVERAGE_LOOKBACK_HOURS)))

    rows = (
        await db.execute(
            select(EditorialObject)
            .where(
                EditorialObject.status.in_(statuses),
                EditorialObject.created_at >= cutoff,
            )
            .order_by(EditorialObject.created_at.desc())
            .limit(max(4, limit * 2))
        )
    ).scalars().all()

    if len(rows) < max(3, limit // 2):
        rows = (
            await db.execute(
                select(EditorialObject)
                .where(EditorialObject.status.in_(statuses))
                .order_by(EditorialObject.created_at.desc())
                .limit(max(4, limit * 2))
            )
        ).scalars().all()

    coverage: list[dict[str, object]] = []
    seen_titles: set[str] = set()
    for row in rows:
        metadata = row.meta or {}
        story_brief = metadata.get("story_brief", {}) if isinstance(metadata, dict) else {}
        launch_packet = metadata.get("launch_packet", {}) if isinstance(metadata, dict) else {}
        normalized_title = derive_editorial_title(row.title, row.body_md, row.object_type)
        if not normalized_title or editorial_looks_placeholder(normalized_title, row.body_md):
            continue
        title_key = _text_fingerprint(normalized_title)
        if title_key in seen_titles:
            continue
        seen_titles.add(title_key)
        row_theme_slug = _clean_line(
            str(
                (story_brief.get("theme_slug") if isinstance(story_brief, dict) else "")
                or metadata.get("theme_slug")
                or ""
            )
        )
        if theme_slug and row_theme_slug and row_theme_slug != theme_slug:
            continue
        paragraphs = _body_paragraphs(row.body_md or "")
        opening_line = _clean_line(str((launch_packet.get("opening_line") if isinstance(launch_packet, dict) else "") or ""))
        if not opening_line and paragraphs:
            opening_line = _leading_sentence(paragraphs[0])
        pull_quote = _clean_line(
            str(
                (launch_packet.get("quote_card_line") if isinstance(launch_packet, dict) else "")
                or (launch_packet.get("pull_quote") if isinstance(launch_packet, dict) else "")
                or ""
            )
        )
        age_hours = 0
        if row.created_at:
            age_hours = max(0, int((datetime.utcnow() - row.created_at.replace(tzinfo=None)).total_seconds() // 3600))
        coverage.append(
            {
                "id": str(row.id),
                "title": normalized_title,
                "slug": row.slug,
                "status": row.status,
                "object_type": row.object_type,
                "story_mode": _clean_line(str((story_brief.get("story_mode") if isinstance(story_brief, dict) else "") or "")),
                "story_form": _clean_line(str((story_brief.get("story_form") if isinstance(story_brief, dict) else "") or "")),
                "theme_slug": row_theme_slug,
                "selected_angle": _clean_line(str((launch_packet.get("selected_angle") if isinstance(launch_packet, dict) else "") or "")),
                "why_now": _clean_line(
                    str(
                        (launch_packet.get("why_now") if isinstance(launch_packet, dict) else "")
                        or (story_brief.get("why_now") if isinstance(story_brief, dict) else "")
                        or ""
                    )
                ),
                "opening_line": opening_line,
                "pull_quote": pull_quote,
                "body_excerpt": _clean_line(paragraphs[0] if paragraphs else (row.summary or ""))[:240],
                "word_count": int((metadata.get("body_word_count") or 0) or _word_count(row.body_md or "")),
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "age_hours": age_hours,
            }
        )
        if len(coverage) >= limit:
            break

    return coverage


def _voice_memory_value_is_noise(value: str | None) -> bool:
    cleaned = _clean_line(value or "")
    if not cleaned:
        return True
    lowered = cleaned.lower()
    if any(marker in lowered for marker in NOISY_MEMORY_MARKERS):
        return True
    return _looks_like_prompt_instruction(cleaned)


def _memory_sentence_priority(candidate: str, *, title_line: str, lane: str) -> tuple[int, int]:
    cleaned = _clean_line(candidate)
    lowered = cleaned.lower()
    score = 0
    if has_trump_focus(cleaned, title_line):
        score += 6
    if 36 <= len(cleaned) <= 180:
        score += 3
    elif len(cleaned) < 28 or len(cleaned) > 220:
        score -= 4
    if any(marker in lowered for marker in ("but ", "while ", "instead", "because", "which ", "so ")):
        score += 3
    if any(marker in lowered for marker in ("court", "filing", "administration", "white house", "congress", "pattern")):
        score += 2
    if lane == "social" and len(cleaned) <= 140:
        score += 1
    if _looks_like_headlineish_text(cleaned):
        score -= 6
    return score, -abs(110 - len(cleaned))


def _select_voice_memory_excerpt(title: str | None, body: str | None, *, lane: str) -> str:
    title_line = _clean_line(title or "")
    paragraphs = _body_paragraphs(body)
    signals = _extract_pattern_signals(body)
    sentences: list[str] = []
    for paragraph in paragraphs[-3:]:
        for piece in re.split(r"(?<=[.!?])\s+", paragraph):
            cleaned = _clean_line(piece)
            if cleaned:
                sentences.append(cleaned)

    if lane == "social":
        candidates = signals + list(reversed(sentences[-5:])) + [title_line]
    else:
        tail_sentences = list(reversed(sentences[-8:]))
        candidates = signals + tail_sentences + [title_line]

    ranked_candidates = sorted(
        candidates,
        key=lambda candidate: _memory_sentence_priority(candidate, title_line=title_line, lane=lane),
        reverse=True,
    )

    for candidate in ranked_candidates:
        cleaned = _clean_line(candidate)
        if len(cleaned) < 28 or len(cleaned) > 220:
            continue
        if _voice_memory_value_is_noise(cleaned):
            continue
        if cleaned == title_line or _looks_like_headlineish_text(cleaned):
            continue
        if has_trump_focus(cleaned, title_line):
            return cleaned

    if title_line and not _voice_memory_value_is_noise(title_line) and not _looks_like_headlineish_text(title_line):
        return title_line
    return "Pattern-first voice remains sharp."


def _build_coverage_arc_memory(
    title: str | None,
    body: str | None,
    *,
    story_brief: dict[str, object] | None = None,
    launch_packet: dict[str, object] | None = None,
) -> str:
    story_brief = story_brief or {}
    launch_packet = launch_packet or {}
    focus_label = _clean_line(
        str(
            story_brief.get("focus_label")
            or story_brief.get("theme_slug")
            or launch_packet.get("story_mode")
            or title
            or "BAT lane"
        )
    )
    selected_angle = _clean_line(str(launch_packet.get("selected_angle") or story_brief.get("selected_angle") or title or ""))
    why_now = _clean_line(str(launch_packet.get("why_now") or story_brief.get("why_now") or ""))
    continuity_note = _clean_line(str(story_brief.get("continuity_note") or ""))
    nearby_coverage = story_brief.get("nearby_coverage") or []
    prior_title = ""
    if nearby_coverage and isinstance(nearby_coverage, list):
        prior_title = _clean_line(str((nearby_coverage[0] or {}).get("title") or ""))

    if focus_label and prior_title and selected_angle:
        return _limit_text(
            f"{focus_label}: BAT moved from '{prior_title}' to '{selected_angle}'. {why_now or continuity_note}",
            300,
        )
    if focus_label and selected_angle and why_now:
        return _limit_text(f"{focus_label}: keep pushing from '{selected_angle}' because {why_now.lower()}", 300)
    signal_line = _select_voice_memory_excerpt(title, body, lane="editorial")
    if focus_label and signal_line:
        return _limit_text(f"{focus_label}: {signal_line}", 300)
    return _limit_text(signal_line or focus_label or "BAT lane stays live.", 300)


async def _voice_context_block(
    db: AsyncSession,
    *,
    lane: str,
    limit: int = 12,
) -> tuple[str, list[dict[str, str | float]]]:
    normalized_lane = lane.lower()
    if normalized_lane.startswith("social") or normalized_lane.startswith("live-social") or normalized_lane.startswith("live_social"):
        memory_types = [
            "live_vibe",
            "analysis_brief",
            "tone_lane",
            "voice_wins_social",
            "persona",
            "voice_guardrail",
            "voice_blueprint",
        ]
    else:
        memory_types = [
            "voice_blueprint",
            "analysis_brief",
            "tone_lane",
            "voice_wins",
            "coverage_arc",
            "persona",
            "voice_guardrail",
            "label_recurring",
            "metaphor_stale",
        ]
    rows = (
        await db.execute(
            select(VoiceMemory)
            .where(VoiceMemory.memory_type.in_(memory_types))
            .order_by(VoiceMemory.weight.desc(), VoiceMemory.updated_at.desc())
            .limit(max(4, limit))
        )
    ).scalars().all()

    if not rows:
        fallback = (
            "Voice baseline: polished southern cadence, clean editorial cuts, no fabricated facts, "
            "and always pattern-first framing."
        )
        return fallback, []

    selected: list[dict[str, str | float]] = []
    lines: list[str] = [f"Voice state for lane `{lane}`:"]
    seen_values: set[str] = set()
    for row in rows[:limit]:
        value = _clean_line((row.value or "").replace("\n", " "))
        if not value or _voice_memory_value_is_noise(value):
            continue
        if str(row.memory_type).startswith("voice_wins") and _looks_like_headlineish_text(value):
            continue
        fingerprint = _text_fingerprint(value)
        if not fingerprint or fingerprint in seen_values:
            continue
        seen_values.add(fingerprint)
        lines.append(f"- [{row.memory_type}:{row.key} | w={float(row.weight or 1):.2f}] {value}")
        selected.append(
            {
                "memory_type": row.memory_type,
                "key": row.key,
                "value": value,
                "weight": float(row.weight or 1),
            }
        )
    if len(lines) == 1:
        lines.append("- Keep voice clear, witty, factual, and tightly compressed.")
    return "\n".join(lines), selected


async def get_runtime_controls(db: AsyncSession) -> dict:
    direct_publish_raw = await _get_memory_value(db, SYSTEM_SETTING_MEMORY_TYPE, SYSTEM_SETTING_DIRECT_PUBLISH)
    x_live_posting_raw = await _get_memory_value(db, SYSTEM_SETTING_MEMORY_TYPE, SYSTEM_SETTING_X_LIVE_POSTING)
    x_research_enabled_raw = await _get_memory_value(db, SYSTEM_SETTING_MEMORY_TYPE, SYSTEM_SETTING_X_RESEARCH_ENABLED)
    research_directive = await _get_memory_value(db, "research_directive", PRIMARY_ENTRY_KEY)
    analysis_directive = await _get_memory_value(db, "analysis_directive", PRIMARY_ENTRY_KEY)
    voice_blueprint = await _get_memory_value(db, "voice_blueprint", PRIMARY_ENTRY_KEY)
    live_vibe = await _get_memory_value(db, "live_vibe", PRIMARY_ENTRY_KEY)

    return {
        "direct_publish": _as_bool(direct_publish_raw, settings.direct_publish_default),
        "x_live_posting": _as_bool(x_live_posting_raw, settings.x_enabled and not settings.x_dry_run),
        "x_research_enabled": _as_bool(x_research_enabled_raw, settings.x_research_enabled),
        "research_directive": (research_directive or settings.default_research_directive).strip(),
        "analysis_directive": (analysis_directive or settings.default_analysis_directive).strip(),
        "voice_blueprint": (voice_blueprint or settings.default_voice_blueprint).strip(),
        "live_vibe": (live_vibe or settings.default_live_vibe).strip(),
    }


async def update_runtime_controls(
    db: AsyncSession,
    *,
    direct_publish: bool | None = None,
    x_live_posting: bool | None = None,
    x_research_enabled: bool | None = None,
    research_directive: str | None = None,
    analysis_directive: str | None = None,
    voice_blueprint: str | None = None,
    live_vibe: str | None = None,
) -> dict:
    if direct_publish is not None:
        await update_voice_memory(
            db,
            memory_type=SYSTEM_SETTING_MEMORY_TYPE,
            key=SYSTEM_SETTING_DIRECT_PUBLISH,
            value="true" if direct_publish else "false",
            weight=1.0,
        )
    if x_live_posting is not None:
        await update_voice_memory(
            db,
            memory_type=SYSTEM_SETTING_MEMORY_TYPE,
            key=SYSTEM_SETTING_X_LIVE_POSTING,
            value="true" if x_live_posting else "false",
            weight=1.0,
        )
    if x_research_enabled is not None:
        await update_voice_memory(
            db,
            memory_type=SYSTEM_SETTING_MEMORY_TYPE,
            key=SYSTEM_SETTING_X_RESEARCH_ENABLED,
            value="true" if x_research_enabled else "false",
            weight=1.0,
        )
    if research_directive is not None:
        await update_voice_memory(
            db,
            memory_type="research_directive",
            key=PRIMARY_ENTRY_KEY,
            value=research_directive.strip(),
            weight=1.2,
        )
    if analysis_directive is not None:
        await update_voice_memory(
            db,
            memory_type="analysis_directive",
            key=PRIMARY_ENTRY_KEY,
            value=analysis_directive.strip(),
            weight=1.25,
        )
    if voice_blueprint is not None:
        await update_voice_memory(
            db,
            memory_type="voice_blueprint",
            key=PRIMARY_ENTRY_KEY,
            value=voice_blueprint.strip(),
            weight=1.35,
        )
    if live_vibe is not None:
        await update_voice_memory(
            db,
            memory_type="live_vibe",
            key=PRIMARY_ENTRY_KEY,
            value=live_vibe.strip(),
            weight=1.25,
        )

    return await get_runtime_controls(db)


async def record_voice_learning_from_publication(
    db: AsyncSession,
    *,
    lane: str,
    title: str | None,
    body: str | None,
    story_brief: dict[str, object] | None = None,
    launch_packet: dict[str, object] | None = None,
) -> None:
    title_line = _clean_line(title or "")
    signal_line = _select_voice_memory_excerpt(title, body, lane=lane)
    key_seed = f"{title_line} {signal_line}".strip() or signal_line
    memory_key = _voice_memory_key_from_text(key_seed, f"{lane}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}")
    memory_type = "voice_wins_social" if lane == "social" else "voice_wins"
    value = signal_line if len(signal_line) >= 12 else "Pattern-first voice remains sharp."
    await update_voice_memory(
        db,
        memory_type=memory_type,
        key=memory_key,
        value=value[:300],
        weight=1.2 if lane == "editorial" else 1.1,
    )
    if lane == "editorial":
        coverage_value = _build_coverage_arc_memory(
            title,
            body,
            story_brief=story_brief,
            launch_packet=launch_packet,
        )
        coverage_key_seed = " ".join(
            part
            for part in [
                _clean_line(str((story_brief or {}).get("theme_slug") or "")),
                _clean_line(str((launch_packet or {}).get("selected_angle") or "")),
                title_line,
            ]
            if part
        )
        coverage_key = _voice_memory_key_from_text(
            coverage_key_seed,
            f"coverage-arc-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
        )
        await update_voice_memory(
            db,
            memory_type="coverage_arc",
            key=coverage_key,
            value=coverage_value,
            weight=1.18,
        )


async def _editorial_query_text(
    db: AsyncSession,
    *,
    object_type: str,
    theme: Theme | None,
    controls: dict[str, object],
) -> str:
    if theme and theme.name:
        hint = _theme_query_hint(theme)
        theme_parts = _dedupe_clean_lines(
            [
                str(theme.name or ""),
                str(theme.slug or "").replace("-", " "),
                hint,
            ],
            minimum_len=4,
            limit=3,
        )
        query = f"Trump administration {' '.join(theme_parts)} latest {settings.current_news_min_year}".strip()
        return query[:180]

    directive = str(controls.get("research_directive") or "").strip()
    directive_lines = [line.strip() for line in re.split(r"[\n|]+", directive) if line.strip()]
    if directive_lines:
        for line in directive_lines:
            candidate = _normalize_prompt_topic(line) or _clean_line(line)
            if candidate and not _meta_query_candidate(candidate):
                return candidate[:180]

    if object_type == "lead_story":
        site_brief = await select_analysis_brief(db, scope_type="site")
        if isinstance(site_brief, dict):
            site_meta = _analysis_meta(site_brief)
            year_fragment = str(settings.current_news_min_year)
            for candidate in (
                site_meta.get("selected_angle"),
                site_brief.get("title"),
                site_meta.get("retrieval_query"),
                site_meta.get("focus_label"),
            ):
                cleaned = _normalize_prompt_topic(str(candidate or "")) or _clean_line(str(candidate or ""))
                if not cleaned or _meta_query_candidate(cleaned):
                    continue
                if not has_trump_focus(cleaned):
                    cleaned = f"Trump administration {cleaned}".strip()
                if year_fragment not in cleaned:
                    cleaned = f"{cleaned} latest {year_fragment}"
                return cleaned[:180]

    lead_theme = (await db.execute(select(Theme).order_by(Theme.active_score.desc()).limit(1))).scalar_one_or_none()
    if lead_theme and lead_theme.name:
        return f"Trump administration {lead_theme.name} latest {settings.current_news_min_year}"

    if object_type == "lead_story":
        return f"Trump White House GOP courts latest {settings.current_news_min_year}"

    return f"Trump administration {object_type.replace('_', ' ')} {settings.current_news_min_year}"


def _refined_editorial_query_text(
    base_query: str,
    *,
    object_type: str,
    theme: Theme | None,
    analysis_brief: dict[str, object] | None,
) -> str:
    analysis_meta = _analysis_meta(analysis_brief)
    query_variants = _analysis_lines(analysis_meta.get("query_variants"), minimum_len=8, limit=3)
    title_hint = _clean_line(str((analysis_brief or {}).get("title") or ""))
    selected_angle = _clean_line(str(analysis_meta.get("selected_angle") or (analysis_brief or {}).get("title") or ""))
    focus_label = _clean_line(str(analysis_meta.get("focus_label") or (analysis_brief or {}).get("label") or ""))

    def _too_generic(value: str) -> bool:
        lowered = _clean_line(value).lower()
        if not lowered:
            return True
        if len(re.findall(r"[a-z0-9']+", lowered)) < 5:
            return True
        return _meta_query_candidate(value)

    candidates: list[str] = []
    if object_type == "lead_story":
        candidates.extend([selected_angle, title_hint, *query_variants[:1], focus_label, base_query])
    elif theme and query_variants:
        candidates.extend([selected_angle, title_hint, *query_variants, focus_label, base_query])
    else:
        candidates.extend([selected_angle, title_hint, *query_variants[:1], focus_label, base_query])

    year_fragment = str(settings.current_news_min_year)
    for candidate in candidates:
        if _too_generic(candidate):
            continue
        cleaned = _normalize_prompt_topic(candidate) or _clean_line(candidate)
        if len(cleaned) < 8:
            continue
        if not has_trump_focus(cleaned):
            cleaned = f"Trump administration {cleaned}"
        if year_fragment not in cleaned:
            cleaned = f"{cleaned} latest {year_fragment}"
        return cleaned[:180]

    return _normalize_prompt_topic(base_query)[:180]


def _editorial_query_sets(
    refined_query_text: str,
    *,
    object_type: str,
    theme: Theme | None,
    analysis_brief: dict[str, object] | None,
) -> list[dict[str, str]]:
    analysis_meta = _analysis_meta(analysis_brief)
    query_variants = _analysis_lines(analysis_meta.get("query_variants"), minimum_len=8, limit=4)
    title_hint = _clean_line(str((analysis_brief or {}).get("title") or ""))
    selected_angle = _clean_line(str(analysis_meta.get("selected_angle") or title_hint))
    if object_type == "lead_story":
        candidates = [selected_angle, title_hint, *query_variants[:1], refined_query_text]
        query_limit = 2
    else:
        candidates = [selected_angle, title_hint, *query_variants, refined_query_text]
        query_limit = 2
    year_fragment = str(settings.current_news_min_year)
    query_sets: list[dict[str, str]] = []
    seen: set[str] = set()

    for candidate in candidates:
        cleaned = _normalize_prompt_topic(candidate) or _clean_line(candidate)
        if not cleaned or _meta_query_candidate(cleaned):
            continue
        if not has_trump_focus(cleaned):
            if theme and theme.name and theme.name.lower() not in cleaned.lower():
                cleaned = f"Trump {theme.name} {cleaned}".strip()
            else:
                cleaned = f"Trump administration {cleaned}".strip()
        if year_fragment not in cleaned:
            cleaned = f"{cleaned} latest {year_fragment}"
        cleaned = cleaned[:180]
        fingerprint = _text_fingerprint(cleaned)
        if not fingerprint or fingerprint in seen:
            continue
        seen.add(fingerprint)
        query_sets.append({"query_text": cleaned})
        if len(query_sets) >= query_limit:
            break

    fallback = _normalize_prompt_topic(refined_query_text) or _clean_line(refined_query_text)
    if fallback and not query_sets:
        if not has_trump_focus(fallback):
            fallback = f"Trump administration {fallback}".strip()
        if year_fragment not in fallback:
            fallback = f"{fallback} latest {year_fragment}"
        query_sets.append({"query_text": fallback[:180]})
    return query_sets


async def _build_editorial_retrieval_bundle(
    db: AsyncSession,
    *,
    object_type: str,
    theme_slug: str | None,
    theme: Theme | None,
    analysis_brief: dict[str, object] | None,
    base_query_text: str,
    source_limit: int,
) -> dict[str, object]:
    query_sets = _editorial_query_sets(
        base_query_text,
        object_type=object_type,
        theme=theme,
        analysis_brief=analysis_brief,
    )
    if not query_sets:
        return await build_retrieval_bundle(
            db,
            query_text=base_query_text,
            theme_slug=theme_slug,
            source_limit=source_limit,
        )

    per_query_limit = source_limit if len(query_sets) == 1 else max(4, min(source_limit, 4))
    bundles = [
        await build_retrieval_bundle(
            db,
            query_text=str(query_set.get("query_text") or base_query_text),
            theme_slug=theme_slug,
            source_limit=per_query_limit,
        )
        for query_set in query_sets
    ]
    if len(bundles) == 1:
        return bundles[0]

    merged = _merge_retrieval_bundles(
        bundles,
        query_sets=query_sets,
        source_limit=source_limit,
        trend_limit=int(settings.retrieval_max_trends),
    )
    log_event(
        logger,
        "editorial.retrieval_amplified",
        object_type=object_type,
        query_variants=[str(item.get("query_text") or "") for item in query_sets],
        source_count=len(merged.get("raw_sources") or []),
    )
    return merged


def _fallback_social_package(
    editorial_object: EditorialObject,
    launch_packet: dict[str, object],
    story_brief: dict[str, object],
    retrieval_bundle: dict[str, object] | None = None,
) -> tuple[str, str, list[str]]:
    title = _clean_line(editorial_object.title or "BAT dispatch")
    selected_angle = _clean_line(str(launch_packet.get("selected_angle") or story_brief.get("selected_angle") or title))
    why_now = _clean_line(str(launch_packet.get("why_now") or story_brief.get("why_now") or editorial_object.summary or title))
    pull_quote = _clean_line(str(launch_packet.get("quote_card_line") or launch_packet.get("pull_quote") or title))
    evidence = _clean_line(str(story_brief.get("freshest_evidence") or ""))
    signals = [str(item) for item in (launch_packet.get("pattern_signals") or [])]
    hooks = [str(item) for item in (launch_packet.get("social_hooks") or [])]
    retrieval_seed = retrieval_bundle or {"query_text": title}
    political_seed = _political_focus_seed(retrieval_seed, story_brief)
    anchor = selected_angle if selected_angle and has_trump_focus(selected_angle) else political_seed
    raw_sources = (retrieval_bundle or {}).get("raw_sources", []) or []
    focus_query = _story_focus_query(
        selected_angle=selected_angle,
        freshest_evidence=evidence,
        fallback_query=str((retrieval_bundle or {}).get("query_text") or title),
    )
    preferred_sources = _preferred_story_sources(
        raw_sources,
        limit=2,
        query_text=focus_query or str((retrieval_bundle or {}).get("query_text") or title),
    ) or raw_sources[:2]
    source_focus_query = focus_query or str((retrieval_bundle or {}).get("query_text") or title)
    lead_receipt = (
        _source_receipt_sentence(preferred_sources[0], role="lead", query_text=source_focus_query)
        if preferred_sources
        else ""
    )
    support_receipt = (
        _source_receipt_sentence(preferred_sources[1], role="support", query_text=source_focus_query)
        if len(preferred_sources) > 1
        else ""
    )

    short_candidates = _dedupe_social_candidates(
        [
            hooks[0] if hooks else "",
            f"{anchor}. {evidence} is the receipt. {why_now}" if evidence else "",
            f"{anchor}. {lead_receipt} {why_now}",
            f"{title}. {why_now}",
        ],
        minimum_len=48,
        limit=4,
    )
    long_candidates = _dedupe_social_candidates(
        [
            f"{anchor}. {lead_receipt} {support_receipt}".strip(),
            f"{pull_quote} {why_now}",
            f"{anchor}. {evidence}" if evidence else "",
            f"{title}. {why_now}",
        ],
        minimum_len=48,
        limit=4,
    )
    thread_candidates = _dedupe_social_candidates(
        [
            hooks[0] if hooks else "",
            f"{anchor}. {evidence} is the line to keep open." if evidence else anchor,
            lead_receipt,
            support_receipt,
            signals[0] if signals else "",
            why_now,
            pull_quote,
        ],
        minimum_len=40,
        limit=5,
    )

    short = _limit_text(short_candidates[0] if short_candidates else anchor, 260)
    long = _limit_text(long_candidates[0] if long_candidates else f"{anchor}. {why_now}", 500)
    thread = [_limit_text(candidate, 260) for candidate in thread_candidates[:5]]
    if len(thread) < 3:
        thread = _dedupe_social_candidates(
            thread
            + [
                f"{anchor}. {evidence} is the clearest receipt on the board." if evidence else "",
                lead_receipt,
                support_receipt,
                f"{political_seed}. {why_now}",
                f"{political_seed}. {pull_quote}",
            ],
            minimum_len=40,
            limit=5,
        )
        thread = [_limit_text(candidate, 260) for candidate in thread[:5]]
    if len(thread) < 2:
        thread = _dedupe_social_candidates(
            [short, long, f"{political_seed}. {why_now}"],
            minimum_len=32,
            limit=3,
        )
    return short, long, thread[:5]


async def _run_editorial_generation_pass(
    *,
    object_type: str,
    story_brief: dict[str, object],
    retrieval_bundle: dict[str, object],
    analysis_brief: dict[str, object] | None,
    recent_coverage: list[dict[str, object]],
    repetition_guard: dict[str, object] | None,
    editorial_task_prompt: str,
    context: str,
    constitution: str,
    current_body: str | None = None,
    current_generation_path: str | None = None,
    correlation_prefix: str = "editorial",
) -> dict[str, Any]:
    grounded_sources = _grounded_source_count(retrieval_bundle)
    requires_research = grounded_sources < max(1, int(settings.generation_min_grounded_sources))
    reroll_count = 0
    story_form_key = str(story_brief.get("story_form") or "")
    editorial_max_tokens = int(
        EDITORIAL_MAX_TOKENS_BY_FORM.get(
            story_form_key,
            1600 if int(story_brief.get("body_paragraphs") or 3) >= 3 else 1200,
        )
    )
    fallback_body = _apply_voice_polish(
        _build_grounded_editorial_fallback(retrieval_bundle, story_brief, object_type=object_type),
        lane="editorial",
    )
    fallback_title = derive_editorial_title(None, fallback_body, object_type)
    fallback_style_report = _assess_grounded_editorial_candidate(
        fallback_body,
        title=fallback_title,
        recent_coverage=recent_coverage,
        repetition_guard=repetition_guard if isinstance(repetition_guard, dict) else None,
        story_brief=story_brief,
        retrieval_bundle=retrieval_bundle,
        analysis_brief=analysis_brief,
    )

    body = fallback_body
    style_report = fallback_style_report
    generation_path = "fallback_grounded"
    dialectic_review: dict[str, object] = {
        "attempted": False,
        "selected": False,
        "model": settings.llm_challenger_model,
    }

    if current_body:
        existing_body = _apply_voice_polish(current_body, lane="editorial")
        if existing_body:
            existing_title = derive_editorial_title(None, existing_body, object_type)
            existing_style_report = _assess_grounded_editorial_candidate(
                existing_body,
                title=existing_title,
                recent_coverage=recent_coverage,
                repetition_guard=repetition_guard if isinstance(repetition_guard, dict) else None,
                story_brief=story_brief,
                retrieval_bundle=retrieval_bundle,
                analysis_brief=analysis_brief,
            )
            if _style_rank(existing_style_report) >= _style_rank(style_report):
                body = existing_body
                style_report = existing_style_report
                generation_path = current_generation_path or "existing_draft"

    if not requires_research:
        raw_body = await generate_with_cat(
            editorial_task_prompt,
            context,
            system_prompt=constitution,
            output_contract=_editorial_output_contract(object_type, story_brief),
            correlation_id=f"{correlation_prefix}-{uuid.uuid4()}",
            temperature=0.42,
            max_tokens=editorial_max_tokens,
        )
        primary_body = _apply_voice_polish(raw_body, lane="editorial")
        primary_title = derive_editorial_title(None, primary_body, object_type)
        primary_style_report = _assess_grounded_editorial_candidate(
            primary_body,
            title=primary_title,
            recent_coverage=recent_coverage,
            repetition_guard=repetition_guard if isinstance(repetition_guard, dict) else None,
            story_brief=story_brief,
            retrieval_bundle=retrieval_bundle,
            analysis_brief=analysis_brief,
        )
        if _style_rank(primary_style_report) >= _style_rank(style_report):
            body = primary_body
            style_report = primary_style_report
            generation_path = "model_primary"

        if not style_report.get("passes"):
            reroll_count = max(reroll_count, 1)
            retry_raw_body = await generate_with_cat(
                f"{editorial_task_prompt}\n\n{_editorial_retry_note(style_report, story_brief)}",
                context,
                system_prompt=constitution,
                output_contract=_editorial_output_contract(object_type, story_brief),
                correlation_id=f"{correlation_prefix}-retry-{uuid.uuid4()}",
                temperature=0.38,
                max_tokens=editorial_max_tokens,
            )
            retry_body = _apply_voice_polish(retry_raw_body, lane="editorial")
            retry_title = derive_editorial_title(None, retry_body, object_type)
            retry_style_report = _assess_grounded_editorial_candidate(
                retry_body,
                title=retry_title,
                recent_coverage=recent_coverage,
                repetition_guard=repetition_guard if isinstance(repetition_guard, dict) else None,
                story_brief=story_brief,
                retrieval_bundle=retrieval_bundle,
                analysis_brief=analysis_brief,
            )
            if _style_rank(retry_style_report) >= _style_rank(style_report):
                body = retry_body
                style_report = retry_style_report
                generation_path = "model_retry"

        if reroll_count < 2 and not style_report.get("passes") and _needs_editorial_expansion(style_report, story_brief):
            reroll_count = max(reroll_count, 2)
            expansion_raw_body = await generate_with_cat(
                f"{editorial_task_prompt}\n\n{_build_editorial_expansion_prompt(style_report, story_brief)}",
                "\n\n".join(
                    [
                        context,
                        "Draft to expand:\n" + (body or "").strip(),
                    ]
                ).strip(),
                system_prompt=constitution,
                output_contract=_editorial_output_contract(object_type, story_brief),
                correlation_id=f"{correlation_prefix}-expansion-{uuid.uuid4()}",
                temperature=0.30,
                max_tokens=editorial_max_tokens,
            )
            expansion_body = _apply_voice_polish(expansion_raw_body, lane="editorial")
            expansion_title = derive_editorial_title(None, expansion_body, object_type)
            expansion_style_report = _assess_grounded_editorial_candidate(
                expansion_body,
                title=expansion_title,
                recent_coverage=recent_coverage,
                repetition_guard=repetition_guard if isinstance(repetition_guard, dict) else None,
                story_brief=story_brief,
                retrieval_bundle=retrieval_bundle,
                analysis_brief=analysis_brief,
            )
            if _style_rank(expansion_style_report) >= _style_rank(style_report):
                body = expansion_body
                style_report = expansion_style_report
                generation_path = "model_expansion"

        if reroll_count < 2 and not style_report.get("passes") and _should_attempt_editorial_revision(style_report):
            reroll_count = max(reroll_count, 3)
            revision_raw_body = await generate_with_cat(
                f"{editorial_task_prompt}\n\n{_build_editorial_revision_prompt(style_report, story_brief)}",
                "\n\n".join(
                    [
                        context,
                        "Draft to revise:\n" + (body or "").strip(),
                    ]
                ).strip(),
                system_prompt=constitution,
                output_contract=_editorial_output_contract(object_type, story_brief),
                correlation_id=f"{correlation_prefix}-revision-{uuid.uuid4()}",
                temperature=0.28,
                max_tokens=editorial_max_tokens,
            )
            revision_body = _apply_voice_polish(revision_raw_body, lane="editorial")
            revision_title = derive_editorial_title(None, revision_body, object_type)
            revision_style_report = _assess_grounded_editorial_candidate(
                revision_body,
                title=revision_title,
                recent_coverage=recent_coverage,
                repetition_guard=repetition_guard if isinstance(repetition_guard, dict) else None,
                story_brief=story_brief,
                retrieval_bundle=retrieval_bundle,
                analysis_brief=analysis_brief,
            )
            if _style_rank(revision_style_report) >= _style_rank(style_report):
                body = revision_body
                style_report = revision_style_report
                generation_path = "model_revision"

        if reroll_count < 2 and not bool((style_report.get("grounding_report") or {}).get("passes", True)):
            reroll_count = max(reroll_count, 4)
            grounding_raw_body = await generate_with_cat(
                f"{editorial_task_prompt}\n\n{_build_grounding_repair_prompt(style_report.get('grounding_report') or {}, story_brief)}",
                "\n\n".join(
                    [
                        context,
                        "Draft to repair:\n" + (body or "").strip(),
                    ]
                ).strip(),
                system_prompt=constitution,
                output_contract=_editorial_output_contract(object_type, story_brief),
                correlation_id=f"{correlation_prefix}-grounding-repair-{uuid.uuid4()}",
                temperature=0.20,
                max_tokens=editorial_max_tokens,
            )
            grounding_body = _apply_voice_polish(grounding_raw_body, lane="editorial")
            grounding_title = derive_editorial_title(None, grounding_body, object_type)
            grounding_style_report = _assess_grounded_editorial_candidate(
                grounding_body,
                title=grounding_title,
                recent_coverage=recent_coverage,
                repetition_guard=repetition_guard if isinstance(repetition_guard, dict) else None,
                story_brief=story_brief,
                retrieval_bundle=retrieval_bundle,
                analysis_brief=analysis_brief,
            )
            if _style_rank(grounding_style_report) >= _style_rank(style_report):
                body = grounding_body
                style_report = grounding_style_report
                generation_path = "model_grounding_repair"

        # A passing primary is publishable; do not spend another full model
        # request challenging it. Reserve the challenger for drafts that need
        # substantive rescue, keeping the release loop bounded and live.
        if body and not style_report.get("passes") and str(settings.llm_challenger_model or "").strip():
            reroll_count = max(reroll_count, 1)
            champion_style_report = style_report
            challenger_raw_body = await generate_with_cat(
                f"{editorial_task_prompt}\n\n{_build_dialectic_challenger_prompt(style_report=style_report, story_brief=story_brief, analysis_brief=analysis_brief)}",
                "\n\n".join(
                    [
                        context,
                        "Champion draft to challenge and strengthen:\n" + (body or "").strip(),
                    ]
                ).strip(),
                system_prompt=constitution,
                output_contract=_editorial_output_contract(object_type, story_brief),
                correlation_id=f"{correlation_prefix}-challenger-{uuid.uuid4()}",
                temperature=0.24,
                max_tokens=editorial_max_tokens,
                model_override=settings.llm_challenger_model,
            )
            challenger_body = _apply_voice_polish(challenger_raw_body, lane="editorial")
            if challenger_body:
                challenger_title = derive_editorial_title(None, challenger_body, object_type)
                challenger_style_report = _assess_grounded_editorial_candidate(
                    challenger_body,
                    title=challenger_title,
                    recent_coverage=recent_coverage,
                    repetition_guard=repetition_guard if isinstance(repetition_guard, dict) else None,
                    story_brief=story_brief,
                    retrieval_bundle=retrieval_bundle,
                    analysis_brief=analysis_brief,
                )
                selected_challenger = _style_rank(challenger_style_report) >= _style_rank(champion_style_report)
                dialectic_review = {
                    "attempted": True,
                    "selected": selected_challenger,
                    "model": settings.llm_challenger_model,
                    "champion_score": int(champion_style_report.get("score") or 0),
                    "challenger_score": int(challenger_style_report.get("score") or 0),
                    "champion_path": generation_path,
                    "pressure_points": list((champion_style_report.get("reasons") or [])[:4]),
                }
                if selected_challenger:
                    body = challenger_body
                    style_report = challenger_style_report
                    generation_path = "model_challenger"
            else:
                dialectic_review = {
                    "attempted": True,
                    "selected": False,
                    "model": settings.llm_challenger_model,
                    "champion_score": int(champion_style_report.get("score") or 0),
                    "challenger_score": 0,
                    "champion_path": generation_path,
                    "error": "empty_challenger_response",
                }

        if _catastrophic_editorial_underfill(style_report, story_brief):
            fallback_body_words = int(fallback_style_report.get("body_word_count") or 0)
            fallback_grounding_passes = bool((fallback_style_report.get("grounding_report") or {}).get("passes", True))
            current_body_words = int(style_report.get("body_word_count") or 0)
            if fallback_grounding_passes and fallback_body_words >= max(
                current_body_words + 120,
                int(_story_form_word_floor(story_brief) * 0.55),
            ):
                body = fallback_body
                style_report = fallback_style_report
                generation_path = "fallback_grounded"

    return {
        "body": body,
        "style_report": style_report,
        "generation_path": generation_path,
        "reroll_count": reroll_count,
        "grounded_sources": grounded_sources,
        "requires_research": requires_research,
        "fallback_body": fallback_body,
        "fallback_style_report": fallback_style_report,
        "dialectic_review": dialectic_review,
    }


async def generate_editorial_object(
    db: AsyncSession,
    *,
    object_type: str,
    theme_slug: str | None = None,
    publish_now: bool = False,
) -> EditorialObject:
    theme: Theme | None = None
    if theme_slug:
        theme = (await db.execute(select(Theme).where(Theme.slug == theme_slug))).scalar_one_or_none()

    controls = await get_runtime_controls(db)
    should_publish = bool(publish_now or controls["direct_publish"])
    attempted_publish = should_publish
    task_prompt = load_prompt(object_type) or load_prompt("theme_take")
    constitution = load_prompt("cat_editor_system")
    query_text = await _editorial_query_text(
        db,
        object_type=object_type,
        theme=theme,
        controls=controls,
    )
    recent_coverage = await _recent_editorial_coverage(db, theme_slug=theme.slug if theme else None)
    directive = controls.get("voice_blueprint") or ""
    analysis_directive = controls.get("analysis_directive") or ""
    analysis_brief = await select_analysis_brief(
        db,
        theme_slug=theme.slug if theme else None,
        query_text=query_text,
        scope_type="theme" if theme else "site",
    )
    if not analysis_brief:
        analysis_brief = await build_analysis_brief(
            db,
            scope_type="theme" if theme else "site",
            scope_key=theme.slug if theme else "sitewide",
            query_text=query_text,
            theme=theme,
        )
    retrieval_query_text = _refined_editorial_query_text(
        query_text,
        object_type=object_type,
        theme=theme,
        analysis_brief=analysis_brief,
    )
    retrieval_bundle = await _build_editorial_retrieval_bundle(
        db,
        object_type=object_type,
        theme_slug=theme_slug,
        theme=theme,
        analysis_brief=analysis_brief,
        base_query_text=retrieval_query_text,
        source_limit=6,
    )
    story_brief = _build_story_brief(
        retrieval_bundle,
        object_type=object_type,
        theme=theme,
        directive=directive,
        recent_coverage=recent_coverage,
        analysis_brief=analysis_brief,
    )
    repetition_guard = story_brief.get("repetition_guard", {}) if isinstance(story_brief, dict) else {}
    editorial_task_prompt = _build_editorial_task_prompt(task_prompt, story_brief, retrieval_bundle)
    _, voice_entries = await _voice_context_block(db, lane=f"editorial:{object_type}", limit=5)
    context = "\n\n".join(
        part
        for part in [
            _build_editorial_context_packet(
                retrieval_bundle,
                story_brief,
                analysis_brief,
                theme=theme,
                voice_entries=voice_entries,
            ),
            _build_evidence_dossier(retrieval_bundle, story_brief, analysis_brief),
        ]
        if _clean_line(part)
    )

    generation = await _run_editorial_generation_pass(
        object_type=object_type,
        story_brief=story_brief,
        retrieval_bundle=retrieval_bundle,
        analysis_brief=analysis_brief,
        recent_coverage=recent_coverage,
        repetition_guard=repetition_guard if isinstance(repetition_guard, dict) else None,
        editorial_task_prompt=editorial_task_prompt,
        context=context,
        constitution=constitution,
        correlation_prefix="editorial",
    )
    body = str(generation.get("body") or "")
    style_report = generation.get("style_report") or {}
    generation_path = str(generation.get("generation_path") or "fallback_grounded")
    reroll_count = int(generation.get("reroll_count") or 0)
    grounded_sources = int(generation.get("grounded_sources") or 0)
    requires_research = bool(generation.get("requires_research"))
    dialectic_review = generation.get("dialectic_review") or {}

    title = derive_editorial_title(None, body, object_type)
    dek = _extract_dek(body) or "Pattern-watch analysis from the Blonde Desk."
    launch_packet = _build_launch_packet(title, dek, body, story_brief)
    poster_package = _build_poster_package(title, dek, launch_packet, story_brief)
    word_count = int(style_report.get("body_word_count") or _word_count(body))
    freshness_age = ((story_brief.get("source_mix") or {}) if isinstance(story_brief.get("source_mix"), dict) else {}).get(
        "freshest_age_days"
    )
    freshness_score = 100
    if freshness_age is not None:
        freshness_score = max(18, 100 - (int(freshness_age or 0) * 14))
    publish_recommendation = _publish_recommendation(
        style_report=style_report,
        grounded_source_count=grounded_sources,
        reroll_count=reroll_count,
        needs_research=requires_research,
        generation_path=generation_path,
        freshness_age_days=int(freshness_age) if freshness_age is not None else None,
    )
    should_publish = should_publish and bool(publish_recommendation.get("recommended"))
    slug_base = slugify_loose(title)[:64]
    slug = f"{slug_base}-{datetime.utcnow().strftime('%H%M%S')}-{uuid.uuid4().hex[:8]}"
    now = datetime.utcnow()

    obj = EditorialObject(
        object_type=object_type,
        status="published" if should_publish else "draft",
        title=title,
        slug=slug,
        dek=dek,
        body_md=body,
        summary=_build_summary(body),
        voice_profile="queen-desk-v2",
        theme_id=theme.id if theme else None,
        primary_source_ids=[source["id"] for source in retrieval_bundle.get("raw_sources", [])[:6]],
        meta={
            "grounding_note": PUBLIC_GROUNDING_NOTE,
            "grounded": not requires_research,
            "needs_research": requires_research,
            "grounded_source_count": grounded_sources,
            "voice_context": voice_entries[:6],
            "direct_publish": should_publish,
            "direct_publish_requested": attempted_publish,
            "generation_path": generation_path,
            "fallback_selected": generation_path == "fallback_grounded",
            "style_gate": style_report,
            "theme_slug": theme.slug if theme else None,
            "story_brief": story_brief,
            "analysis_brief": analysis_brief,
            "recent_coverage": recent_coverage,
            "repetition_guard": repetition_guard,
            "launch_packet": launch_packet,
            "poster_package": poster_package,
            "selected_angle": story_brief.get("selected_angle"),
            "why_now": story_brief.get("why_now"),
            "story_form": story_brief.get("story_form"),
            "story_mode": story_brief.get("story_mode"),
            "word_count": word_count,
            "contradiction_map": story_brief.get("contradiction_map"),
            "headline_variants": launch_packet.get("headline_variants", []),
            "social_hooks": launch_packet.get("social_hooks", []),
            "source_mix": story_brief.get("source_mix"),
            "freshness_score": freshness_score,
            "publish_recommendation": publish_recommendation,
            "reroll_count": reroll_count,
            "grounding_report": style_report.get("grounding_report"),
            "dialectic_review": dialectic_review,
            "retrieval_bundle": retrieval_bundle,
            "prompt_layers": {
                "constitution": "cat_editor_system",
                "task": object_type if load_prompt(object_type) else "theme_take",
                "output_contract": "editorial_markdown_v3",
            },
        },
        published_at=now if should_publish else None,
        updated_at=now,
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)

    await record_revision(
        db,
        object_table="editorial_objects",
        object_id=obj.id,
        action=(
            "published_direct"
            if should_publish
            else (
                "generated_needs_research"
                if requires_research
                else ("generated_style_rejected" if attempted_publish else "generated")
            )
        ),
        snapshot={
            "object_type": object_type,
            "title": obj.title,
            "status": obj.status,
            "style_gate": style_report,
            "publish_recommendation": publish_recommendation,
            "reroll_count": reroll_count,
        },
    )
    log_event(
        logger,
        "editorial.generated",
        object_id=str(obj.id),
        object_type=object_type,
        status=obj.status,
        source_count=len(retrieval_bundle.get("raw_sources", [])),
        reroll_count=reroll_count,
        story_form=story_brief.get("story_form"),
        word_count=word_count,
    )
    if should_publish:
        await record_voice_learning_from_publication(
            db,
            lane="editorial",
            title=obj.title,
            body=obj.body_md,
            story_brief=story_brief,
            launch_packet=launch_packet,
        )
    return obj


def _editorial_rework_attempts(metadata: dict[str, object] | None) -> int:
    if not isinstance(metadata, dict):
        return 0
    rework_state = metadata.get("rework") or {}
    if not isinstance(rework_state, dict):
        return 0
    return max(0, int(rework_state.get("attempts") or 0))


def _editorial_queue_utc(value: datetime | None) -> datetime:
    if value is None:
        return datetime.min.replace(tzinfo=timezone.utc)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _editorial_rework_priority(editorial: EditorialObject) -> tuple[int, int, int, int, int, datetime]:
    metadata = editorial.meta or {}
    style_gate = metadata.get("style_gate") or {}
    publish_recommendation = metadata.get("publish_recommendation") or {}
    source_mix = metadata.get("source_mix") if isinstance(metadata.get("source_mix"), dict) else {}
    freshness_age = source_mix.get("freshest_age_days")
    freshness_score = int(metadata.get("freshness_score") or 0)
    if freshness_age is not None and not freshness_score:
        freshness_score = max(0, 100 - (int(freshness_age or 0) * 12))
    return (
        2 if editorial.object_type == "lead_story" else 1,
        1 if editorial.status == "approved" else 0,
        int(metadata.get("grounded_source_count") or 0),
        freshness_score,
        int(style_gate.get("score") or publish_recommendation.get("style_score") or 0) - (_editorial_rework_attempts(metadata) * 8),
        _editorial_queue_utc(editorial.updated_at or editorial.created_at),
    )


async def rework_editorial_object(
    db: AsyncSession,
    editorial: EditorialObject,
    *,
    max_attempts: int | None = None,
) -> dict[str, Any]:
    metadata = editorial.meta or {}
    attempts = _editorial_rework_attempts(metadata)
    attempt_cap = max(1, int(max_attempts or settings.editorial_rework_max_attempts))
    if attempts >= attempt_cap:
        return {
            "ok": False,
            "skipped": True,
            "reason": "attempt_cap_reached",
            "attempts": attempts,
            "editorial_id": str(editorial.id),
        }

    theme_slug = _clean_line(str(metadata.get("theme_slug") or ""))
    theme: Theme | None = None
    if editorial.theme_id:
        theme = (await db.execute(select(Theme).where(Theme.id == editorial.theme_id))).scalar_one_or_none()
    elif theme_slug:
        theme = (await db.execute(select(Theme).where(Theme.slug == theme_slug))).scalar_one_or_none()
    if theme and not theme_slug:
        theme_slug = theme.slug

    controls = await get_runtime_controls(db)
    query_text = (
        _clean_line(str(metadata.get("selected_angle") or ""))
        or _clean_line(editorial.title or "")
        or theme_slug
        or editorial.object_type
    )

    analysis_brief = metadata.get("analysis_brief") if isinstance(metadata.get("analysis_brief"), dict) else None
    if not analysis_brief:
        analysis_brief = await select_analysis_brief(
            db,
            theme_slug=theme_slug or None,
            query_text=query_text,
            scope_type="theme" if theme_slug else "site",
        )
        if not analysis_brief:
            analysis_brief = await build_analysis_brief(
                db,
                scope_type="theme" if theme_slug else "site",
                scope_key=theme_slug or "sitewide",
                query_text=query_text,
                theme=theme,
            )

    retrieval_bundle = metadata.get("retrieval_bundle") if isinstance(metadata.get("retrieval_bundle"), dict) else None
    if not isinstance(retrieval_bundle, dict) or not (retrieval_bundle.get("raw_sources") or []):
        retrieval_bundle = await build_retrieval_bundle(
            db,
            query_text=query_text,
            theme_slug=theme_slug or None,
            source_limit=6,
        )

    recent_coverage = metadata.get("recent_coverage") if isinstance(metadata.get("recent_coverage"), list) else None
    if not isinstance(recent_coverage, list):
        recent_coverage = await _recent_editorial_coverage(db, theme_slug=theme_slug or None)

    story_brief = metadata.get("story_brief") if isinstance(metadata.get("story_brief"), dict) else None
    if not isinstance(story_brief, dict):
        story_brief = _build_story_brief(
            retrieval_bundle,
            object_type=editorial.object_type,
            theme=theme,
            directive=str(controls.get("voice_blueprint") or ""),
            recent_coverage=recent_coverage,
            analysis_brief=analysis_brief,
        )
    repetition_guard = (
        story_brief.get("repetition_guard")
        if isinstance(story_brief.get("repetition_guard"), dict)
        else metadata.get("repetition_guard")
        if isinstance(metadata.get("repetition_guard"), dict)
        else {}
    )

    task_prompt = load_prompt(editorial.object_type) or load_prompt("theme_take")
    constitution = load_prompt("cat_editor_system")
    editorial_task_prompt = _build_editorial_task_prompt(task_prompt, story_brief, retrieval_bundle)
    _, voice_entries = await _voice_context_block(db, lane=f"editorial:{editorial.object_type}", limit=5)
    context = "\n\n".join(
        part
        for part in [
            _build_editorial_context_packet(
                retrieval_bundle,
                story_brief,
                analysis_brief,
                theme=theme,
                voice_entries=voice_entries,
            ),
            _build_evidence_dossier(retrieval_bundle, story_brief, analysis_brief),
        ]
        if _clean_line(part)
    )

    generation = await _run_editorial_generation_pass(
        object_type=editorial.object_type,
        story_brief=story_brief,
        retrieval_bundle=retrieval_bundle,
        analysis_brief=analysis_brief,
        recent_coverage=recent_coverage,
        repetition_guard=repetition_guard if isinstance(repetition_guard, dict) else None,
        editorial_task_prompt=editorial_task_prompt,
        context=context,
        constitution=constitution,
        current_body=editorial.body_md,
        current_generation_path=str(metadata.get("generation_path") or "existing_draft"),
        correlation_prefix="editorial-rework",
    )

    body = str(generation.get("body") or "")
    style_report = generation.get("style_report") or {}
    generation_path = str(generation.get("generation_path") or metadata.get("generation_path") or "existing_draft")
    reroll_count = int(generation.get("reroll_count") or 0)
    grounded_sources = int(generation.get("grounded_sources") or metadata.get("grounded_source_count") or 0)
    requires_research = bool(generation.get("requires_research"))
    dialectic_review = generation.get("dialectic_review") or {}

    title = derive_editorial_title(editorial.title, body, editorial.object_type)
    dek = _extract_dek(body) or editorial.dek or "Pattern-watch analysis from the Blonde Desk."
    launch_packet = _build_launch_packet(title, dek, body, story_brief)
    poster_package = _build_poster_package(title, dek, launch_packet, story_brief)
    word_count = int(style_report.get("body_word_count") or _word_count(body))
    freshness_age = ((story_brief.get("source_mix") or {}) if isinstance(story_brief.get("source_mix"), dict) else {}).get(
        "freshest_age_days"
    )
    freshness_score = 100
    if freshness_age is not None:
        freshness_score = max(18, 100 - (int(freshness_age or 0) * 14))
    publish_recommendation = _publish_recommendation(
        style_report=style_report,
        grounded_source_count=grounded_sources,
        reroll_count=reroll_count,
        needs_research=requires_research,
        generation_path=generation_path,
        freshness_age_days=int(freshness_age) if freshness_age is not None else None,
    )

    stale_social_ids: list[str] = []
    previous_body_fp = _text_fingerprint(editorial.body_md or "")
    next_body_fp = _text_fingerprint(body)
    if hasattr(db, "execute") and previous_body_fp and next_body_fp and previous_body_fp != next_body_fp:
        stale_social = (
            await db.execute(
                select(SocialPost).where(
                    SocialPost.editorial_object_id == editorial.id,
                    SocialPost.status.in_(["draft", "approved"]),
                )
            )
        ).scalars().all()
        stale_at = datetime.utcnow().isoformat()
        for post in stale_social:
            post.status = "stale"
            post.meta = {
                **(post.meta or {}),
                "stale_reason": "editorial_reworked",
                "stale_at": stale_at,
                "editorial_generation_path": generation_path,
            }
            stale_social_ids.append(str(post.id))

    previous_style = metadata.get("style_gate") if isinstance(metadata.get("style_gate"), dict) else {}
    now = datetime.utcnow()
    editorial.title = title
    editorial.dek = dek
    editorial.body_md = body
    editorial.summary = _build_summary(body)
    editorial.primary_source_ids = [source["id"] for source in retrieval_bundle.get("raw_sources", [])[:6]]
    editorial.updated_at = now
    editorial.status = "approved" if publish_recommendation.get("recommended") else "draft"
    editorial.meta = {
        **metadata,
        "grounding_note": PUBLIC_GROUNDING_NOTE,
        "grounded": not requires_research,
        "needs_research": requires_research,
        "grounded_source_count": grounded_sources,
        "voice_context": voice_entries[:6],
        "direct_publish": False,
        "generation_path": generation_path,
        "fallback_selected": generation_path == "fallback_grounded",
        "style_gate": style_report,
        "theme_slug": theme.slug if theme else (theme_slug or None),
        "story_brief": story_brief,
        "analysis_brief": analysis_brief,
        "recent_coverage": recent_coverage,
        "repetition_guard": repetition_guard,
        "launch_packet": launch_packet,
        "poster_package": poster_package,
        "selected_angle": story_brief.get("selected_angle"),
        "why_now": story_brief.get("why_now"),
        "story_form": story_brief.get("story_form"),
        "story_mode": story_brief.get("story_mode"),
        "word_count": word_count,
        "contradiction_map": story_brief.get("contradiction_map"),
        "headline_variants": launch_packet.get("headline_variants", []),
        "social_hooks": launch_packet.get("social_hooks", []),
        "source_mix": story_brief.get("source_mix"),
        "freshness_score": freshness_score,
        "publish_recommendation": publish_recommendation,
        "reroll_count": reroll_count,
        "grounding_report": style_report.get("grounding_report"),
        "dialectic_review": dialectic_review,
        "retrieval_bundle": retrieval_bundle,
        "rework": {
            **(metadata.get("rework") or {} if isinstance(metadata.get("rework"), dict) else {}),
            "attempts": attempts + 1,
            "max_attempts": attempt_cap,
            "last_attempt_at": now.isoformat(),
            "last_style_score": int(style_report.get("score") or 0),
            "last_reason": publish_recommendation.get("reason"),
            "last_generation_path": generation_path,
            "ready_for_publish": bool(publish_recommendation.get("recommended")),
            "stale_social_ids": stale_social_ids[:8],
        },
    }

    await db.commit()
    await db.refresh(editorial)

    await record_revision(
        db,
        object_table="editorial_objects",
        object_id=editorial.id,
        action=(
            "reworked_publish_ready"
            if publish_recommendation.get("recommended")
            else ("reworked_needs_research" if requires_research else "reworked_style_rejected")
        ),
        snapshot={
            "title": editorial.title,
            "status": editorial.status,
            "previous_style_score": int(previous_style.get("score") or 0),
            "style_gate": style_report,
            "publish_recommendation": publish_recommendation,
            "reroll_count": reroll_count,
            "attempts": attempts + 1,
            "stale_social_count": len(stale_social_ids),
        },
    )
    return {
        "ok": True,
        "skipped": False,
        "editorial_id": str(editorial.id),
        "title": editorial.title,
        "status": editorial.status,
        "style_score": int(style_report.get("score") or 0),
        "publish_recommendation": publish_recommendation,
        "rework_attempts": attempts + 1,
        "stale_social_ids": stale_social_ids,
    }


def _editorial_rework_block(metadata: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(metadata, dict):
        return {}
    rework = metadata.get("rework")
    if isinstance(rework, dict) and isinstance(rework.get("blocked"), dict):
        return rework["blocked"]
    return {}


async def _block_editorial_rework(
    db: AsyncSession,
    row: EditorialObject,
    *,
    reason: str,
    detail: str | None = None,
) -> dict[str, object]:
    now = datetime.utcnow().isoformat()
    metadata = row.meta or {}
    rework = metadata.get("rework") if isinstance(metadata.get("rework"), dict) else {}
    row.status = "rejected"
    row.meta = {
        **metadata,
        "needs_rework": False,
        "publish_recommendation": {
            **((metadata.get("publish_recommendation") or {}) if isinstance(metadata.get("publish_recommendation"), dict) else {}),
            "recommended": False,
            "reason": reason,
        },
        "rework": {
            **rework,
            "ready_for_publish": False,
            "blocked": {
                "reason": reason,
                "detail": detail,
                "blocked_at": now,
            },
        },
    }
    row.updated_at = datetime.utcnow()
    await db.commit()
    await record_revision(
        db,
        object_table="editorial_objects",
        object_id=row.id,
        action="rework_rejected",
        snapshot={
            "status": row.status,
            "title": row.title,
            "reason": reason,
            "detail": detail,
        },
    )
    return {"id": str(row.id), "reason": reason}


async def prune_editorial_backlog(db: AsyncSession, *, limit: int | None = None) -> dict[str, Any]:
    prune_limit = max(1, int(limit or settings.editorial_backlog_prune_limit))
    attempt_cap = max(1, int(settings.editorial_rework_max_attempts))
    queue_window_open = datetime.now(timezone.utc) - timedelta(hours=int(settings.backlog_publish_window_hours))
    rows = (
        await db.execute(
            select(EditorialObject)
            .where(EditorialObject.status == "draft")
            .order_by(EditorialObject.updated_at.asc(), EditorialObject.created_at.asc())
            .limit(prune_limit)
        )
    ).scalars().all()

    rejected: list[dict[str, object]] = []
    retained = 0
    for row in rows:
        metadata = row.meta or {}
        attempts = _editorial_rework_attempts(metadata)
        updated_at = _editorial_queue_utc(row.updated_at or row.created_at)
        reason = ""
        detail = ""
        if editorial_looks_placeholder(row.title, row.body_md) or contains_prompt_leak(row.title, row.body_md):
            reason = "placeholder_or_prompt_leak"
            detail = "rejected during backlog pruning"
        elif attempts >= attempt_cap:
            reason = "attempt_cap_reached"
            detail = "rejected during backlog pruning after exhausting edit attempts"
        elif updated_at < queue_window_open:
            reason = "stale_queue_window"
            detail = "rejected during backlog pruning because the draft aged out of the active publish window"

        if reason:
            rejected.append(await _block_editorial_rework(db, row, reason=reason, detail=detail))
        else:
            retained += 1

    return {
        "ok": True,
        "checked_count": len(rows),
        "rejected_count": len(rejected),
        "retained_count": retained,
        "rejected": rejected[:12],
    }


async def rework_editorial_backlog(
    db: AsyncSession,
    *,
    limit: int | None = None,
    max_attempts: int | None = None,
) -> dict[str, Any]:
    batch_limit = max(1, int(limit or settings.editorial_rework_queue_limit))
    attempt_cap = max(1, int(max_attempts or settings.editorial_rework_max_attempts))
    rows = (
        await db.execute(
            select(EditorialObject)
            .where(EditorialObject.status == "draft")
            .order_by(EditorialObject.updated_at.desc(), EditorialObject.created_at.desc())
            .limit(max(batch_limit * 8, 48))
        )
    ).scalars().all()

    queue_window_open = datetime.now(timezone.utc) - timedelta(hours=int(settings.backlog_publish_window_hours))
    candidates: list[EditorialObject] = []
    skipped: list[dict[str, object]] = []
    for row in rows:
        metadata = row.meta or {}
        style_gate = metadata.get("style_gate") or {}
        publish_recommendation = metadata.get("publish_recommendation") or {}
        attempts = _editorial_rework_attempts(metadata)
        freshness_age = ((metadata.get("source_mix") or {}) if isinstance(metadata.get("source_mix"), dict) else {}).get("freshest_age_days")
        updated_at = _editorial_queue_utc(row.updated_at or row.created_at)
        blocked = _editorial_rework_block(metadata)

        if blocked:
            skipped.append({"id": str(row.id), "reason": str(blocked.get("reason") or "rework_blocked")})
            continue
        if editorial_looks_placeholder(row.title, row.body_md) or contains_prompt_leak(row.title, row.body_md):
            skipped.append(
                await _block_editorial_rework(
                    db,
                    row,
                    reason="placeholder_or_prompt_leak",
                    detail="rejected before rework queue",
                )
            )
            continue
        if updated_at < queue_window_open:
            skipped.append(
                await _block_editorial_rework(
                    db,
                    row,
                    reason="stale_queue_window",
                    detail="rejected because the draft aged out of the active publish window",
                )
            )
            continue
        if attempts >= attempt_cap:
            skipped.append(
                await _block_editorial_rework(
                    db,
                    row,
                    reason="attempt_cap_reached",
                    detail="rejected after exhausting agentic edit attempts",
                )
            )
            continue
        if bool(metadata.get("needs_research")):
            skipped.append({"id": str(row.id), "reason": "needs_more_grounding"})
            continue
        if bool(metadata.get("fallback_selected")) or str(metadata.get("generation_path") or "") == "fallback_grounded":
            skipped.append(
                await _block_editorial_rework(
                    db,
                    row,
                    reason="fallback_generation",
                    detail="quarantined deterministic fallback output instead of retrying it indefinitely",
                )
            )
            continue
        if freshness_age is not None and int(freshness_age or 0) > int(settings.current_news_max_age_days) + 1:
            skipped.append({"id": str(row.id), "reason": "outside_current_news_window"})
            continue
        if bool(publish_recommendation.get("recommended")) and bool(style_gate.get("passes")):
            continue
        candidates.append(row)

    ordered = sorted(candidates, key=_editorial_rework_priority, reverse=True)
    reworked: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []
    ready_ids: list[str] = []
    for row in ordered[:batch_limit]:
        try:
            outcome = await rework_editorial_object(db, row, max_attempts=attempt_cap)
            reworked.append(outcome)
            publish_recommendation = outcome.get("publish_recommendation") or {}
            if bool(publish_recommendation.get("recommended")):
                ready_ids.append(str(outcome.get("editorial_id") or ""))
        except Exception as exc:
            failures.append({"id": str(row.id), "error": str(exc)})
            log_event(
                logger,
                "editorial.rework_failed",
                level=40,
                editorial_id=str(row.id),
                error=str(exc),
            )

    return {
        "ok": not failures,
        "candidate_count": len(candidates),
        "reworked_editorial_count": len(reworked),
        "reworked_editorials": reworked,
        "publish_ready_editorial_ids": [item for item in ready_ids if item],
        "failure_count": len(failures),
        "failures": failures[:6],
        "skipped": skipped[:8],
    }


HOMEPAGE_BUCKET_PRIORITY = {
    "degraded": 0,
    "fallback": 1,
    "recommended": 2,
    "published": 2,
}


def _homepage_story_fingerprint(obj: EditorialObject, title: str) -> str:
    metadata = obj.meta or {}
    launch_packet = metadata.get("launch_packet", {}) if isinstance(metadata, dict) else {}
    story_brief = metadata.get("story_brief", {}) if isinstance(metadata, dict) else {}
    candidates = [
        title,
        launch_packet.get("selected_angle") if isinstance(launch_packet, dict) else "",
        story_brief.get("selected_angle") if isinstance(story_brief, dict) else "",
        obj.slug,
    ]
    for candidate in candidates:
        fingerprint = _text_fingerprint(str(candidate or ""))
        if fingerprint and fingerprint not in {"lead story draft", "theme take draft"}:
            return fingerprint
    return str(obj.id)


def _homepage_candidate_bucket(obj: EditorialObject, title: str) -> str | None:
    metadata = obj.meta or {}
    launch_packet = metadata.get("launch_packet", {}) if isinstance(metadata, dict) else {}
    selected_angle = (
        launch_packet.get("selected_angle")
        if isinstance(launch_packet, dict)
        else metadata.get("selected_angle") if isinstance(metadata, dict) else ""
    )
    if editorial_looks_placeholder(title, obj.body_md) or contains_prompt_leak(title, obj.body_md):
        return None
    if not has_trump_focus(title, obj.body_md or "", str(selected_angle or "")):
        return "degraded"

    style_gate = metadata.get("style_gate") if isinstance(metadata.get("style_gate"), dict) else {}
    if not style_gate:
        style_gate = evaluate_style_gate(obj.body_md or "", lane="editorial")
    publish_recommendation = (
        metadata.get("publish_recommendation", {}) if isinstance(metadata.get("publish_recommendation"), dict) else {}
    )
    if obj.status == "published":
        return "published"
    if bool(publish_recommendation.get("recommended")) and bool(style_gate.get("passes")):
        return "recommended"
    if bool(style_gate.get("passes")) and int(style_gate.get("score") or 0) >= 72:
        return "fallback"
    return "degraded"


def _homepage_entry_sort_key(entry: tuple[EditorialObject, str, str]) -> tuple[int, datetime]:
    obj, _title, bucket = entry
    created_at = obj.created_at or datetime.min.replace(tzinfo=timezone.utc)
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return (HOMEPAGE_BUCKET_PRIORITY.get(bucket, 0), created_at)


async def generate_homepage_snapshot(db: AsyncSession, *, publish_now: bool = False) -> HomepageSnapshot:
    controls = await get_runtime_controls(db)
    requested_publish = bool(publish_now or controls["direct_publish"])
    drafts = (
        await db.execute(
            select(EditorialObject)
            .where(EditorialObject.status.in_(["draft", "approved", "published"]))
            .order_by(EditorialObject.created_at.desc())
            .limit(36)
        )
    ).scalars().all()

    by_signal: dict[str, tuple[EditorialObject, str, str]] = {}
    for draft in drafts:
        normalized_title = derive_editorial_title(draft.title, draft.body_md, draft.object_type)
        bucket = _homepage_candidate_bucket(draft, normalized_title)
        if not bucket:
            continue
        key = _homepage_story_fingerprint(draft, normalized_title)
        candidate = (draft, normalized_title, bucket)
        existing = by_signal.get(key)
        if not existing or _homepage_entry_sort_key(candidate) > _homepage_entry_sort_key(existing):
            by_signal[key] = candidate

    candidate_entries = sorted(by_signal.values(), key=_homepage_entry_sort_key, reverse=True)
    published_primary: list[tuple[EditorialObject, str]] = []
    recommended_primary: list[tuple[EditorialObject, str]] = []
    fallback: list[tuple[EditorialObject, str]] = []
    degraded_fallback: list[tuple[EditorialObject, str]] = []
    for draft, normalized_title, bucket in candidate_entries:
        if bucket == "published":
            published_primary.append((draft, normalized_title))
            continue
        if bucket == "recommended":
            recommended_primary.append((draft, normalized_title))
            continue
        if bucket == "fallback":
            fallback.append((draft, normalized_title))
            continue
        degraded_fallback.append((draft, normalized_title))

    top_themes = (await db.execute(select(Theme).order_by(Theme.active_score.desc()).limit(5))).scalars().all()
    recent_social = (await db.execute(select(SocialPost).order_by(SocialPost.created_at.desc()).limit(12))).scalars().all()
    recent_sources = (await db.execute(select(Source).order_by(Source.fetched_at.desc()).limit(30))).scalars().all()

    publishable = published_primary + recommended_primary
    should_publish = requested_publish and bool(publishable)
    deduped = publishable if should_publish else publishable + fallback + degraded_fallback
    lead = deduped[0] if deduped else None
    center = deduped[1:4]
    left = deduped[4:8]
    right = deduped[8:13]

    def _story_card(entry: tuple[EditorialObject, str]) -> dict[str, object]:
        obj, title = entry
        metadata = obj.meta or {}
        launch_packet = metadata.get("launch_packet", {}) if isinstance(metadata, dict) else {}
        story_brief = metadata.get("story_brief", {}) if isinstance(metadata, dict) else {}
        return {
            "title": title,
            "slug": obj.slug,
            "object_type": obj.object_type,
            "status": obj.status,
            "story_form": metadata.get("story_form") or (story_brief.get("story_form") if isinstance(story_brief, dict) else None),
            "story_mode": metadata.get("story_mode") or (story_brief.get("story_mode") if isinstance(story_brief, dict) else None),
            "theme_slug": metadata.get("theme_slug") or (story_brief.get("theme_slug") if isinstance(story_brief, dict) else None),
            "word_count": metadata.get("word_count") or _word_count(obj.body_md or ""),
            "selected_angle": launch_packet.get("selected_angle") if isinstance(launch_packet, dict) else None,
            "why_now": launch_packet.get("why_now") or metadata.get("why_now"),
            "social_hook": (launch_packet.get("social_hooks") or [None])[0] if isinstance(launch_packet, dict) else None,
            "pattern_signals": launch_packet.get("pattern_signals", [])[:3] if isinstance(launch_packet, dict) else [],
            "source_mix": metadata.get("source_mix") or (story_brief.get("source_mix") if isinstance(story_brief, dict) else None),
        }

    lead_obj = lead[0] if lead else None
    lead_title = lead[1] if lead else "No lead yet"
    lead_meta = (lead_obj.meta or {}) if lead_obj else {}
    lead_launch_packet = lead_meta.get("launch_packet", {}) if isinstance(lead_meta, dict) else {}
    lead_story_brief = lead_meta.get("story_brief", {}) if isinstance(lead_meta, dict) else {}
    queen_note = ""
    if isinstance(lead_launch_packet, dict):
        queen_note = _clean_line(
            str(
                lead_launch_packet.get("quote_card_line")
                or lead_launch_packet.get("pull_quote")
                or lead_launch_packet.get("why_now")
                or ""
            )
        )

    signal_links = _curate_source_links(
        recent_sources,
        limit=4,
        min_quality=max(float(settings.retrieval_min_quality_score), 5.8),
    )
    curated_links = _curate_source_links(
        recent_sources,
        limit=6,
        min_quality=max(float(settings.retrieval_min_quality_score), 5.0),
    )
    social_rollout = [
        {
            "variant": (post.meta or {}).get("variant"),
            "body": post.body,
            "status": post.status,
            "published_at": post.published_at.isoformat() if post.published_at else None,
        }
        for post in recent_social
        if _social_post_frontpage_ready(post)
    ]
    social_rollout = social_rollout[:4]
    if not social_rollout and isinstance(lead_launch_packet, dict):
        social_rollout = [
            {"variant": f"hook_{idx}", "body": hook, "status": "suggested", "published_at": None}
            for idx, hook in enumerate(lead_launch_packet.get("social_hooks", [])[:3], start=1)
        ]

    layout = {
        "tagline": "A running anti-Trump notebook with better taste than the men making the news.",
        "edition": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        "mission": "I read the filings, watch the spin, and keep the prettiest receipts.",
        "edition_theme": (lead_story_brief.get("focus_label") if isinstance(lead_story_brief, dict) else None)
        or (top_themes[0].name if top_themes else "What I'm watching"),
        "lead_angle": (lead_launch_packet.get("selected_angle") if isinstance(lead_launch_packet, dict) else None) or lead_title,
        "lead": {
            "title": lead_title,
            "slug": lead_obj.slug if lead_obj else None,
            "dek": lead_obj.dek if lead_obj else None,
            "status": lead_obj.status if lead_obj else "draft",
            "story_form": lead_meta.get("story_form") or (lead_story_brief.get("story_form") if isinstance(lead_story_brief, dict) else None),
            "story_mode": lead_meta.get("story_mode") or (lead_story_brief.get("story_mode") if isinstance(lead_story_brief, dict) else None),
            "theme_slug": lead_meta.get("theme_slug") or (lead_story_brief.get("theme_slug") if isinstance(lead_story_brief, dict) else None),
            "word_count": lead_meta.get("word_count") if isinstance(lead_meta, dict) else None,
            "selected_angle": lead_launch_packet.get("selected_angle") if isinstance(lead_launch_packet, dict) else None,
            "why_now": lead_launch_packet.get("why_now") if isinstance(lead_launch_packet, dict) else None,
            "pull_quote": lead_launch_packet.get("pull_quote") if isinstance(lead_launch_packet, dict) else None,
            "pattern_signals": lead_launch_packet.get("pattern_signals", [])[:3] if isinstance(lead_launch_packet, dict) else [],
            "social_hook": (lead_launch_packet.get("social_hooks") or [None])[0] if isinstance(lead_launch_packet, dict) else None,
            "source_mix": lead_meta.get("source_mix") if isinstance(lead_meta, dict) else None,
        },
        "left_column": [_story_card(entry) for entry in left],
        "center_column": [_story_card(entry) for entry in center],
        "right_column": [_story_card(entry) for entry in right],
        "runway": [_story_card(entry) for entry in deduped[1:7]],
        "watchlist": [
            {
                "slug": theme.slug,
                "name": theme.name,
                "description": theme.description,
                "active_score": float(theme.active_score or 0),
            }
            for theme in top_themes
        ],
        "process_board": [
            {"role": "Researcher", "label": "Scans the live web, ranks the signal, and leaves an opportunity board."},
            {"role": "Analyst", "label": "Turns the pile into pattern, pressure, tone lanes, and story targets."},
            {"role": "Writer", "label": "Chooses the sharpest angle and builds the publish-ready slate."},
            {"role": "Queen", "label": "Packages the drop, curates the links, and rolls the social assets out."},
        ],
        "social_rollout": social_rollout,
        "signal_links": signal_links,
        "signal_links_label": "Worth Opening",
        "queen_links": curated_links,
        "queen_label": "What I'm Keeping Open",
        "queen_note": queen_note or "If a link makes the front table, it earned the seat.",
        "publication_gate": {
            "requested_publish": requested_publish,
            "published": should_publish,
            "publishable_story_count": len(publishable),
            "held_story_count": len(fallback) + len(degraded_fallback),
            "filtered_or_duplicate_story_count": max(0, len(drafts) - len(candidate_entries)),
            "reason": "publishable_frontpage" if should_publish else "holding_for_publish_ready_story",
        },
    }

    snapshot = HomepageSnapshot(
        status="published" if should_publish else "draft",
        layout_json=layout,
        rationale="Personal front-page layout balancing the lead story, the next sharp reads, and the best current links worth carrying.",
        published_at=datetime.utcnow() if should_publish else None,
    )
    db.add(snapshot)
    await db.commit()
    await db.refresh(snapshot)

    await record_revision(
        db,
        object_table="homepage_snapshots",
        object_id=snapshot.id,
        action="published_direct" if should_publish else "generated",
        snapshot=layout,
    )
    return snapshot


async def generate_social_posts(
    db: AsyncSession,
    editorial_object: EditorialObject,
    *,
    publish_now: bool = False,
) -> list[SocialPost]:
    controls = await get_runtime_controls(db)
    should_publish = bool(publish_now or controls["direct_publish"])
    attempted_publish = should_publish
    editorial_meta = editorial_object.meta or {}
    editorial_style = editorial_meta.get("style_gate") or _assess_style_candidate(
        editorial_object.body_md or "",
        lane="editorial",
        title=editorial_object.title,
    )
    if (
        editorial_looks_placeholder(editorial_object.title, editorial_object.body_md)
        or bool(editorial_meta.get("needs_research"))
        or not bool(editorial_style.get("passes"))
    ):
        log_event(
            logger,
            "social.skipped_editorial_not_ready",
            editorial_object_id=str(editorial_object.id),
            title=editorial_object.title,
        )
        return []
    prompt = load_prompt("x_post_generation")
    constitution = load_prompt("cat_editor_system")
    retrieval_bundle = await build_retrieval_bundle(
        db,
        query_text=editorial_object.title or editorial_object.object_type,
        theme_slug=(editorial_object.meta or {}).get("theme_slug"),
        source_limit=6,
    )
    story_brief = editorial_meta.get("story_brief")
    analysis_brief = editorial_meta.get("analysis_brief")
    if not isinstance(analysis_brief, dict):
        analysis_brief = await select_analysis_brief(
            db,
            theme_slug=(editorial_object.meta or {}).get("theme_slug"),
            query_text=editorial_object.title or editorial_object.object_type,
        )
        if not analysis_brief:
            analysis_brief = await build_analysis_brief(
                db,
                scope_type="theme" if (editorial_object.meta or {}).get("theme_slug") else "site",
                scope_key=str((editorial_object.meta or {}).get("theme_slug") or "sitewide"),
                query_text=editorial_object.title or editorial_object.object_type,
            )
    if not isinstance(story_brief, dict):
        story_brief = _build_story_brief(
            retrieval_bundle,
            object_type=editorial_object.object_type,
            directive=controls.get("voice_blueprint") or "",
            analysis_brief=analysis_brief,
        )
    launch_packet = editorial_meta.get("launch_packet")
    if not isinstance(launch_packet, dict):
        launch_packet = _build_launch_packet(
            editorial_object.title or "Untitled editorial",
            editorial_object.dek or "",
            editorial_object.body_md or "",
            story_brief,
        )
    social_task_prompt = _build_social_task_prompt(prompt, launch_packet, story_brief, retrieval_bundle)
    _, voice_entries = await _voice_context_block(db, lane="social", limit=5)
    context = _build_social_context_packet(
        retrieval_bundle,
        story_brief,
        analysis_brief,
        launch_packet=launch_packet,
        title=editorial_object.title or "",
        body=editorial_object.body_md or "",
        voice_entries=voice_entries,
    )
    generated = await generate_with_cat(
        social_task_prompt,
        context,
        system_prompt=constitution,
        output_contract=_social_output_contract(),
        correlation_id=f"social-{uuid.uuid4()}",
        temperature=0.52,
        max_tokens=480,
    )
    reroll_count = 0

    short, long, thread_parts = _parse_social_variants(generated, editorial_object.title or "Untitled editorial")
    short = _limit_text(_apply_voice_polish(short, lane="social"), 260)
    long = _limit_text(_apply_voice_polish(long, lane="social"), 500)
    thread_parts = _dedupe_social_candidates(
        [_limit_text(_apply_voice_polish(part, lane="social"), 260) for part in thread_parts],
        minimum_len=28,
        limit=5,
    )
    if not thread_parts:
        thread_parts = _dedupe_social_candidates([short, long], minimum_len=28, limit=2)
    if short and long and short.lower() == long.lower():
        long = _limit_text(f"{long} Source trail matters more than spin.", 500)

    assessment = _social_package_assessment(short, long, thread_parts)
    if not assessment["publishable"]:
        reroll_count = 1
        retry_generated = await generate_with_cat(
            f"{social_task_prompt}\n\n{_social_retry_note(assessment, launch_packet)}",
            context,
            system_prompt=constitution,
            output_contract=_social_output_contract(),
            correlation_id=f"social-reroll-{uuid.uuid4()}",
            temperature=0.46,
            max_tokens=480,
        )
        retry_short, retry_long, retry_thread_parts = _parse_social_variants(
            retry_generated,
            editorial_object.title or "Untitled editorial",
        )
        retry_short = _limit_text(_apply_voice_polish(retry_short, lane="social"), 260)
        retry_long = _limit_text(_apply_voice_polish(retry_long, lane="social"), 500)
        retry_thread_parts = _dedupe_social_candidates(
            [_limit_text(_apply_voice_polish(part, lane="social"), 260) for part in retry_thread_parts],
            minimum_len=28,
            limit=5,
        )
        if not retry_thread_parts:
            retry_thread_parts = _dedupe_social_candidates([retry_short, retry_long], minimum_len=28, limit=2)
        if retry_short and retry_long and retry_short.lower() == retry_long.lower():
            retry_long = _limit_text(f"{retry_long} The receipts still outrank the spin.", 500)
        retry_assessment = _social_package_assessment(retry_short, retry_long, retry_thread_parts)
        if int(retry_assessment.get("score") or 0) >= int(assessment.get("score") or 0):
            short = retry_short
            long = retry_long
            thread_parts = retry_thread_parts
            assessment = retry_assessment

    fallback_short, fallback_long, fallback_thread_parts = _fallback_social_package(
        editorial_object,
        launch_packet,
        story_brief,
        retrieval_bundle,
    )
    fallback_short = _limit_text(_apply_voice_polish(fallback_short, lane="social"), 260)
    fallback_long = _limit_text(_apply_voice_polish(fallback_long, lane="social"), 500)
    fallback_thread_parts = _dedupe_social_candidates(
        [_limit_text(_apply_voice_polish(part, lane="social"), 260) for part in fallback_thread_parts],
        minimum_len=28,
        limit=5,
    )
    fallback_assessment = _social_package_assessment(fallback_short, fallback_long, fallback_thread_parts)
    if bool(fallback_assessment.get("publishable")) and int(fallback_assessment.get("score") or 0) >= int(assessment.get("score") or 0):
        short = fallback_short
        long = fallback_long
        thread_parts = fallback_thread_parts
        assessment = fallback_assessment

    if not assessment.get("publishable"):
        editorial_object.meta = {
            **editorial_meta,
            "social_package": {
                "dispatch": None,
                "quote_card": None,
                "thread": [],
                "reroll_count": reroll_count,
                "assessment": {
                    "score": assessment.get("score"),
                    "publishable": False,
                },
            },
        }
        await db.commit()
        log_event(
            logger,
            "social.skipped_style_rejected",
            editorial_object_id=str(editorial_object.id),
            reroll_count=reroll_count,
            assessment=assessment,
        )
        return []

    short_style = assessment["short_style"]
    long_style = assessment["long_style"]
    thread_styles = assessment["thread_styles"]
    unique_thread_count = int(assessment["unique_thread_count"])
    passing_thread_count = int(assessment.get("passing_thread_count") or 0)
    has_distinct_primary_posts = bool(assessment.get("has_distinct_primary_posts"))
    has_enough_unique_variants = bool(assessment["has_enough_unique_variants"])
    thread_publishable = bool(assessment.get("thread_publishable"))
    passing_thread_parts = [
        (piece, thread_style)
        for piece, thread_style in zip(thread_parts, thread_styles, strict=True)
        if thread_style.get("passes")
    ]
    should_publish = should_publish and bool(assessment["publishable"])
    now = datetime.utcnow() if should_publish else None
    status = "published" if should_publish else "draft"

    posts = [
        SocialPost(
            platform="x",
            status=status,
            editorial_object_id=editorial_object.id,
            body=short,
            meta={
                "variant": "x_short",
                "hook_type": "dispatch",
                "goal": "frontline_share",
                "slot": "hero_post",
                "context": "analysis",
                "voice_context": voice_entries[:5],
                "direct_publish": should_publish,
                "style_score": short_style.get("score"),
                "editorial_angle": launch_packet.get("selected_angle"),
                "publish_package_id": str(editorial_object.id),
                "style_gate": short_style,
                "retrieval_sources": retrieval_bundle.get("raw_sources", [])[:4],
            },
            published_at=now,
        ),
        SocialPost(
            platform="x",
            status=status,
            editorial_object_id=editorial_object.id,
            body=long,
            meta={
                "variant": "x_long",
                "hook_type": "quote_card",
                "goal": "quote_card_caption",
                "slot": "supporting_asset",
                "context": "analysis",
                "voice_context": voice_entries[:5],
                "direct_publish": should_publish,
                "style_score": long_style.get("score"),
                "editorial_angle": launch_packet.get("selected_angle"),
                "publish_package_id": str(editorial_object.id),
                "style_gate": long_style,
                "retrieval_sources": retrieval_bundle.get("raw_sources", [])[:4],
            },
            published_at=now,
        ),
    ]

    thread_group = f"thread-{editorial_object.id}"
    thread_slot_by_index = {
        1: ("thread_open", "hook"),
        2: ("thread_receipt", "receipt"),
        3: ("thread_receipt", "receipt"),
        4: ("thread_turn", "consequence"),
        5: ("thread_close", "closer"),
    }
    if thread_publishable:
        for idx, (piece, thread_style) in enumerate(passing_thread_parts[:5], start=1):
            hook_type, goal = thread_slot_by_index.get(idx, ("thread_step", "support"))
            posts.append(
                SocialPost(
                    platform="x",
                    status=status,
                    editorial_object_id=editorial_object.id,
                    body=piece[:260],
                    thread_group=thread_group,
                    meta={
                        "variant": f"thread_{idx}",
                        "hook_type": hook_type,
                        "goal": goal,
                        "slot": f"thread_part_{idx}",
                        "context": "analysis",
                        "voice_context": voice_entries[:5],
                        "direct_publish": should_publish,
                        "style_score": thread_style.get("score"),
                        "editorial_angle": launch_packet.get("selected_angle"),
                        "publish_package_id": str(editorial_object.id),
                        "style_gate": thread_style,
                        "retrieval_sources": retrieval_bundle.get("raw_sources", [])[:4],
                    },
                    published_at=now,
                )
            )

    editorial_object.meta = {
        **editorial_meta,
        "analysis_brief": analysis_brief,
        "social_package": {
            "dispatch": short,
            "quote_card": long,
            "thread": [piece for piece, _ in passing_thread_parts[:5]] if thread_publishable else [],
            "reroll_count": reroll_count,
            "assessment": {
                "x_short": short_style,
                "x_long": long_style,
                "threads": [thread_style for _, thread_style in passing_thread_parts[:5]] if thread_publishable else [],
                "unique_thread_count": unique_thread_count,
                "passing_thread_count": passing_thread_count,
                "has_distinct_primary_posts": has_distinct_primary_posts,
                "has_enough_unique_variants": has_enough_unique_variants,
                "thread_publishable": thread_publishable,
                "score": assessment.get("score"),
            },
        },
    }
    db.add_all(posts)
    await db.commit()
    for post in posts:
        await db.refresh(post)

    await record_revision(
        db,
        object_table="social_posts",
        object_id=posts[0].id,
        action=(
            "published_direct_from_editorial"
            if should_publish
            else ("generated_style_rejected_from_editorial" if attempted_publish else "generated_from_editorial")
        ),
        snapshot={
            "editorial_object_id": str(editorial_object.id),
            "count": len(posts),
            "style_gate": {
                "x_short": short_style,
                "x_long": long_style,
                "threads": [thread_style for _, thread_style in passing_thread_parts[:5]] if thread_publishable else [],
            },
            "variant_metrics": {
                "unique_thread_count": unique_thread_count,
                "passing_thread_count": passing_thread_count,
                "has_distinct_primary_posts": has_distinct_primary_posts,
                "has_enough_unique_variants": has_enough_unique_variants,
                "thread_publishable": thread_publishable,
            },
            "reroll_count": reroll_count,
            "package_score": assessment.get("score"),
        },
    )
    log_event(
        logger,
        "social.generated",
        editorial_object_id=str(editorial_object.id),
        post_count=len(posts),
        published=should_publish,
        reroll_count=reroll_count,
    )
    if should_publish:
        await record_voice_learning_from_publication(db, lane="social", title=editorial_object.title, body=short)
    return posts


async def generate_live_social_post(
    db: AsyncSession,
    *,
    prompt: str,
    intent: str = "response",
    platform: str = "x",
    publish_now: bool = True,
) -> SocialPost:
    controls = await get_runtime_controls(db)
    should_publish = bool(publish_now or controls["direct_publish"])
    attempted_publish = should_publish
    constitution = load_prompt("cat_editor_system")
    retrieval_bundle = await build_retrieval_bundle(db, query_text=prompt, source_limit=5)
    analysis_brief = await select_analysis_brief(db, query_text=prompt)
    if not analysis_brief:
        analysis_brief = await build_analysis_brief(
            db,
            scope_type="site",
            scope_key="sitewide",
            query_text=prompt,
        )
    story_brief = _build_story_brief(
        retrieval_bundle,
        object_type="lead_story",
        directive=str(controls.get("voice_blueprint") or controls.get("live_vibe") or ""),
        analysis_brief=analysis_brief,
    )
    _, voice_entries = await _voice_context_block(db, lane=f"live-social:{intent}", limit=6)
    live_vibe = controls.get("live_vibe") or "Quick, witty, precise, and specific."

    task_prompt = _build_social_task_prompt(
        (
            f"{load_prompt('x_post_generation')}\n\n"
        "Create exactly one post using the `x_short:` label only. "
        "Do not output thread lines in this mode."
        ),
        {"selected_angle": story_brief.get("selected_angle"), "why_now": story_brief.get("why_now")},
        story_brief,
        retrieval_bundle,
    )
    context = _build_social_context_packet(
        retrieval_bundle,
        story_brief,
        analysis_brief,
        launch_packet={"selected_angle": story_brief.get("selected_angle"), "why_now": story_brief.get("why_now")},
        title=prompt,
        voice_entries=voice_entries,
        live_vibe=f"{intent} | {live_vibe}",
    )
    generated = await generate_with_cat(
        task_prompt,
        context,
        system_prompt=constitution,
        output_contract="Output exactly one line with x_short: <post>",
        correlation_id=f"live-social-{uuid.uuid4()}",
        temperature=0.52,
        max_tokens=300,
    )
    reroll_count = 0
    primary_short, _, _ = _parse_social_variants(generated, "Live post")
    primary_short = _limit_text(_apply_voice_polish(primary_short, lane="live_social"), 260)
    primary_report = _assess_style_candidate(primary_short, lane="live_social")

    fallback_candidates = _build_live_social_fallback_candidates(prompt, intent, retrieval_bundle, story_brief)
    fallback_candidates = _dedupe_social_candidates(
        [
            _limit_text(_apply_voice_polish(candidate, lane="live_social"), 260)
            for candidate in fallback_candidates
            if candidate and not _looks_like_prompt_instruction(candidate)
        ],
        minimum_len=72,
        limit=4,
    )
    if not fallback_candidates:
        fallback_candidates = [
            _limit_text(
                f"{_political_focus_seed(retrieval_bundle, story_brief)}. {story_brief.get('why_now') or 'Fresh reporting keeps the Trump story live.'}",
                260,
            )
        ]

    short = fallback_candidates[0]
    style_report = _assess_style_candidate(short, lane="live_social")
    generation_path = "fallback_grounded"
    for candidate in fallback_candidates[1:]:
        candidate_report = _assess_style_candidate(candidate, lane="live_social")
        if _style_rank(candidate_report) > _style_rank(style_report):
            short = candidate
            style_report = candidate_report

    if _style_rank(primary_report) >= _style_rank(style_report):
        short = primary_short
        style_report = primary_report
        generation_path = "model_primary"

    if not primary_report.get("passes"):
        reroll_count = 1
        retry_generated = await generate_with_cat(
            (
                f"{task_prompt}\n\n"
                "Revision focus: sharpen political specificity, keep one crisp live dispatch, "
                "and use the freshest evidence from the story brief."
            ),
            context,
            system_prompt=constitution,
            output_contract="Output exactly one line with x_short: <post>",
            correlation_id=f"live-social-reroll-{uuid.uuid4()}",
            temperature=0.46,
            max_tokens=300,
        )
        retry_short, _, _ = _parse_social_variants(retry_generated, "Live post")
        retry_short = _limit_text(_apply_voice_polish(retry_short, lane="live_social"), 260)
        retry_report = _assess_style_candidate(retry_short, lane="live_social")
        if _style_rank(retry_report) >= _style_rank(style_report):
            short = retry_short
            style_report = retry_report
            generation_path = "model_retry"

    should_publish = should_publish and bool(style_report["passes"])

    post = SocialPost(
        platform=platform.lower().strip() or "x",
        status="published" if should_publish else "draft",
        body=short[:260],
        meta={
            "variant": f"live_{slugify_loose(intent)[:24] or 'response'}",
            "hook_type": "live_dispatch",
            "goal": intent,
            "slot": "live_response",
            "editor_prompt": prompt[:600],
            "intent": intent,
            "voice_context": voice_entries[:5],
            "context": "analysis",
            "direct_publish": should_publish,
            "style_score": style_report.get("score"),
            "editorial_angle": prompt[:160],
            "generation_path": generation_path,
            "reroll_count": reroll_count,
            "story_brief": story_brief,
            "analysis_brief": analysis_brief,
            "style_gate": style_report,
            "retrieval_sources": retrieval_bundle.get("raw_sources", [])[:4],
        },
        published_at=datetime.utcnow() if should_publish else None,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)

    await record_revision(
        db,
        object_table="social_posts",
        object_id=post.id,
        action="published_live" if should_publish else ("generated_live_style_rejected" if attempted_publish else "generated_live"),
        snapshot={
            "intent": intent,
            "status": post.status,
            "style_gate": style_report,
            "generation_path": generation_path,
            "reroll_count": reroll_count,
        },
    )
    if should_publish:
        await record_voice_learning_from_publication(db, lane="social", title=intent, body=post.body)
    log_event(logger, "social.live_generated", post_id=str(post.id), status=post.status, intent=intent)
    return post


async def update_voice_memory(
    db: AsyncSession,
    *,
    memory_type: str,
    key: str,
    value: str,
    weight: float = 1.0,
) -> VoiceMemory:
    existing = (
        await db.execute(select(VoiceMemory).where(VoiceMemory.memory_type == memory_type, VoiceMemory.key == key))
    ).scalar_one_or_none()

    if existing:
        existing.value = value
        existing.weight = weight
        existing.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(existing)
        log_event(
            logger,
            "voice_memory.updated",
            memory_type=memory_type,
            key=key,
            weight=weight,
        )
        return existing

    memory = VoiceMemory(memory_type=memory_type, key=key, value=value, weight=weight)
    db.add(memory)
    await db.commit()
    await db.refresh(memory)
    log_event(logger, "voice_memory.created", memory_type=memory_type, key=key, weight=weight)
    return memory
