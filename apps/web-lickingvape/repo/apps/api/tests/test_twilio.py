from twilio.request_validator import RequestValidator

from app.twilio_utils import validate_twilio_signature


def test_validate_twilio_signature(monkeypatch):
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "12345")
    url = "https://example.com/webhooks/sms/twilio"
    form = {"From": "+15551234567", "Body": "Hello"}
    validator = RequestValidator("12345")
    signature = validator.compute_signature(url, form)

    assert validate_twilio_signature(url, form, signature) is True
    assert validate_twilio_signature(url, form, "bad") is False
