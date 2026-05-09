
def test_create_run(client):
    client.post("/auth/register", json={"email": "run@jogmania.com", "password": "runpass123"})
    login = client.post("/auth/login", json={"email": "run@jogmania.com", "password": "runpass123"})
    token = login.json()["access_token"]

    payload = {
        "distance_m": 1200,
        "duration_s": 420,
        "avg_pace_s_per_km": 350,
        "events": [
            {"type": "relic", "ts_s": 20, "data": {"combo": 1}},
            {"type": "jump", "ts_s": 40, "data": {}}
        ]
    }

    res = client.post("/runs", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()
    assert data["distance_m"] == 1200

    list_res = client.get("/runs", headers={"Authorization": f"Bearer {token}"})
    assert list_res.status_code == 200
    assert len(list_res.json()) >= 1
