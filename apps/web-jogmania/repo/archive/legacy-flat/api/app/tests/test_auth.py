from app.services.seed import DEMO_EMAIL, DEMO_PASSWORD


def test_register_and_login(client):
    res = client.post("/auth/register", json={"email": "test@jogmania.com", "password": "testpass123"})
    assert res.status_code == 200

    login = client.post("/auth/login", json={"email": "test@jogmania.com", "password": "testpass123"})
    assert login.status_code == 200
    token = login.json()["access_token"]

    me = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "test@jogmania.com"


def test_demo_login(client):
    client.post("/auth/register", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    login = client.post("/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    assert login.status_code == 200
