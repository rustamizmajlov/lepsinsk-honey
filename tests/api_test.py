"""Сквозной тест API: отправляет HTTP-запросы к запущенному C++ серверу.

Сервер нужно запустить на чистой базе, например:
    set DB_PATH=test.db & set PORT=8099 & backend\\build\\honey-server.exe
    python tests/api_test.py http://localhost:8099

Нужен только Python 3 — сторонние библиотеки не используются.
"""
import json
import sys
import urllib.error
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8099"


def call(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + "/api" + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read()
        return e.code, json.loads(raw) if raw else None


def login(username, password):
    code, body = call("POST", "/auth/login", {"username": username, "password": password})
    assert code == 200, body
    return body["access_token"]


def stock(product_id):
    return call("GET", f"/products/{product_id}")[1]["stock"]


def main():
    assert call("GET", "/health") == (200, {"status": "ok"})

    # --- авторизация ---
    code, user = call("POST", "/auth/register", {"username": "aliya", "email": "aliya@example.com",
                                                 "password": "secret1", "full_name": "Алия"})
    assert code == 201 and user["role"] == "user", user
    assert call("POST", "/auth/register", {"username": "aliya", "email": "x@example.com", "password": "secret1"})[0] == 409
    assert call("POST", "/auth/register", {"username": "bad name", "email": "y@example.com", "password": "secret1"})[0] == 422
    assert call("POST", "/auth/login", {"username": "aliya", "password": "wrong"})[0] == 401
    aliya, admin = login("aliya", "secret1"), login("admin", "admin12345")
    assert call("GET", "/auth/me")[0] == 401
    code, me = call("PATCH", "/auth/me", {"phone": "+77011234567", "address": "Талдыкорган"}, aliya)
    assert me["phone"] == "+77011234567" and me["address"] == "Талдыкорган"

    # --- товары: читают все, меняет только администратор ---
    products = call("GET", "/products")[1]
    assert len(products) == 8
    assert "Горный" in call("GET", "/products/varieties")[1]
    assert len(call("GET", "/products?q=%D0%94%D0%9E%D0%9D%D0%9D%D0%98%D0%9A")[1]) == 1  # «ДОННИК» в другом регистре
    assert all(p["price"] <= 5000 for p in call("GET", "/products?max_price=5000")[1])
    new = {"name": "Акациевый", "variety": "Луговой", "price": 6800, "stock": 5}
    assert call("POST", "/products", new, aliya)[0] == 403
    code, acacia = call("POST", "/products", new, admin)
    assert code == 201 and acacia["weight_g"] == 1000, acacia
    assert call("PUT", f"/products/{acacia['id']}", {"price": 7000}, admin)[1]["price"] == 7000
    assert call("PUT", f"/products/{acacia['id']}", {"color": "red"}, admin)[0] == 422
    assert call("PUT", f"/products/{acacia['id']}", {"is_active": False}, admin)[0] == 200
    assert call("GET", f"/products/{acacia['id']}")[0] == 404
    assert call("GET", f"/products/{acacia['id']}", token=admin)[0] == 200
    assert call("DELETE", f"/products/{acacia['id']}", token=admin)[0] == 204

    # --- заказы: оформление резервирует товар ---
    mountain = next(p for p in products if p["variety"] == "Горный" and p["weight_g"] == 1000)
    before = stock(mountain["id"])
    order_body = {"items": [{"product_id": mountain["id"], "quantity": 2}], "customer_name": "Алия",
                  "phone": "+77011234567", "address": "Талдыкорган", "delivery": "post"}
    assert call("POST", "/orders", order_body)[0] == 401
    too_many = {**order_body, "items": [{"product_id": mountain["id"], "quantity": before + 1}]}
    assert call("POST", "/orders", too_many, aliya)[0] == 400
    assert stock(mountain["id"]) == before  # неудачный заказ ничего не списал
    assert call("POST", "/orders", {**order_body, "address": ""}, aliya)[0] == 400
    code, order = call("POST", "/orders", order_body, aliya)
    assert code == 201, order
    assert order["items_total"] == 2 * mountain["price"] and order["delivery_price"] == 1500
    assert stock(mountain["id"]) == before - 2

    assert len(call("GET", "/orders", token=aliya)[1]) == 1
    demo = login("demo", "demo123")
    assert call("GET", f"/orders/{order['id']}", token=demo)[0] == 404

    # изменение: 3 банки -> остаток пересчитан, сумма >= 20 000 ₸ -> доставка бесплатная
    code, upd = call("PUT", f"/orders/{order['id']}",
                     {"items": [{"product_id": mountain["id"], "quantity": 3}], "delivery": "courier"}, aliya)
    assert code == 200 and upd["delivery_price"] == 0, upd
    assert stock(mountain["id"]) == before - 3

    # статусы
    oid = order["id"]
    assert call("PUT", f"/orders/{oid}", {"status": "confirmed"}, aliya)[0] == 400
    assert call("PUT", f"/orders/{oid}", {"status": "confirmed"}, admin)[1]["status"] == "confirmed"
    assert call("PUT", f"/orders/{oid}", {"comment": "x"}, aliya)[0] == 400
    assert call("DELETE", f"/orders/{oid}", token=aliya)[0] == 400
    assert call("PUT", f"/orders/{oid}", {"status": "delivered"}, admin)[0] == 400
    assert call("PUT", f"/orders/{oid}", {"status": "shipped"}, admin)[0] == 200
    assert call("PUT", f"/orders/{oid}", {"status": "delivered"}, admin)[0] == 200

    # отмена возвращает товар, потом отменённый заказ можно удалить
    code, second = call("POST", "/orders", {**order_body, "delivery": "pickup", "address": ""}, aliya)
    assert code == 201 and second["delivery_price"] == 0
    assert call("PUT", f"/orders/{second['id']}", {"status": "cancelled"}, aliya)[0] == 200
    assert stock(mountain["id"]) == before - 3
    assert call("DELETE", f"/orders/{second['id']}", token=aliya)[0] == 204

    # --- администратор ---
    assert call("GET", "/admin/stats", token=aliya)[0] == 403
    stats = call("GET", "/admin/stats", token=admin)[1]
    assert stats["orders"] == 2 and stats["orders_by_status"]["delivered"] == 2, stats
    assert stats["honey_sold_kg"] == 5.0, stats  # демо-заказ 2 кг + 3 кг
    users = call("GET", "/admin/users", token=admin)[1]
    aliya_id = next(u["id"] for u in users if u["username"] == "aliya")
    assert call("PATCH", f"/admin/users/{aliya_id}", {"is_active": False}, admin)[0] == 200
    assert call("GET", "/auth/me", token=aliya)[0] == 401
    assert call("DELETE", f"/admin/users/{aliya_id}", token=admin)[0] == 204

    # выход: токен перестаёт работать
    assert call("POST", "/auth/logout", token=demo)[0] == 204
    assert call("GET", "/auth/me", token=demo)[0] == 401
    print("OK: все проверки пройдены")


if __name__ == "__main__":
    main()
