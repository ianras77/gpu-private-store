from app.core.security import get_password_hash
from app.models import User


def test_register_success_creates_user(client, db_session):
    res = client.post("/auth/register", json={"email": "new@jogmania.com", "password": "strongpass"})
    assert res.status_code == 200
    data = res.json()
    assert data.get("access_token")

    user = db_session.query(User).filter(User.email == "new@jogmania.com").first()
    assert user is not None


def test_register_duplicate_email(client, db_session):
    user = User(email="dup@jogmania.com", password_hash=get_password_hash("password123"), email_verified=True)
    db_session.add(user)
    db_session.commit()

    res = client.post("/auth/register", json={"email": "dup@jogmania.com", "password": "password123"})
    assert res.status_code == 400


def test_login_success(client, db_session):
    user = User(email="login@jogmania.com", password_hash=get_password_hash("password123"), email_verified=True)
    db_session.add(user)
    db_session.commit()

    res = client.post("/auth/login", json={"email": "login@jogmania.com", "password": "password123"})
    assert res.status_code == 200
    data = res.json()
    assert data.get("access_token")


def test_me_requires_auth(client):
    res = client.get("/me")
    assert res.status_code == 401


def test_register_rolls_back_when_verification_email_fails(client, db_session, monkeypatch):
    from app.api.routes import auth as auth_routes

    monkeypatch.setattr(auth_routes, "_email_verification_enabled", lambda: True)

    def explode(*args, **kwargs):
        raise RuntimeError("smtp down")

    monkeypatch.setattr(auth_routes, "send_verification_email", explode)

    res = client.post("/auth/register", json={"email": "verify@jogmania.com", "password": "strongpass"})

    assert res.status_code == 503
    user = db_session.query(User).filter(User.email == "verify@jogmania.com").first()
    assert user is None
