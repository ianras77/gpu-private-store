from app.main import CAT_WELCOME_MESSAGE, _build_cat_reply


def test_cat_welcome_message_sets_new_curator_tone():
    assert "Lights low" in CAT_WELCOME_MESSAGE
    assert "headline" in CAT_WELCOME_MESSAGE


def test_build_cat_reply_points_world_anxiety_to_search():
    reply = _build_cat_reply(
        "The headlines are making me want nicotine tonight.",
        {"name": "M", "goal": "Get through tonight"},
    )

    assert "search.rasies.com" in reply
    assert "latest headlines anxiety nicotine today" in reply


def test_build_cat_reply_invites_post_shape_for_drafts():
    reply = _build_cat_reply(
        "Help me draft a post about this weird craving.",
        {"name": "M", "recentWin": "Stayed off nicotine yesterday"},
    )

    assert "Scene, ache, next move." in reply
    assert "Start ugly." in reply


def test_build_cat_reply_has_craving_mode():
    reply = _build_cat_reply(
        "I want a hit so badly right now.",
        {"name": "M", "goal": "Make it to midnight"},
        mode="craving",
    )

    assert "Move the vape or buying path" in reply
    assert "name the stripe" in reply


def test_build_cat_reply_has_post_mode():
    reply = _build_cat_reply(
        "Turn this ugly hour into something I can post.",
        {"name": "M", "currentStruggle": "after dinner"},
        mode="post",
    )

    assert "Draft it like a wall post" in reply
    assert "Scene / trigger / refusal" in reply
