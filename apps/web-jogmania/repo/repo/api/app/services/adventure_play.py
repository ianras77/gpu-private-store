from __future__ import annotations

import statistics
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import (
    AdventureSession,
    Route,
    RouteInstance,
    RunnerProfile,
    Workout,
)
from app.schemas import CartridgeEvent, CartridgeOut, RunnerPreferences
from app.services.worlds import parties_for_runner

CHAPTER_STORIES = [
    {
        "name": "The Lost Arcade", "title": "Relight the Lost Arcade",
        "opening": "The arcade is dark, the token tin is empty, and a lantern mouse has put on a tiny hard hat. Let's fix that.",
        "finish": "Every light is on. A pinball machine wakes up and asks if you know any good jokes.",
        "recap": "The arcade lights are back!", "hook": "Something in the prize counter is rattling again.",
        "events": [
            ("discovery", "The grass-covered marquee", "A lost marquee blinks ARCADE through the weeds. One bulb at a time!", "marquee", "tap"),
            ("collectible", "Token from the tin", "A brass token rolls out of the prize tin and lands right-side up.", "token", "success"),
            ("companion", "Mouse on the marquee", "A lantern mouse joins the crew. Tiny hard hat: slightly too large.", "mouse", "tap"),
            ("finish", "One more light!", "The whole marquee bursts into color. The arcade is open again!", "arcade", "celebration"),
        ],
    },
    {
        "name": "Moonlight Midway", "title": "Wake the Moonlight Midway",
        "opening": "The midway is all quiet rides and sleepy bulbs. A moon rabbit has the switchboard upside down.",
        "finish": "The carousel turns beneath a paper moon, and every ride gives one polite little ding.",
        "recap": "The midway is twinkling again!", "hook": "A ferris-wheel gondola has a very mysterious snack in it.",
        "events": [
            ("discovery", "The moonlit ticket booth", "A silver ticket flutters from a booth that has been closed since the moon was new.", "ticket", "tap"),
            ("collectible", "Comet cotton candy", "A tiny swirl of comet cotton candy appears. It tastes like blue raspberry and starlight.", "candy", "success"),
            ("companion", "Moon rabbit conductor", "A moon rabbit joins the crew and insists the carousel needs a conductor.", "rabbit", "tap"),
            ("finish", "Carousel of stars", "The carousel spins once. The painted horses wink as the midway lights come on.", "carousel", "celebration"),
        ],
    },
    {
        "name": "The Starry Boardwalk", "title": "Find the Starry Boardwalk",
        "opening": "The boardwalk has misplaced its stars. A pelican in a bow tie says he knows a shortcut. He does not.",
        "finish": "The pier lamps glow across the water, and the night sky puts the stars back where they belong.",
        "recap": "The boardwalk found its sparkle!", "hook": "The bow-tied pelican has saved you a seat at the tiny seaside cinema.",
        "events": [
            ("discovery", "A star in the planks", "A little star shines between two boards. It points toward the old pier.", "star", "tap"),
            ("collectible", "Pocket lighthouse lens", "A smooth glass lens catches a star and keeps it safe in your pocket.", "lens", "success"),
            ("companion", "The bow-tied pelican", "The pelican waddles along as lookout. His bow tie is now slightly crooked.", "pelican", "tap"),
            ("finish", "Pier lights awake", "The lamps light up from shore to sea. Somewhere, a tiny cinema starts its opening music.", "pier", "celebration"),
        ],
    },
    {
        "name": "Sunrise Pier", "title": "Bring Back Sunrise Pier",
        "opening": "Sunrise Pier is still wearing its nightcap. The gulls are taking turns pretending to be the lighthouse.",
        "finish": "The lighthouse sends a peach-colored wink over the water. The whole pier answers with a brass-band fanfare.",
        "recap": "Sunrise has clocked in!", "hook": "Someone left a tiny trumpet in the lighthouse keeper's mailbox.",
        "events": [
            ("discovery", "The sleepy signal lamp", "The signal lamp yawns, then flashes a peachy hello over the water.", "lamp", "tap"),
            ("collectible", "Sunrise shell", "A little shell holds the color of the very first sunrise. It hums when you shake it.", "shell", "success"),
            ("companion", "Gull with a clipboard", "A gull joins the crew as official sunrise inspector. He has no credentials.", "gull", "tap"),
            ("finish", "The pier's first fanfare", "The lighthouse shines. Every gull salutes, mostly by accident.", "sunrise", "celebration"),
        ],
    },
    {
        "name": "Cloudtop Carnival", "title": "Float the Cloudtop Carnival",
        "opening": "The carnival has floated into a cloudbank. A ticket-taker in rain boots is trying to tickle it free.",
        "finish": "The big top pops above the clouds. The midway is open, and the popcorn is gloriously weightless.",
        "recap": "The carnival has cleared the clouds!", "hook": "A cloud shaped exactly like a carousel horse is following the carnival home.",
        "events": [
            ("discovery", "Cloudbank ticket window", "A ticket window opens in the cloud. The ticket is somehow dry.", "ticket", "tap"),
            ("collectible", "Bottled puff of cloud", "You catch a giggling cloud puff in a jar. It fogs up into a smile.", "cloud", "success"),
            ("companion", "The popcorn kite", "A popcorn kite joins the parade. It has never once been eaten.", "kite", "tap"),
            ("finish", "Big top above the clouds", "The striped big top rises into view and the carnival band plays a very short fanfare.", "big-top", "celebration"),
        ],
    },
    {
        "name": "Jellybean Junction", "title": "Unstick Jellybean Junction",
        "opening": "A gumdrop train is stuck at the junction. The stationmaster says the tracks are sticky, but in a fun way.",
        "finish": "The gumdrop train gives a cheerful toot and rolls through the candy-colored station.",
        "recap": "Jellybean Junction is back on track!", "hook": "The stationmaster has been saving a seat for the world's smallest conductor.",
        "events": [
            ("discovery", "The jellybean timetable", "The timetable lists every stop as 'somewhere delicious'. Not very helpful.", "timetable", "tap"),
            ("collectible", "The runaway jellybean", "A runaway jellybean bounces into your hand. It is the exact color of Tuesday.", "jellybean", "success"),
            ("companion", "Conductor Button", "A little button with a whistle joins the crew. The whistle is bigger than the button.", "button", "tap"),
            ("finish", "All aboard, sort of", "The gumdrop train rolls again. The stationmaster waves with both hands and one elbow.", "train", "celebration"),
        ],
    },
    {
        "name": "Lunar Lanes", "title": "Open the Lunar Lanes",
        "opening": "The moon's bowling alley is closed for cosmic polishing. A star pin has escaped into the crater garden.",
        "finish": "The cosmic pins stand tall, then topple in a slow-motion strike. The moon cheers quietly.",
        "recap": "The moon got a perfect cosmic strike!", "hook": "The escaped star pin says it knows a shortcut to Saturn.",
        "events": [
            ("discovery", "Crater-side scorecard", "A scorecard drifts across the lunar lanes. Someone bowled a constellation.", "scorecard", "tap"),
            ("collectible", "Pocket moon dust", "A glittering pinch of moon dust sticks to your ticket. It refuses to be brushed off.", "moondust", "success"),
            ("companion", "The runaway star pin", "The missing star pin rolls alongside you. It is very proud of its tiny wheels.", "star-pin", "tap"),
            ("finish", "Cosmic strike!", "All ten cosmic pins topple together. The moon gives a soft, crater-rattling cheer.", "strike", "celebration"),
        ],
    },
    {
        "name": "Twinkle Town", "title": "Light Up Twinkle Town",
        "opening": "Twinkle Town's windows have gone dim. A tiny mayor is organizing the fireflies into a marching band.",
        "finish": "Every window glows. The firefly band plays three notes and takes a well-earned snack break.",
        "recap": "Twinkle Town is glowing again!", "hook": "The tiny mayor has sent an invitation with a very tiny envelope.",
        "events": [
            ("discovery", "The window with a wink", "One dark window winks at you. A little constellation is hiding behind the curtains.", "window", "tap"),
            ("collectible", "Firefly lantern", "A firefly lends you its glow for a moment. It smells faintly of lemonade.", "firefly", "success"),
            ("companion", "The tiny town mayor", "The mayor joins the parade. The sash says 'Mayor' in very careful glitter glue.", "mayor", "tap"),
            ("finish", "A town-sized twinkle", "The whole town lights up. The firefly band plays its three notes with great confidence.", "town", "celebration"),
        ],
    },
]


def _chapter_story(chapter: str | None) -> dict[str, Any]:
    normalized = (chapter or "").casefold()
    return next(
        (story for story in CHAPTER_STORIES if normalized.startswith(story["name"].casefold())),
        CHAPTER_STORIES[0],
    )


def _chapter_events(chapter: str | None, distance_m: float) -> list[dict[str, Any]]:
    story = _chapter_story(chapter)
    event_ids = ("marquee", "prize-counter", "lantern-crew", "arcade-lights")
    fractions = (0.14, 0.4, 0.7, 1.0)
    return [
        {
            "id": event_ids[index],
            "kind": seed[0],
            "title": seed[1],
            "message": seed[2],
            "visual_key": seed[3],
            "haptic": seed[4],
            "trigger_kind": "distance",
            "trigger_value": max(1, round(distance_m * fractions[index])),
        }
        for index, seed in enumerate(story["events"])
    ]
INTENT_LABELS = {
    "easy": "gentle wander",
    "steady": "steady outing",
    "explore": "new-path adventure",
    "repeat": "familiar-course visit",
    "surprise": "surprise adventure",
}

BLOCKED_PROMPTS = (
    "run faster", "go faster", "speed up", "push harder", "sprint", "beat your pace",
    "raise your heart rate", "heart rate zone", "heart-rate zone", "hit zone", "burn more",
    "burn calories", "calorie target", "don't stop", "outpace", "fastest runner",
)


def _clean_copy(value: Any, fallback: str, limit: int) -> str:
    if not isinstance(value, str):
        return fallback
    normalized = " ".join(value.replace("<", "").replace(">", "").split()).strip()
    if not normalized or len(normalized) > limit:
        return fallback
    lowered = normalized.lower()
    if any(phrase in lowered for phrase in BLOCKED_PROMPTS):
        return fallback
    return normalized


def _preferences(profile: RunnerProfile | None) -> RunnerPreferences:
    try:
        return RunnerPreferences.model_validate(profile.preferences_json if profile else {})
    except Exception:
        return RunnerPreferences()


def _primary_world(db: Session, user_id, route_id=None) -> tuple[str, str]:
    parties = sorted(parties_for_runner(db, user_id), key=lambda item: item.created_at)
    party = next((item for item in parties if item.world and item.world.route_id == route_id), None) if route_id else None
    party = party or next((item for item in parties if item.world), None)
    if party and party.world:
        return party.world.name, str(party.world.state_json.get("arcade", {}).get("chapter", "Marquee Mystery"))
    return "The Lost Arcade", "Marquee Mystery"


def _route_history(db: Session, user_id, route_id) -> list[Workout]:
    return (
        db.query(Workout)
        .join(RouteInstance, RouteInstance.workout_id == Workout.id)
        .filter(Workout.user_id == user_id, RouteInstance.route_id == route_id)
        .order_by(Workout.started_at.desc())
        .limit(20)
        .all()
    )


def build_runner_snapshot(db: Session, user_id, route_id=None, *, exclude_workout_id=None) -> dict[str, Any]:
    workout_query = db.query(Workout).filter(Workout.user_id == user_id)
    if exclude_workout_id is not None:
        workout_query = workout_query.filter(Workout.id != exclude_workout_id)
    workouts = workout_query.order_by(Workout.started_at.desc()).limit(24).all()
    run_count_query = db.query(func.count(Workout.id)).filter(Workout.user_id == user_id)
    distance_query = db.query(func.coalesce(func.sum(Workout.distance_m), 0)).filter(Workout.user_id == user_id)
    if exclude_workout_id is not None:
        run_count_query = run_count_query.filter(Workout.id != exclude_workout_id)
        distance_query = distance_query.filter(Workout.id != exclude_workout_id)
    run_count = run_count_query.scalar() or 0
    lifetime_distance = distance_query.scalar() or 0
    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)
    recent_count_query = db.query(func.count(Workout.id)).filter(
        Workout.user_id == user_id,
        Workout.started_at >= thirty_days_ago,
    )
    if exclude_workout_id is not None:
        recent_count_query = recent_count_query.filter(Workout.id != exclude_workout_id)
    recent_runs_30_days = int(recent_count_query.scalar() or 0)
    recent_eight = workouts[:8]
    typical_distance_km = round(statistics.median(float(run.distance_m) for run in recent_eight) / 1000, 1) if recent_eight else None
    typical_duration_minutes = round(statistics.median(float(run.duration_s) for run in recent_eight) / 60, 1) if recent_eight else None
    visited_query = (
        db.query(Route.name, Route.id)
        .join(RouteInstance, RouteInstance.route_id == Route.id)
        .join(Workout, Workout.id == RouteInstance.workout_id)
        .filter(Workout.user_id == user_id)
        .group_by(Route.id, Route.name)
        .order_by(Route.name.asc())
    )
    visit_query = (
        db.query(RouteInstance.route_id, func.count(RouteInstance.id))
        .join(Workout, Workout.id == RouteInstance.workout_id)
        .filter(Workout.user_id == user_id)
        .group_by(RouteInstance.route_id)
    )
    if exclude_workout_id is not None:
        visited_query = visited_query.filter(Workout.id != exclude_workout_id)
        visit_query = visit_query.filter(Workout.id != exclude_workout_id)
    visited = visited_query.all()
    visit_rows = visit_query.all()
    visit_counts = {str(visited_route_id): int(count) for visited_route_id, count in visit_rows}
    most_visited = max(visited, key=lambda item: visit_counts.get(str(item[1]), 0), default=None)
    route_count = sum(visit_counts.values())
    discoveries = max(0, len(visited))
    last_run = workouts[0].started_at if workouts else None
    if last_run is not None:
        last_run = last_run.replace(tzinfo=timezone.utc) if last_run.tzinfo is None else last_run
        days_since_last_run = max(0, (now - last_run).days)
    else:
        days_since_last_run = None
    _, chapter = _primary_world(db, user_id, route_id)
    return {
        "runsLogged": int(run_count),
        "mostVisitedCourse": most_visited[0] if most_visited else None,
        "favoriteCourseVisits": visit_counts.get(str(most_visited[1]), 0) if most_visited else 0,
        "courseVisits": visit_counts.get(str(route_id), 0) if route_id else 0,
        "discoveries": discoveries,
        "recentRuns30Days": recent_runs_30_days,
        "typicalDistanceKm": typical_distance_km,
        "typicalDurationMinutes": typical_duration_minutes,
        "recentChapter": chapter,
        "daysSinceLastRun": days_since_last_run,
        "distanceKmLifetime": round(max(0, float(lifetime_distance)) / 1000, 1),
        "coursesPlayed": len(visited),
        "routeRunsLogged": route_count,
    }


async def _mastra(path: str, payload: dict[str, Any]) -> dict[str, Any] | None:
    if not settings.mastra_url or not settings.mastra_internal_token:
        return None
    try:
        async with httpx.AsyncClient(timeout=settings.mastra_timeout_seconds) as client:
            response = await client.post(
                f"{settings.mastra_url.rstrip('/')}{path}",
                json=payload,
                headers={"Authorization": f"Bearer {settings.mastra_internal_token}"},
            )
        if response.status_code != 200:
            return None
        body = response.json()
        output = body.get("output") if isinstance(body, dict) else None
        return output if isinstance(output, dict) else None
    except Exception:
        return None


def _course_distance(db: Session, user_id, route_id) -> float:
    runs = _route_history(db, user_id, route_id)
    distances = [float(run.distance_m) for run in runs if run.distance_m and run.distance_m > 0]
    if distances:
        return max(400.0, statistics.median(distances))
    return 3200.0


async def prepare_cartridge(
    db: Session,
    *,
    user_id,
    route: Route,
    intent: str,
    profile: RunnerProfile | None,
) -> tuple[AdventureSession, CartridgeOut]:
    prefs = _preferences(profile)
    if intent == "surprise":
        intent = prefs.run_intention
    runner = build_runner_snapshot(db, user_id, route.id)
    world_name, chapter = _primary_world(db, user_id, route.id)
    chapter_story = _chapter_story(chapter)
    safe_world_name = _clean_copy(world_name, "The Lost Arcade", 80)
    safe_course_name = _clean_copy(route.name, "Mystery Trail", 80)
    distance_m = _course_distance(db, user_id, route.id)
    raw_events = _chapter_events(chapter, distance_m)
    evidence = [{
        "id": "chosen-intention",
        "label": "Today's chosen kind of adventure",
        "detail": f"The runner chose a {INTENT_LABELS.get(intent, 'surprise adventure')}.",
    }]
    visits = int(runner.get("courseVisits", 0))
    if runner.get("runsLogged", 0) >= 3 and runner.get("typicalDistanceKm") is not None:
        evidence.append({
            "id": "recent-running-rhythm",
            "label": "A gentle look at recent outings",
            "detail": (
                f"Across recent outings, the middle run was about {runner['typicalDistanceKm']} kilometres "
                f"and {runner['typicalDurationMinutes']} minutes. This describes past runs; it is not a goal."
            ),
        })
    if runner.get("mostVisitedCourse") and runner.get("favoriteCourseVisits", 0) >= 3:
        evidence.append({
            "id": "favorite-course",
            "label": "A familiar favorite",
            "detail": f"{_clean_copy(runner['mostVisitedCourse'], 'A favorite course', 80)} has been visited {runner['favoriteCourseVisits']} times.",
        })
    if runner.get("daysSinceLastRun") is not None and runner["daysSinceLastRun"] >= 14:
        evidence.append({
            "id": "welcome-back",
            "label": "A welcome-back visit",
            "detail": f"The runner's previous recorded run was {runner['daysSinceLastRun']} days ago.",
        })
    if runner["runsLogged"] == 0:
        evidence.append({
            "id": "first-adventure",
            "label": "First adventure",
            "detail": "This is the runner's first recorded adventure in Jogmania.",
        })
    exact_lifetime_m = db.query(func.coalesce(func.sum(Workout.distance_m), 0)).filter(Workout.user_id == user_id).scalar() or 0
    lifetime_landmark_km = int(float(exact_lifetime_m) // 10000) * 10
    if lifetime_landmark_km >= 10:
        evidence.append({
            "id": "lifetime-distance-landmark",
            "label": "A lifetime distance landmark",
            "detail": f"The runner has logged at least {lifetime_landmark_km} kilometres across their recorded adventures.",
        })
    if runner["coursesPlayed"] > 1:
        evidence.append({
            "id": "course-map",
            "label": "A growing course map",
            "detail": f"The runner has visited {runner['coursesPlayed']} different courses.",
        })
    if chapter:
        evidence.append({
            "id": "arcade-chapter",
            "label": "Current arcade chapter",
            "detail": f"The runner's current world chapter is {chapter}.",
        })
    if visits >= 2:
        evidence.append({
            "id": "course-return",
            "label": "A familiar course",
            "detail": f"The runner has completed this course {visits} times.",
        })
    if runner.get("mostVisitedCourse") == route.name:
        evidence.append({
            "id": "often-visited-course",
            "label": "A well-traveled path",
            "detail": f"This is the runner's most frequently completed course, with {visits} visits.",
        })
    if runner["runsLogged"] >= 3 and runner.get("typicalDistanceKm") is not None:
        evidence.append({
            "id": "runner-own-pattern",
            "label": "The runner's own recent pattern",
            "detail": (
                f"Across the runner's last {min(8, runner['runsLogged'])} recorded outings, "
                f"the middle distance was {runner['typicalDistanceKm']} kilometres and "
                f"the middle duration was {runner['typicalDurationMinutes']} minutes. "
                "This is a neutral personal reference, not a goal or judgement."
            ),
        })
    if runner.get("recentRuns30Days", 0) >= 2:
        evidence.append({
            "id": "recent-adventures",
            "label": "Recent time outside",
            "detail": f"The runner recorded {runner['recentRuns30Days']} adventures in the last 30 days.",
        })
    milestone = ((runner["runsLogged"] // 5) + 1) * 5
    if runner["runsLogged"] >= 4 and runner["runsLogged"] + 1 == milestone:
        evidence.append({
            "id": "next-run-landmark",
            "label": "A little landmark nearby",
            "detail": f"This next adventure will be the runner's {milestone}th recorded run.",
        })
    default_title = _clean_copy(chapter_story["title"], "Relight the Lost Arcade", 48)
    default_opening = chapter_story["opening"] if intent != "easy" else f"No hurry: {chapter_story['name']} will be here when you're ready. The crew packed snacks."
    default_finish = chapter_story["finish"]
    default_story = f"You brought a little color back to {chapter_story['name']}. The place looks more like itself already."
    fallback = {
        "title": default_title,
        "openingLine": default_opening,
        "finishLine": default_finish,
        "eventLines": [{"id": e["id"], "title": e["title"], "message": e["message"]} for e in raw_events],
        "recapHeadline": chapter_story["recap"],
        "recapStory": default_story,
        "evidenceId": None,
        "nextHook": chapter_story["hook"],
    }
    trend = await _mastra("/v1/trend", {
        "courseName": safe_course_name,
        "runnerSnapshot": {
            "runsLogged": runner["runsLogged"],
            "favoriteCourse": _clean_copy(runner["mostVisitedCourse"], "", 80) if runner["mostVisitedCourse"] else None,
            "favoriteCourseVisits": runner["favoriteCourseVisits"],
            "recentRuns30Days": runner["recentRuns30Days"],
            "typicalDistanceKm": runner["typicalDistanceKm"],
            "typicalDurationMinutes": runner["typicalDurationMinutes"],
            "daysSinceLastRun": runner["daysSinceLastRun"],
        },
        "evidence": evidence,
    })
    trend_id = trend.get("evidenceId") if trend else None
    trend_evidence = next((item for item in evidence if item["id"] == trend_id), None)
    trend_note = _clean_copy(trend.get("moment"), "", 150) if trend and trend_evidence else ""
    copy = await _mastra("/v1/cartridge", {
        "courseName": safe_course_name,
        "worldName": safe_world_name,
        "intent": intent,
        "tone": prefs.adventure_tone,
        "feedbackHint": prefs.story_feedback,
        "runnerSnapshot": {
            "runsLogged": runner["runsLogged"],
            "favoriteCourse": _clean_copy(runner["mostVisitedCourse"], "", 80) if runner["mostVisitedCourse"] else None,
            "favoriteCourseVisits": runner["favoriteCourseVisits"],
            "discoveries": runner["discoveries"],
            "recentRuns30Days": runner["recentRuns30Days"],
            "typicalDistanceKm": runner["typicalDistanceKm"],
            "typicalDurationMinutes": runner["typicalDurationMinutes"],
            "recentChapter": chapter,
            "daysSinceLastRun": runner["daysSinceLastRun"],
            "lifetimeDistanceKm": runner["distanceKmLifetime"],
        },
        "events": [{"id": e["id"], "kind": e["kind"], "title": e["title"], "message": e["message"]} for e in raw_events],
        "evidence": evidence,
    })
    intelligence = "fallback"
    if copy:
        expected_ids = {event["id"] for event in raw_events}
        line_map = {
            item.get("id"): item for item in copy.get("eventLines", [])
            if isinstance(item, dict) and item.get("id") in expected_ids
        }
        copy = {**fallback, **copy}
        copy["eventLines"] = [
            {
                "id": event["id"],
                "title": _clean_copy(line_map.get(event["id"], {}).get("title"), event["title"], 36),
                "message": _clean_copy(line_map.get(event["id"], {}).get("message"), event["message"], 110),
            }
            for event in raw_events
        ]
        copy["evidenceId"] = copy.get("evidenceId") if copy.get("evidenceId") in {item["id"] for item in evidence} else None
        intelligence = "mastra"
    for event in raw_events:
        line = next((item for item in copy.get("eventLines", []) if item.get("id") == event["id"]), None)
        if line:
            event["title"] = _clean_copy(line.get("title"), event["title"], 36)
            event["message"] = _clean_copy(line.get("message"), event["message"], 110)
    title = _clean_copy(copy.get("title"), fallback["title"], 48)
    opening_line = trend_note or _clean_copy(copy.get("openingLine"), fallback["openingLine"], 150)
    finish_line = _clean_copy(copy.get("finishLine"), fallback["finishLine"], 150)
    safe_events = [CartridgeEvent.model_validate(event) for event in raw_events]
    cartridge = CartridgeOut(
        id=uuid.uuid4(),
        title=title,
        world_name=safe_world_name,
        course_name=safe_course_name,
        intent=intent,
        opening_line=opening_line,
        finish_line=finish_line,
        events=safe_events,
        reward_preview="A new arcade light, plus a token for the prize tin",
        target_distance_m=max(1, round(distance_m)),
        haptics_enabled=prefs.haptics_enabled,
        health_data_enabled=prefs.health_data_enabled,
        intelligence=intelligence,
        runner_snapshot={
            "runs_logged": runner["runsLogged"],
            "course_visits": visits,
            "courses_played": runner["coursesPlayed"],
        },
    )
    payload = cartridge.model_dump(mode="json")
    payload["target_distance_m"] = distance_m
    payload["runner_snapshot"] = runner
    payload["recap_seed"] = {
        "headline": _clean_copy(copy.get("recapHeadline"), fallback["recapHeadline"], 72),
        "story": _clean_copy(copy.get("recapStory"), fallback["recapStory"], 360),
        "evidence_id": copy.get("evidenceId"),
        "next_hook": _clean_copy(copy.get("nextHook"), fallback["nextHook"], 120),
    }
    session = AdventureSession(
        id=cartridge.id,
        user_id=user_id,
        route_id=route.id,
        intent=intent,
        status="prepared",
        cartridge_json=payload,
        event_log_json=[],
        recap_json={},
        world_change_json={},
    )
    db.add(session)
    db.flush()
    if profile:
        profile.snapshot_json = runner
    return session, cartridge


def recover_offline_session(
    db: Session,
    *,
    user_id,
    route: Route,
    workout: Workout,
    event_log: list[dict[str, Any]] | None = None,
) -> AdventureSession:
    """Give an offline/local-fallback run a durable story when its upload arrives."""
    existing = db.query(AdventureSession).filter(AdventureSession.workout_id == workout.id).first()
    if existing:
        return existing

    profile = db.query(RunnerProfile).filter(RunnerProfile.user_id == user_id).first()
    prefs = _preferences(profile)
    runner = build_runner_snapshot(db, user_id, route.id)
    world_name, chapter = _primary_world(db, user_id, route.id)
    chapter_story = _chapter_story(chapter)
    safe_world_name = _clean_copy(world_name, "The Lost Arcade", 80)
    distance_m = max(1, round(float(workout.distance_m or 0)))
    events = [CartridgeEvent.model_validate(event) for event in _chapter_events(chapter, distance_m)]
    cartridge = CartridgeOut(
        id=uuid.uuid4(),
        title=_clean_copy(chapter_story["title"], "Relight the Lost Arcade", 48),
        world_name=safe_world_name,
        course_name=_clean_copy(route.name, "Mystery Trail", 80),
        intent=prefs.run_intention,
        opening_line=chapter_story["opening"],
        finish_line=chapter_story["finish"],
        events=events,
        reward_preview="A new arcade light and a brass-token story",
        target_distance_m=distance_m,
        haptics_enabled=prefs.haptics_enabled,
        intelligence="fallback",
        runner_snapshot={
            "runs_logged": runner["runsLogged"],
            "course_visits": runner["courseVisits"],
            "courses_played": runner["coursesPlayed"],
        },
    )
    saved_log = []
    allowed_ids = {event.id: event for event in events}
    for item in event_log or []:
        if not isinstance(item, dict):
            continue
        event = allowed_ids.get(str(item.get("id", "")))
        if event and event.id not in {entry["id"] for entry in saved_log}:
            saved_log.append({"id": event.id, "title": event.title, "kind": event.kind})

    session = AdventureSession(
        id=cartridge.id,
        user_id=user_id,
        route_id=route.id,
        workout_id=workout.id,
        intent=prefs.run_intention,
        status="complete",
        cartridge_json={
            **cartridge.model_dump(mode="json"),
            "runner_snapshot": runner,
            "recap_seed": {
                "headline": chapter_story["recap"],
                "story": f"You brought a little color back to {chapter_story['name']}.",
                "evidence_id": None,
                "next_hook": chapter_story["hook"],
            },
        },
        event_log_json=saved_log,
        recap_json={},
        world_change_json={},
        started_at=workout.started_at,
        finished_at=workout.ended_at,
    )
    db.add(session)
    db.flush()
    return session


def _postrun_evidence(
    db: Session,
    user_id,
    workout: Workout,
    route: Route,
    session: AdventureSession,
    event_log: list[dict[str, Any]],
) -> list[dict[str, str]]:
    prior = _route_history(db, user_id, route.id)
    prior = [run for run in prior if run.id != workout.id]
    safe_route_name = _clean_copy(route.name, "Mystery Trail", 80)
    evidence: list[dict[str, str]] = [{
        "id": "run-complete",
        "label": "Run completed",
        "detail": f"The runner completed {workout.distance_m / 1000:.2f} kilometres in {workout.duration_s / 60:.1f} minutes on {safe_route_name}.",
    }]
    evidence.append({
        "id": "chosen-intention",
        "label": "Today's chosen kind of adventure",
        "detail": f"The runner chose a {INTENT_LABELS.get(session.intent, 'surprise adventure')} before starting.",
    })
    if not prior:
        evidence.append({"id": "course-discovery", "label": "New course", "detail": f"This was the first recorded run on {safe_route_name}."})
    else:
        visits = len(prior) + 1
        evidence.append({"id": "course-return", "label": "Course return", "detail": f"This was run {visits} on {safe_route_name}."})
        previous_longest = max((run.distance_m for run in prior), default=0)
        if workout.distance_m > previous_longest + 50:
            evidence.append({
                "id": "longest-course-wander",
                "label": "Longest visit to this trail",
                "detail": f"This visit covered {workout.distance_m / 1000:.2f} kilometres, longer than any earlier recorded visit to {safe_route_name}.",
            })
    days = _days_since_previous_run(db, user_id, workout)
    if days is not None and days >= 14:
        evidence.append({"id": "welcome-back", "label": "Welcome-back visit", "detail": f"The previous recorded run was {days} days before this one."})
    run_count = db.query(func.count(Workout.id)).filter(Workout.user_id == user_id).scalar() or 0
    if int(run_count) in {5, 10, 25, 50, 100}:
        evidence.append({
            "id": "run-landmark",
            "label": "A lifetime run landmark",
            "detail": f"This was the runner's {int(run_count)}th recorded workout.",
        })
    before_distance = db.query(func.coalesce(func.sum(Workout.distance_m), 0)).filter(
        Workout.user_id == user_id,
        Workout.id != workout.id,
    ).scalar() or 0
    after_distance = float(before_distance) + max(0.0, float(workout.distance_m or 0))
    before_ten = int(float(before_distance) // 10000)
    after_ten = int(after_distance // 10000)
    if after_ten > before_ten and after_ten > 0:
        milestone_km = after_ten * 10
        evidence.append({
            "id": "lifetime-distance-landmark",
            "label": "A lifetime distance landmark",
            "detail": f"This run brought the runner's recorded lifetime distance past {milestone_km} kilometres.",
        })
    verified_beats = [str(item.get("title", "")) for item in event_log if isinstance(item, dict) and item.get("title")]
    if verified_beats:
        evidence.append({
            "id": "verified-story-beats",
            "label": "Story moments heard on the Watch",
            "detail": "The Watch confirmed these story moments during this run: " + "; ".join(verified_beats[:6]) + ".",
        })
    recent_prior = _route_history(db, user_id, route.id)
    recent_prior = [run for run in recent_prior if run.id != workout.id]
    if len(recent_prior) >= 2:
        recent_prior = recent_prior[:8]
        typical_distance = round(statistics.median(float(run.distance_m) for run in recent_prior) / 1000, 1)
        typical_duration = round(statistics.median(float(run.duration_s) for run in recent_prior) / 60, 1)
        evidence.append({
            "id": "runner-own-pattern",
            "label": "The runner's own course pattern",
            "detail": (
                f"Today's visit was {workout.distance_m / 1000:.2f} kilometres and {workout.duration_s / 60:.1f} minutes. "
                f"Across the runner's previous {len(recent_prior)} visits to this course, the middle outing was "
                f"{typical_distance} kilometres and {typical_duration} minutes. This comparison is descriptive, not a target."
            ),
        })
    all_prior = db.query(Workout).filter(Workout.user_id == user_id, Workout.id != workout.id).order_by(Workout.started_at.desc()).limit(8).all()
    if len(all_prior) >= 3:
        typical_distance = round(statistics.median(float(run.distance_m) for run in all_prior) / 1000, 1)
        typical_duration = round(statistics.median(float(run.duration_s) for run in all_prior) / 60, 1)
        evidence.append({
            "id": "recent-running-pattern",
            "label": "A snapshot of recent outings",
            "detail": (
                f"Today's adventure was {workout.distance_m / 1000:.2f} kilometres and {workout.duration_s / 60:.1f} minutes. "
                f"Across the runner's last {len(all_prior)} outings, the middle outing was {typical_distance} kilometres "
                f"and {typical_duration} minutes. This is a neutral comparison, not a goal or judgement."
            ),
        })
    world_change = session.world_change_json or {}
    if isinstance(world_change.get("title"), str) and world_change["title"]:
        evidence.append({
            "id": "arcade-light",
            "label": "Arcade world change",
            "detail": world_change["title"],
        })
    return evidence


def _days_since_previous_run(db: Session, user_id, workout: Workout) -> int | None:
    previous_run = db.query(Workout).filter(
        Workout.user_id == user_id,
        Workout.id != workout.id,
    ).order_by(Workout.started_at.desc()).first()
    if not previous_run:
        return None
    previous_at = previous_run.started_at
    previous_at = previous_at.replace(tzinfo=timezone.utc) if previous_at.tzinfo is None else previous_at
    current_at = workout.started_at
    current_at = current_at.replace(tzinfo=timezone.utc) if current_at.tzinfo is None else current_at
    return max(0, (current_at - previous_at).days)


async def build_recap(
    db: Session,
    *,
    session: AdventureSession,
    workout: Workout,
    route: Route,
    event_log: list[dict[str, Any]],
    use_mastra: bool = True,
) -> dict[str, Any]:
    evidence = _postrun_evidence(db, session.user_id, workout, route, session, event_log)
    runner = build_runner_snapshot(db, session.user_id, route.id, exclude_workout_id=workout.id)
    prior_course_visits = runner["courseVisits"]
    runner["runsLogged"] += 1
    runner["courseVisits"] += 1
    runner["routeRunsLogged"] += 1
    if prior_course_visits == 0:
        runner["coursesPlayed"] += 1
        runner["discoveries"] += 1
    if workout.distance_m and workout.distance_m > 0:
        runner["distanceKmLifetime"] = round(runner["distanceKmLifetime"] + workout.distance_m / 1000, 1)
    workout_started_at = workout.started_at
    workout_started_at = workout_started_at.replace(tzinfo=timezone.utc) if workout_started_at.tzinfo is None else workout_started_at
    if workout_started_at >= datetime.now(timezone.utc) - timedelta(days=30):
        runner["recentRuns30Days"] += 1
    runner["favoriteCourseVisits"] = max(runner["favoriteCourseVisits"], runner["courseVisits"])
    if runner["courseVisits"] >= runner["favoriteCourseVisits"]:
        runner["mostVisitedCourse"] = route.name
    runner["daysSinceLastRun"] = _days_since_previous_run(db, session.user_id, workout)
    _, chapter = _primary_world(db, session.user_id, route.id)
    allowed_evidence = {item["id"] for item in evidence}
    cartridge = session.cartridge_json or {}
    world_name = cartridge.get("world_name") or "The Lost Arcade"
    seed = cartridge.get("recap_seed") or {}
    fallback = {
        "headline": seed.get("headline") or "The arcade lights are back!",
        "story": seed.get("story") or f"You brought a little color back to {world_name}.",
        "evidence_id": None,
        "next_hook": seed.get("next_hook") or "Something is blinking behind the prize counter.",
        "intelligence": "fallback",
        "evidence": evidence,
    }
    safe_course_name = _clean_copy(route.name, "Mystery Trail", 80)
    profile = db.query(RunnerProfile).filter(RunnerProfile.user_id == session.user_id).first()
    copy = await _mastra("/v1/recap", {
        "courseName": safe_course_name,
        "worldName": _clean_copy(world_name, "The Lost Arcade", 80),
        "intent": session.intent,
        "feedbackHint": _preferences(profile).story_feedback,
        "distanceKm": round(max(0.0, workout.distance_m) / 1000, 2),
        "durationMinutes": round(max(0, workout.duration_s) / 60, 1),
        "runnerSnapshot": {
            "runsLogged": runner["runsLogged"],
            "courseVisits": runner["courseVisits"],
            "coursesPlayed": runner["coursesPlayed"],
            "favoriteCourse": _clean_copy(runner["mostVisitedCourse"], "", 80) if runner["mostVisitedCourse"] else None,
            "favoriteCourseVisits": runner["favoriteCourseVisits"],
            "recentRuns30Days": runner["recentRuns30Days"],
            "typicalDistanceKm": runner["typicalDistanceKm"],
            "typicalDurationMinutes": runner["typicalDurationMinutes"],
            "recentChapter": _clean_copy(chapter, "Marquee Mystery", 48),
            "daysSinceLastRun": runner["daysSinceLastRun"],
            "lifetimeDistanceKm": runner["distanceKmLifetime"],
        },
        "eventLog": [
            {"id": str(item.get("id", "")), "title": str(item.get("title", "A moment"))[:60]}
            for item in event_log[:24] if isinstance(item, dict)
        ],
        "evidence": evidence,
    }) if use_mastra else None
    if copy:
        evidence_id = copy.get("evidenceId")
        if evidence_id not in allowed_evidence:
            copy = None
    if copy:
        evidence_id = copy.get("evidenceId")
        fallback = {
            "headline": _clean_copy(copy.get("recapHeadline"), fallback["headline"], 72),
            "story": _clean_copy(copy.get("recapStory"), fallback["story"], 360),
            "evidence_id": evidence_id if evidence_id in allowed_evidence else None,
            "next_hook": _clean_copy(copy.get("nextHook"), fallback["next_hook"], 120),
            "intelligence": "mastra",
            "evidence": evidence,
        }
    if fallback["evidence_id"] is None and evidence:
        completion = evidence[0]
    else:
        completion = next((item for item in evidence if item["id"] == fallback["evidence_id"]), None)
    fallback["evidence"] = evidence
    fallback["evidence_label"] = completion["label"] if completion else None
    fallback["story"] = _clean_copy(fallback["story"], seed.get("story") or f"You brought a little color back to {world_name}.", 360)
    return fallback
