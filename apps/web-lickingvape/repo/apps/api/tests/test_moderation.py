from app.moderation import parse_review_payload


def test_parse_review_payload_accepts_json_string():
    payload = '{"decision": "approve", "reasons": ["ok"], "cleaned_body": "hi", "tags": ["tag"]}'
    result = parse_review_payload(payload)
    assert result["decision"] == "approve"
    assert result["reasons"] == ["ok"]
    assert result["cleaned_body"] == "hi"
    assert result["tags"] == ["tag"]


def test_parse_review_payload_defaults_on_invalid():
    result = parse_review_payload("not json")
    assert result["decision"] == "reject"
    assert result["reasons"]
