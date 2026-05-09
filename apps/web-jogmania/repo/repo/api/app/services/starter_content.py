from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.models import Party, PartyMember, Route, World
from app.services.fama_world import pick_world_name
from app.services.progression import ensure_starter_pack


DEFAULT_COURSES = [
    {"name": "Neon Canopy", "theme_key": "neon-canopy"},
    {"name": "Temple Steps", "theme_key": "temple-steps"},
    {"name": "Riverlight Loop", "theme_key": "riverlight-loop"},
]

DEFAULT_PARTY_MEMBERS = [
    {"name": "Nova", "role": "Scout"},
    {"name": "Pulse", "role": "Runner"},
    {"name": "Glyph", "role": "Guardian"},
]


def _seed_from_user_id(user_id) -> int:
    if isinstance(user_id, uuid.UUID):
        raw = user_id.hex
    else:
        raw = str(user_id).replace("-", "")
    return int(raw[:8], 16) % 9000 + 1000


def ensure_starter_routes(db: Session, user_id) -> tuple[list[Route], bool]:
    changed = False
    existing = {
        route.route_hash: route
        for route in db.query(Route).filter(Route.user_id == user_id).all()
    }
    routes: list[Route] = []

    for entry in DEFAULT_COURSES:
        route_hash = f"starter:{entry['theme_key']}"
        route = existing.get(route_hash)
        if route is None:
            route = Route(
                user_id=user_id,
                name=entry["name"],
                route_hash=route_hash,
                is_course=True,
            )
            db.add(route)
            db.flush()
            changed = True
        elif not route.is_course:
            route.is_course = True
            changed = True
        routes.append(route)

    return routes, changed


def ensure_starter_party(db: Session, user_id, routes: list[Route]) -> bool:
    changed = False
    seed = _seed_from_user_id(user_id)
    party = db.query(Party).filter(Party.user_id == user_id).first()
    primary_route_id = routes[-1].id if routes else None

    if party is None:
        party = Party(user_id=user_id, name="Arcade Vanguard")
        db.add(party)
        db.flush()
        db.add(
            World(
                party_id=party.id,
                name=pick_world_name(seed),
                theme="neon",
                seed=seed,
                route_id=primary_route_id,
                state_json={"course_id": str(primary_route_id)} if primary_route_id else {},
            )
        )
        for member in DEFAULT_PARTY_MEMBERS:
            db.add(PartyMember(party_id=party.id, name=member["name"], role=member["role"]))
        return True

    if party.world is None:
        db.add(
            World(
                party_id=party.id,
                name=pick_world_name(seed),
                theme="neon",
                seed=seed,
                route_id=primary_route_id,
                state_json={"course_id": str(primary_route_id)} if primary_route_id else {},
            )
        )
        changed = True
    elif party.world.route_id is None and primary_route_id:
        state = dict(party.world.state_json or {})
        state["course_id"] = str(primary_route_id)
        party.world.route_id = primary_route_id
        party.world.state_json = state
        changed = True

    if not party.members:
        for member in DEFAULT_PARTY_MEMBERS:
            db.add(PartyMember(party_id=party.id, name=member["name"], role=member["role"]))
        changed = True

    return changed


def ensure_user_baseline(db: Session, user_id) -> bool:
    starter_pack_changed = ensure_starter_pack(db, user_id)
    starter_routes, routes_changed = ensure_starter_routes(db, user_id)
    party_changed = ensure_starter_party(db, user_id, starter_routes)
    return starter_pack_changed or routes_changed or party_changed
