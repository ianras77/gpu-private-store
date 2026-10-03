"""Small, authored story rewards for runners who make a path familiar."""

COURSE_CHAPTERS = (
    {
        "visits_required": 1,
        "title": "First Footstep",
        "story": "A tiny postbox appears beside this path. The lantern mouse has been appointed postmaster.",
        "keepsake": "Postcard from the Path",
        "keepsake_icon": "📮",
        "item_key": "trail-postcard",
    },
    {
        "visits_required": 3,
        "title": "The Mouse Knows Your Name",
        "story": "A lantern mouse has made this loop its favorite hello and saved you the window seat.",
        "keepsake": "Mouse Window Badge",
        "keepsake_icon": "🐭",
        "item_key": "mouse-badge",
    },
    {
        "visits_required": 6,
        "title": "The Secret Garden",
        "story": "A tucked-away patch of flowers opens here. One flower hums the arcade theme rather badly.",
        "keepsake": "Singing Garden Seed",
        "keepsake_icon": "🌷",
        "item_key": "singing-seed",
    },
    {
        "visits_required": 10,
        "title": "Bunting Bridge",
        "story": "Bright bunting links this path to the old arcade. The mouse insists it helped tie every knot.",
        "keepsake": "Bunting Bridge Ribbon",
        "keepsake_icon": "🎏",
        "item_key": "bridge-ribbon",
    },
    {
        "visits_required": 15,
        "title": "Keeper of the Loop",
        "story": "This trail now has a story only your footsteps could write. The postbox has started collecting jokes.",
        "keepsake": "Loopkeeper Pin",
        "keepsake_icon": "📍",
        "item_key": "loopkeeper-pin",
    },
)


def chapter_for_visit(visits: int) -> dict | None:
    return next((chapter for chapter in COURSE_CHAPTERS if chapter["visits_required"] == visits), None)
