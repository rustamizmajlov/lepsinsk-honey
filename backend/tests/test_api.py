"""Smoke tests for the whole API flow.

Run locally against SQLite:
    DATABASE_URL=sqlite:///./test.db pytest backend/tests
"""
import os
import sys
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "sqlite:///./test.db")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


def auth(client, username, password):
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_full_flow():
    Base.metadata.drop_all(engine)
    with TestClient(app) as c:
        assert c.get("/api/health").json() == {"status": "ok"}

        # registration + duplicate
        r = c.post("/api/auth/register", json={"username": "kate", "email": "kate@ex.com", "password": "secret1"})
        assert r.status_code == 201 and r.json()["credits"] == 3 and r.json()["role"] == "user"
        assert c.post("/api/auth/register", json={"username": "kate", "email": "k2@ex.com", "password": "secret1"}).status_code == 409
        assert c.post("/api/auth/login", json={"username": "kate", "password": "wrong"}).status_code == 401

        kate = auth(c, "kate", "secret1")
        anna = auth(c, "anna", "demo123")
        admin = auth(c, "admin", "admin12345")
        assert c.get("/api/auth/me").status_code == 401

        # Skill CRUD
        assert c.post("/api/skills", json={"title": "Шахматы", "category": "Игры"}).status_code == 401
        r = c.post("/api/skills", headers=kate, json={"title": "Шахматы", "category": "Игры", "hours_cost": 1})
        assert r.status_code == 201
        chess = r.json()["id"]
        assert c.get(f"/api/skills/{chess}").json()["owner"]["username"] == "kate"
        assert len(c.get("/api/skills", params={"q": "PYTHON"}).json()) == 1
        assert len(c.get("/api/skills", params={"category": "Игры"}).json()) == 1
        assert c.put(f"/api/skills/{chess}", headers=anna, json={"title": "hack"}).status_code == 403
        r = c.put(f"/api/skills/{chess}", headers=kate, json={"level": "expert"})
        assert r.json()["level"] == "expert"
        assert "Игры" in c.get("/api/skills/categories").json()

        # Swap CRUD + business rules
        english = next(s for s in c.get("/api/skills").json() if s["owner"]["username"] == "anna")["id"]
        assert c.post("/api/swaps", headers=kate, json={"skill_id": chess}).status_code == 400  # own skill
        assert c.post("/api/swaps", headers=kate, json={"skill_id": english, "hours": 10}).status_code == 400  # credits
        r = c.post("/api/swaps", headers=kate, json={"skill_id": english, "hours": 2, "message": "Hi"})
        assert r.status_code == 201 and r.json()["total_cost"] == 2
        swap = r.json()["id"]
        assert c.post("/api/swaps", headers=kate, json={"skill_id": english}).status_code == 409
        assert c.put(f"/api/swaps/{swap}", headers=kate, json={"message": "Hello!"}).json()["message"] == "Hello!"
        assert c.put(f"/api/swaps/{swap}", headers=kate, json={"status": "accepted"}).status_code == 403
        assert len(c.get("/api/swaps", headers=anna, params={"box": "incoming"}).json()) == 1
        assert c.put(f"/api/swaps/{swap}", headers=anna, json={"status": "accepted"}).json()["status"] == "accepted"
        assert c.delete(f"/api/swaps/{swap}", headers=kate).status_code == 400
        assert c.put(f"/api/swaps/{swap}", headers=kate, json={"status": "completed"}).json()["status"] == "completed"
        assert c.get("/api/auth/me", headers=kate).json()["credits"] == 1
        assert c.get("/api/auth/me", headers=anna).json()["credits"] == 5

        # delete a pending swap
        r = c.post("/api/swaps", headers=anna, json={"skill_id": chess})
        assert c.delete(f"/api/swaps/{r.json()['id']}", headers=anna).status_code == 204

        # admin
        assert c.get("/api/admin/users", headers=kate).status_code == 403
        users = c.get("/api/admin/users", headers=admin).json()
        kate_id = next(u["id"] for u in users if u["username"] == "kate")
        assert c.patch(f"/api/admin/users/{kate_id}", headers=admin, json={"credits": 10}).json()["credits"] == 10
        stats = c.get("/api/admin/stats", headers=admin).json()
        assert stats["completed_swaps"] == 1 and stats["hours_exchanged"] == 2
        assert c.delete(f"/api/skills/{chess}", headers=admin).status_code == 204
        assert c.get(f"/api/skills/{chess}").status_code == 404
        assert c.patch(f"/api/admin/users/{kate_id}", headers=admin, json={"is_active": False}).status_code == 200
        assert c.get("/api/auth/me", headers=kate).status_code == 401
        assert c.delete(f"/api/admin/users/{kate_id}", headers=admin).status_code == 204
