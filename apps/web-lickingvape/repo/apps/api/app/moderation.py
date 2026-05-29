import json
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

SELF_HARM_PHRASES = [
    "kill myself",
    "suicide",
    "end my life",
    "self harm",
    "cut myself",
    "hurt myself",
]

EXPLICIT_SEXUAL = [
    "hardcore",
    "porn",
    "explicit sex",
    "cum",
    "blowjob",
    "anal sex",
]

HATE_TERMS = [
    "kill all",
    "exterminate",
    "racial slur",
]

MEDICAL_CLAIMS = [
    "diagnose",
    "prescribe",
    "cure",
    "medical advice",
]

PROFANITY = [
    "fuck",
    "shit",
    "bitch",
    "asshole",
]

PHONE_PATTERN = re.compile(r"\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b")
EMAIL_PATTERN = re.compile(r"\b[\w\.-]+@[\w\.-]+\.[a-zA-Z]{2,}\b")
ADDRESS_PATTERN = re.compile(r"\b\d{1,5}\s+\w+\s+(?:st|street|ave|avenue|rd|road|blvd|lane|ln)\b", re.I)


@dataclass
class PolicyDecision:
    decision: str
    reasons: List[str]
    flagged: bool = False


def _contains_any(text: str, phrases: List[str]) -> bool:
    lowered = text.lower()
    return any(phrase in lowered for phrase in phrases)


def policy_check(text: str, allow_profanity: bool = True) -> PolicyDecision:
    reasons: List[str] = []

    if PHONE_PATTERN.search(text) or EMAIL_PATTERN.search(text) or ADDRESS_PATTERN.search(text):
        reasons.append("Possible PII or doxxing detected.")

    if _contains_any(text, SELF_HARM_PHRASES):
        reasons.append("Self-harm ideation or intent.")
        return PolicyDecision(decision="flagged", reasons=reasons, flagged=True)

    if _contains_any(text, EXPLICIT_SEXUAL):
        reasons.append("Explicit sexual content.")

    if _contains_any(text, HATE_TERMS):
        reasons.append("Hate or harassment.")

    if _contains_any(text, MEDICAL_CLAIMS):
        reasons.append("Medical claims presented as professional advice.")

    if not allow_profanity and _contains_any(text, PROFANITY):
        reasons.append("Profanity is not allowed.")

    if reasons:
        return PolicyDecision(decision="reject", reasons=reasons)

    return PolicyDecision(decision="approve", reasons=[])


def parse_review_payload(payload: Any) -> Dict[str, Any]:
    """Normalize review payloads from the LLM sidecar or other sources."""
    if payload is None:
        return {"decision": "reject", "reasons": ["Empty review payload."], "cleaned_body": None, "tags": []}

    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            return {"decision": "reject", "reasons": ["Invalid JSON from reviewer."], "cleaned_body": None, "tags": []}

    decision = str(payload.get("decision", "reject")).lower()
    if decision not in {"approve", "reject", "flagged"}:
        decision = "reject"

    reasons = payload.get("reasons") or []
    if isinstance(reasons, str):
        reasons = [reasons]
    if not isinstance(reasons, list):
        reasons = ["Reviewer provided invalid reasons."]

    cleaned_body = payload.get("cleaned_body")
    tags = payload.get("tags") or []
    if isinstance(tags, str):
        tags = [tag.strip() for tag in tags.split(",") if tag.strip()]
    if not isinstance(tags, list):
        tags = []

    suggested_title = payload.get("suggested_title")

    return {
        "decision": decision,
        "reasons": reasons,
        "cleaned_body": cleaned_body,
        "tags": tags,
        "suggested_title": suggested_title,
    }
