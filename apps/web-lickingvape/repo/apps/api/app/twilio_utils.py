import os
from typing import Dict

from twilio.request_validator import RequestValidator


def validate_twilio_signature(url: str, form: Dict[str, str], signature: str) -> bool:
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "")
    if not auth_token:
        return False
    validator = RequestValidator(auth_token)
    return validator.validate(url, form, signature)
