import smtplib
from email.message import EmailMessage
from app.core.config import settings


def smtp_ready() -> bool:
    return bool(settings.smtp_host and settings.smtp_from)


def send_verification_email(to_email: str, token: str):
    if not smtp_ready():
        raise RuntimeError("SMTP not configured")

    verify_url = f"{settings.cors_origins[0]}/login?verify_token={token}" if settings.cors_origins else f"/login?verify_token={token}"

    message = EmailMessage()
    message["Subject"] = "Verify your Jogmania account"
    message["From"] = settings.smtp_from
    message["To"] = to_email
    message.set_content(
        "Welcome to Jogmania!\n\n"
        f"Verify your account by opening this link:\n{verify_url}\n\n"
        "If you did not request this, you can ignore this email."
    )

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        if settings.smtp_tls:
            server.starttls()
        if settings.smtp_user and settings.smtp_password:
            server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(message)
