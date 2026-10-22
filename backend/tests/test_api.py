"""End-to-end API test: auth, product CRUD, order CRUD with stock, admin.

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


def stock(client, product_id):
    return client.get(f"/api/products/{product_id}").json()["stock"]


def test_full_flow():
    Base.metadata.drop_all(engine)
    with TestClient(app) as c:
        assert c.get("/api/health").json() == {"status": "ok"}

        # --- auth ---
        r = c.post("/api/auth/register", json={
            "username": "aliya", "email": "aliya@example.com", "password": "secret1", "full_name": "Алия",
        })
        assert r.status_code == 201 and r.json()["role"] == "user"
        assert c.post("/api/auth/register", json={
            "username": "aliya", "email": "x@example.com", "password": "secret1",
        }).status_code == 409
        assert c.post("/api/auth/login", json={"username": "aliya", "password": "bad"}).status_code == 401
        aliya = auth(c, "aliya", "secret1")
        admin = auth(c, "admin", "admin12345")
        r = c.patch("/api/auth/me", headers=aliya, json={"phone": "+77011234567", "address": "Талдыкорган"})
        assert r.json()["phone"] == "+77011234567"

        # --- products: public read, admin-only write ---
        products = c.get("/api/products").json()
        assert len(products) == 8
        assert "Горный" in c.get("/api/products/varieties").json()
        assert len(c.get("/api/products", params={"q": "донник"}).json()) == 1
        assert all(p["price"] <= 5000 for p in c.get("/api/products", params={"max_price": 5000}).json())
        new = {"name": "Акациевый", "variety": "Луговой", "price": 6800, "stock": 5, "weight_g": 1000}
        assert c.post("/api/products", headers=aliya, json=new).status_code == 403
        r = c.post("/api/products", headers=admin, json=new)
        assert r.status_code == 201
        acacia = r.json()["id"]
        assert c.put(f"/api/products/{acacia}", headers=admin, json={"price": 7000}).json()["price"] == 7000
        assert c.put(f"/api/products/{acacia}", headers=admin, json={"is_active": False}).status_code == 200
        assert c.get(f"/api/products/{acacia}").status_code == 404  # hidden from buyers
        assert c.get(f"/api/products/{acacia}", headers=admin).status_code == 200
        assert c.delete(f"/api/products/{acacia}", headers=admin).status_code == 204

        # --- orders: create reserves stock ---
        mountain = next(p for p in products if p["variety"] == "Горный" and p["weight_g"] == 1000)
        before = stock(c, mountain["id"])
        order_body = {
            "items": [{"product_id": mountain["id"], "quantity": 2}],
            "customer_name": "Алия", "phone": "+77011234567", "address": "Талдыкорган", "delivery": "post",
        }
        assert c.post("/api/orders", json=order_body).status_code == 401
        too_many = {**order_body, "items": [{"product_id": mountain["id"], "quantity": before + 1}]}
        assert c.post("/api/orders", headers=aliya, json=too_many).status_code == 400
        assert c.post("/api/orders", headers=aliya, json={**order_body, "address": ""}).status_code == 400
        r = c.post("/api/orders", headers=aliya, json=order_body)
        assert r.status_code == 201, r.text
        order = r.json()
        assert order["items_total"] == 2 * mountain["price"] and order["delivery_price"] == 1500
        assert stock(c, mountain["id"]) == before - 2

        # read: own orders only
        assert len(c.get("/api/orders", headers=aliya).json()) == 1
        demo = auth(c, "demo", "demo123")
        assert c.get(f"/api/orders/{order['id']}", headers=demo).status_code == 404

        # update: change quantity -> stock is recalculated; enough for free delivery
        r = c.put(f"/api/orders/{order['id']}", headers=aliya,
                  json={"items": [{"product_id": mountain["id"], "quantity": 3}], "delivery": "courier"})
        assert r.status_code == 200, r.text
        assert r.json()["delivery_price"] == 0  # 3 * 7500 >= 20000
        assert stock(c, mountain["id"]) == before - 3

        # buyer cannot confirm; admin moves the order along
        assert c.put(f"/api/orders/{order['id']}", headers=aliya, json={"status": "confirmed"}).status_code == 400
        assert c.put(f"/api/orders/{order['id']}", headers=admin, json={"status": "confirmed"}).json()["status"] == "confirmed"
        assert c.put(f"/api/orders/{order['id']}", headers=aliya, json={"comment": "x"}).status_code == 400
        assert c.delete(f"/api/orders/{order['id']}", headers=aliya).status_code == 400
        assert c.put(f"/api/orders/{order['id']}", headers=admin, json={"status": "delivered"}).status_code == 400
        assert c.put(f"/api/orders/{order['id']}", headers=admin, json={"status": "shipped"}).status_code == 200
        assert c.put(f"/api/orders/{order['id']}", headers=admin, json={"status": "delivered"}).status_code == 200

        # cancel returns stock, then the buyer deletes the cancelled order
        r = c.post("/api/orders", headers=aliya, json={**order_body, "delivery": "pickup", "address": ""})
        second = r.json()
        assert second["delivery_price"] == 0
        assert c.put(f"/api/orders/{second['id']}", headers=aliya, json={"status": "cancelled"}).status_code == 200
        assert stock(c, mountain["id"]) == before - 3
        assert c.delete(f"/api/orders/{second['id']}", headers=aliya).status_code == 204

        # --- admin ---
        assert c.get("/api/admin/stats", headers=aliya).status_code == 403
        stats = c.get("/api/admin/stats", headers=admin).json()
        assert stats["orders"] == 2 and stats["orders_by_status"]["delivered"] == 2
        assert stats["honey_sold_kg"] == 5.0  # seeded 2 kg + 3 kg
        users = c.get("/api/admin/users", headers=admin).json()
        aliya_id = next(u["id"] for u in users if u["username"] == "aliya")
        assert c.patch(f"/api/admin/users/{aliya_id}", headers=admin, json={"is_active": False}).status_code == 200
        assert c.get("/api/auth/me", headers=aliya).status_code == 401
        assert c.delete(f"/api/admin/users/{aliya_id}", headers=admin).status_code == 204
