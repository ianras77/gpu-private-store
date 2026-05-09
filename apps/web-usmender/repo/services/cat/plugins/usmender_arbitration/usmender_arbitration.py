from __future__ import annotations

import json
from typing import List, Optional

from pydantic import BaseModel
from cat.mad_hatter.decorators import endpoint
from cat.auth.permissions import AuthResource, AuthPermission, check_permissions

STYLE_GUIDE = """
Tone rules:
- calm, neutral, consent-first
- no blame or diagnosis
- short, readable sentences
- never reveal raw private messages
""".strip()

MEDIATION_PRINCIPLES = """
Mediation principles:
- protect self-determination and voluntary choice
- stay impartial and reflect both sides evenly
- focus on interests and needs, not blame or positions
- offer options and objective criteria when drafting plans
- avoid legal, medical, or financial advice
""".strip()


class SafetyFlag(BaseModel):
    flagged: bool
    reason: Optional[str] = None


def detect_safety_flag(text: str) -> SafetyFlag:
    lowered = text.lower()
    phrases = [
        "i will hurt",
        "i want to hurt",
        "i am going to hurt",
        "they will hurt me",
        "they are going to hurt me",
        "im not safe",
        "i'm not safe",
        "kill myself",
        "end my life",
        "suicide",
        "stalk",
        "stalking",
        "harass",
        "harassment",
        "coercion",
        "coercive",
        "control me",
        "violence",
        "threat",
        "threaten",
    ]
    for phrase in phrases:
        if phrase in lowered:
            return SafetyFlag(flagged=True, reason=f"Matched phrase: {phrase}")
    return SafetyFlag(flagged=False)


def extract_json(text: str) -> Optional[dict]:
    try:
        start = text.index("{")
        end = text.rindex("}") + 1
        return json.loads(text[start:end])
    except Exception:
        return None


def llm_json(cat, prompt: str, fallback: dict) -> dict:
    if cat is None:
        return fallback
    try:
        raw = cat.llm(prompt)
        parsed = extract_json(raw)
        return parsed if isinstance(parsed, dict) else fallback
    except Exception:
        return fallback


class DraftInviteInput(BaseModel):
    initiatorNeedRaw: str
    relationshipType: str
    desiredOutcome: Optional[str] = None
    boundaries: Optional[List[str]] = None


class DraftInviteOutput(BaseModel):
    inviteMessageNeutral: str
    issueSummaryNeutral: str
    subjectLine: str
    safetyFlag: SafetyFlag


class RephrasePerspectiveInput(BaseModel):
    rawText: str
    who: str
    sessionTopic: str
    relationshipType: Optional[str] = None
    boundaries: Optional[List[str]] = None


class RephrasePerspectiveOutput(BaseModel):
    neutralSummary: str
    safetyFlag: SafetyFlag


@endpoint.post("/usmender/rephrase_perspective")
def rephrase_perspective(
    data: RephrasePerspectiveInput,
    cat=check_permissions(AuthResource.CONVERSATION, AuthPermission.WRITE),
) -> RephrasePerspectiveOutput:

    safety = detect_safety_flag(data.rawText)
    if safety.flagged:
        return RephrasePerspectiveOutput(
            neutralSummary="We are pausing this request to prioritize safety.",
            safetyFlag=safety,
        )

    fallback = {
        "neutralSummary": f"A perspective was shared about {data.sessionTopic}."
    }

    prompt = f"""
{STYLE_GUIDE}
{MEDIATION_PRINCIPLES}

Rewrite the user's message into a neutral, respectful summary in 1-2 sentences.
Focus on needs and requests, avoid blame, and keep it safe to share.
Return JSON with key:
- neutralSummary

Input:
- rawText: {data.rawText}
- who: {data.who}
- sessionTopic: {data.sessionTopic}
- relationshipType: {data.relationshipType}
- boundaries: {data.boundaries}
""".strip()

    generated = llm_json(cat, prompt, fallback)

    return RephrasePerspectiveOutput(
        neutralSummary=generated["neutralSummary"],
        safetyFlag=safety,
    )


@endpoint.post("/usmender/draft_invite")
def draft_invite(
    data: DraftInviteInput,
    cat=check_permissions(AuthResource.CONVERSATION, AuthPermission.WRITE),
) -> DraftInviteOutput:

    safety = detect_safety_flag(data.initiatorNeedRaw)
    if safety.flagged:
        return DraftInviteOutput(
            inviteMessageNeutral="We are pausing this request to prioritize safety.",
            issueSummaryNeutral="Safety review required before continuing.",
            subjectLine="Safety check",
            safetyFlag=safety,
        )

    fallback = {
        "inviteMessageNeutral": (
            "Hi there. I would like to have a calm, mediated conversation to work "
            "through something important to me. If you are open to it, we can take "
            "this one step at a time."
        ),
        "issueSummaryNeutral": (
            "A request to discuss a "
            f"{data.relationshipType} concern with a neutral mediator."
        ),
        "subjectLine": "A gentle request to talk",
    }

    prompt = f"""
{STYLE_GUIDE}
{MEDIATION_PRINCIPLES}

Draft a neutral invite message for the invitee. Return JSON with keys:
- inviteMessageNeutral
- issueSummaryNeutral
- subjectLine

Input:
- initiatorNeedRaw: {data.initiatorNeedRaw}
- relationshipType: {data.relationshipType}
- desiredOutcome: {data.desiredOutcome}
- boundaries: {data.boundaries}
""".strip()

    generated = llm_json(cat, prompt, fallback)

    return DraftInviteOutput(
        inviteMessageNeutral=generated["inviteMessageNeutral"],
        issueSummaryNeutral=generated["issueSummaryNeutral"],
        subjectLine=generated["subjectLine"],
        safetyFlag=safety,
    )


class IntakeQuestionInput(BaseModel):
    sessionSummary: str
    who: str
    lastUserMessage: str


class IntakeQuestionOutput(BaseModel):
    question: str
    whyThisQuestion: Optional[str] = None
    safetyFlag: SafetyFlag


@endpoint.post("/usmender/intake_question")
def intake_question(
    data: IntakeQuestionInput,
    cat=check_permissions(AuthResource.CONVERSATION, AuthPermission.WRITE),
) -> IntakeQuestionOutput:

    safety = detect_safety_flag(data.lastUserMessage)
    if safety.flagged:
        return IntakeQuestionOutput(
            question="We are pausing to prioritize safety. Would you like support resources?",
            whyThisQuestion="Safety escalation",
            safetyFlag=safety,
        )

    fallback = {
        "question": "What is one change that would make this feel fairer for you?",
        "whyThisQuestion": "Clarify a concrete need"
    }

    prompt = f"""
{STYLE_GUIDE}
{MEDIATION_PRINCIPLES}

Ask one concise intake question. Return JSON with keys:
- question
- whyThisQuestion

Input:
- sessionSummary: {data.sessionSummary}
- who: {data.who}
- lastUserMessage: {data.lastUserMessage}
""".strip()

    generated = llm_json(cat, prompt, fallback)

    return IntakeQuestionOutput(
        question=generated["question"],
        whyThisQuestion=generated.get("whyThisQuestion"),
        safetyFlag=safety,
    )


class MediateTurnInput(BaseModel):
    rawText: str
    who: str
    sessionTopic: str
    relationshipType: Optional[str] = None
    sessionStatus: str
    latestOtherSummary: Optional[str] = None
    latestMediatorPrompt: Optional[str] = None
    recentSharedMessages: Optional[List[str]] = None
    proposalTitle: Optional[str] = None
    proposalBullets: Optional[List[str]] = None


class MediateTurnOutput(BaseModel):
    neutralSummary: str
    recipientView: str
    coachNote: str
    followUpQuestion: Optional[str] = None
    safetyFlag: SafetyFlag


def _fallback_follow_up_question(status: str, latest_other_summary: Optional[str]) -> str:
    if status in {"PROPOSAL_V1", "VOTING_V1", "REFINEMENT", "PROPOSAL_V2", "VOTING_V2"}:
        return "What would make the current plan feel more workable or fair to you?"
    if latest_other_summary:
        return "What feels most important for the other person to understand before the plan is drafted?"
    return "What is one change that would make this feel fairer for you?"


@endpoint.post("/usmender/mediate_turn")
def mediate_turn(
    data: MediateTurnInput,
    cat=check_permissions(AuthResource.CONVERSATION, AuthPermission.WRITE),
) -> MediateTurnOutput:

    safety = detect_safety_flag(
        " ".join(
            [
                data.rawText,
                data.latestOtherSummary or "",
                data.latestMediatorPrompt or "",
                " ".join(data.recentSharedMessages or []),
            ]
        )
    )
    if safety.flagged:
        return MediateTurnOutput(
            neutralSummary="We are pausing this request to prioritize safety.",
            recipientView="The mediator is not forwarding this draft yet.",
            coachNote="Remove threats, coercion, or demeaning language before trying again.",
            followUpQuestion="What would help you express this more safely and specifically?",
            safetyFlag=safety,
        )

    fallback = {
        "neutralSummary": f"A perspective was shared about {data.sessionTopic}.",
        "recipientView": (
            "The other person will receive a calmer summary focused on impact, needs, and next steps."
        ),
        "coachNote": (
            "Lead with impact, keep it specific, and end with one doable next step."
        ),
        "followUpQuestion": _fallback_follow_up_question(
            data.sessionStatus, data.latestOtherSummary
        ),
    }

    prompt = f"""
{STYLE_GUIDE}
{MEDIATION_PRINCIPLES}

You are helping mediate an in-app conversation.
Rewrite the user's draft into a neutral, respectful summary and guide the next turn.
Return JSON with keys:
- neutralSummary
- recipientView
- coachNote
- followUpQuestion

Rules:
- neutralSummary should be 1-2 short sentences and safe to share directly
- recipientView should explain how the message will likely land
- coachNote should help the sender improve the next turn
- followUpQuestion should keep the room moving toward understanding or a workable plan
- if the room is in a proposal or voting stage, anchor guidance in what feels workable, fair, or needs revision
- never reveal hidden private information from the other side

Input:
- rawText: {data.rawText}
- who: {data.who}
- sessionTopic: {data.sessionTopic}
- relationshipType: {data.relationshipType}
- sessionStatus: {data.sessionStatus}
- latestOtherSummary: {data.latestOtherSummary}
- latestMediatorPrompt: {data.latestMediatorPrompt}
- recentSharedMessages: {data.recentSharedMessages}
- proposalTitle: {data.proposalTitle}
- proposalBullets: {data.proposalBullets}
""".strip()

    generated = llm_json(cat, prompt, fallback)

    return MediateTurnOutput(
        neutralSummary=generated.get("neutralSummary", fallback["neutralSummary"]),
        recipientView=generated.get("recipientView", fallback["recipientView"]),
        coachNote=generated.get("coachNote", fallback["coachNote"]),
        followUpQuestion=generated.get(
            "followUpQuestion", fallback["followUpQuestion"]
        ),
        safetyFlag=safety,
    )


class ProposalV1Input(BaseModel):
    neutralSummaryOfInitiator: str
    neutralSummaryOfInvitee: str
    constraints: Optional[List[str]] = None


class ProposalOutput(BaseModel):
    title: str
    bullets: List[str]
    acceptanceCriteria: List[str]


class ProposalV1Output(BaseModel):
    proposal: ProposalOutput
    toneNote: Optional[str] = None
    safetyFlag: SafetyFlag


@endpoint.post("/usmender/propose_resolution_v1")
def propose_resolution_v1(
    data: ProposalV1Input,
    cat=check_permissions(AuthResource.CONVERSATION, AuthPermission.WRITE),
) -> ProposalV1Output:

    safety = detect_safety_flag(
        f"{data.neutralSummaryOfInitiator} {data.neutralSummaryOfInvitee}"
    )
    if safety.flagged:
        return ProposalV1Output(
            proposal=ProposalOutput(
                title="Safety pause",
                bullets=["This session needs a safety review before continuing."],
                acceptanceCriteria=["Safety review completed"],
            ),
            toneNote="Safety escalation",
            safetyFlag=safety,
        )

    fallback = {
        "proposal": {
            "title": "A steady way forward",
            "bullets": [
                "Agree on one shared expectation for the next two weeks.",
                "Name a check-in time that works for both people.",
                "List one concrete request from each side."
            ],
            "acceptanceCriteria": [
                "Both people can restate the plan in their own words.",
                "Both agree the plan feels respectful and realistic."
            ]
        },
        "toneNote": "Keep the language soft and practical."
    }

    prompt = f"""
{STYLE_GUIDE}
{MEDIATION_PRINCIPLES}

Draft a mediation proposal. Return JSON with keys:
- proposal: {{ title, bullets, acceptanceCriteria }}
- toneNote

Rules:
- title should be short, practical, and non-blaming
- bullets should be 3-5 concrete next steps both people can understand
- acceptanceCriteria should be 2-4 observable signs the plan is working
- prefer time-bounded, low-drama actions over abstract advice
- use the constraints if they are provided
- do not frame either person as the problem to fix

Input:
- neutralSummaryOfInitiator: {data.neutralSummaryOfInitiator}
- neutralSummaryOfInvitee: {data.neutralSummaryOfInvitee}
- constraints: {data.constraints}
""".strip()

    generated = llm_json(cat, prompt, fallback)

    proposal = generated.get("proposal", fallback["proposal"])

    return ProposalV1Output(
        proposal=ProposalOutput(
            title=proposal["title"],
            bullets=proposal["bullets"],
            acceptanceCriteria=proposal["acceptanceCriteria"],
        ),
        toneNote=generated.get("toneNote"),
        safetyFlag=safety,
    )


class VoteInput(BaseModel):
    userId: str
    value: str
    comment: Optional[str] = None


class ProposalV2Input(BaseModel):
    proposalV1: ProposalOutput
    votes: List[VoteInput]


class ProposalV2Output(BaseModel):
    proposal: ProposalOutput
    changeLog: List[str]
    safetyFlag: SafetyFlag


@endpoint.post("/usmender/refine_resolution_v2")
def refine_resolution_v2(
    data: ProposalV2Input,
    cat=check_permissions(AuthResource.CONVERSATION, AuthPermission.WRITE),
) -> ProposalV2Output:

    combined = " ".join([vote.comment or "" for vote in data.votes])
    safety = detect_safety_flag(combined)
    if safety.flagged:
        return ProposalV2Output(
            proposal=data.proposalV1,
            changeLog=["Safety review required before changes."],
            safetyFlag=safety,
        )

    feedback_summary = " ".join(
        [vote.comment for vote in data.votes if vote.comment]
    ) or "General concerns about feasibility and clarity."

    fallback = {
        "proposal": {
            "title": data.proposalV1.title,
            "bullets": data.proposalV1.bullets + [
                "Add a short reset ritual if tensions rise."
            ],
            "acceptanceCriteria": data.proposalV1.acceptanceCriteria + [
                "Both agree the timeline feels workable."
            ]
        },
        "changeLog": ["Incorporated feedback: " + feedback_summary]
    }

    prompt = f"""
{STYLE_GUIDE}
{MEDIATION_PRINCIPLES}

Refine the proposal based on votes. Return JSON with keys:
- proposal: {{ title, bullets, acceptanceCriteria }}
- changeLog

Rules:
- preserve workable parts of proposalV1 unless the votes clearly reject them
- address the strongest concerns raised in vote comments
- keep the plan concrete, fair, and realistic to test in the next 1-2 weeks
- changeLog should be 1-4 short items describing what changed
- do not add blame, therapy language, or legal guidance

Input:
- proposalV1: {data.proposalV1.model_dump_json()}
- votes: {[vote.model_dump() for vote in data.votes]}
""".strip()

    generated = llm_json(cat, prompt, fallback)
    proposal = generated.get("proposal", fallback["proposal"])

    return ProposalV2Output(
        proposal=ProposalOutput(
            title=proposal["title"],
            bullets=proposal["bullets"],
            acceptanceCriteria=proposal["acceptanceCriteria"],
        ),
        changeLog=generated.get("changeLog", fallback["changeLog"]),
        safetyFlag=safety,
    )


class CloseoutInput(BaseModel):
    sessionSummary: str
    blockers: List[str]


class CloseoutOutput(BaseModel):
    closureMessage: str
    nextSteps: List[str]
    suggestedFollowUpWindowDays: int
    safetyFlag: SafetyFlag


@endpoint.post("/usmender/closeout_guidance")
def closeout_guidance(
    data: CloseoutInput,
    cat=check_permissions(AuthResource.CONVERSATION, AuthPermission.WRITE),
) -> CloseoutOutput:

    safety = detect_safety_flag(data.sessionSummary)
    if safety.flagged:
        return CloseoutOutput(
            closureMessage="We are pausing to prioritize safety.",
            nextSteps=["Consider reaching out for immediate support."],
            suggestedFollowUpWindowDays=0,
            safetyFlag=safety,
        )

    fallback = {
        "closureMessage": "It is okay to pause. You both showed up with care.",
        "nextSteps": [
            "Take 24 hours before revisiting this topic.",
            "If you want, schedule another mediated session."
        ],
        "suggestedFollowUpWindowDays": 7
    }

    prompt = f"""
{STYLE_GUIDE}
{MEDIATION_PRINCIPLES}

Write a gentle closeout message. Return JSON with keys:
- closureMessage
- nextSteps
- suggestedFollowUpWindowDays

Rules:
- closureMessage should be 1-2 short calming sentences
- nextSteps should be 2-3 concrete, low-pressure actions
- suggestedFollowUpWindowDays should be a realistic whole number between 1 and 14
- if blockers remain unresolved, favor a pause plus a clear return window

Input:
- sessionSummary: {data.sessionSummary}
- blockers: {data.blockers}
""".strip()

    generated = llm_json(cat, prompt, fallback)

    return CloseoutOutput(
        closureMessage=generated["closureMessage"],
        nextSteps=generated["nextSteps"],
        suggestedFollowUpWindowDays=int(generated["suggestedFollowUpWindowDays"]),
        safetyFlag=safety,
    )
