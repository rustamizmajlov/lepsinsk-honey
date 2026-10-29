// Заказы — бизнес-сущность №2 (CRUD).
// Покупатель оформляет заказ, видит и меняет только свои заказы; администратор ведёт их по статусам.
#include <set>

#include "app.hpp"

namespace {

// Какие смены статуса разрешены администратору; покупатель может только отменить новый заказ
const std::set<std::pair<std::string, std::string>> ADMIN_TRANSITIONS = {
    {"new", "confirmed"}, {"new", "cancelled"}, {"confirmed", "shipped"}, {"confirmed", "cancelled"},
    {"shipped", "delivered"},
};
const std::set<std::pair<std::string, std::string>> USER_TRANSITIONS = {{"new", "cancelled"}};
const std::set<std::string> STATUSES = {"new", "confirmed", "shipped", "delivered", "cancelled"};

// В этих статусах мёд ещё на складе, поэтому при отмене или удалении он возвращается в остаток
bool reserved(const std::string& status) { return status == "new" || status == "confirmed"; }

struct Line {
    std::string product_id, name;
    int price, quantity;
};

// Проверяет список товаров из запроса: [{"product_id": 1, "quantity": 2}, ...]
std::map<int, int> parse_items(const json& body) {
    if (!body.contains("items") || !body["items"].is_array()) throw ApiError(422, "Не указан состав заказа");
    const json& items = body["items"];
    if (items.empty() || items.size() > 30) throw ApiError(422, "В заказе должно быть от 1 до 30 позиций");
    std::map<int, int> quantities;  // одинаковые товары складываем
    for (const json& item : items) {
        if (!item.is_object()) throw ApiError(422, "Неверный формат позиции заказа");
        int product_id = *get_number(item, "product_id", 1, 2000000000, true);
        quantities[product_id] += *get_number(item, "quantity", 1, 50, true);
    }
    return quantities;
}

// Списывает товары со склада и возвращает строки заказа с зафиксированными названием и ценой
std::vector<Line> reserve(App& app, const std::map<int, int>& quantities) {
    std::vector<Line> lines;
    for (const auto& [product_id, quantity] : quantities) {
        Rows rows = app.db.query("SELECT * FROM products WHERE id = ?", {std::to_string(product_id)});
        if (rows.empty() || rows[0]["is_active"] != "1") {
            throw ApiError(400, "Товар #" + std::to_string(product_id) + " недоступен");
        }
        Row& p = rows[0];
        if (to_int(p["stock"]) < quantity) {
            throw ApiError(400, "«" + p["name"] + "»: в наличии " + p["stock"] + " шт., а заказано " + std::to_string(quantity));
        }
        app.db.exec("UPDATE products SET stock = stock - ? WHERE id = ?", {std::to_string(quantity), p["id"]});
        lines.push_back({p["id"], p["name"], to_int(p["price"]), quantity});
    }
    return lines;
}

void save_lines(App& app, const std::string& order_id, const std::vector<Line>& lines) {
    for (const Line& l : lines) {
        app.db.exec("INSERT INTO order_items (order_id, product_id, product_name, price, quantity) VALUES (?, ?, ?, ?, ?)",
                    {order_id, l.product_id, l.name, std::to_string(l.price), std::to_string(l.quantity)});
    }
}

// Возвращает товары заказа обратно на склад
void release(App& app, const std::string& order_id) {
    for (const Row& i : app.db.query("SELECT product_id, quantity FROM order_items WHERE order_id = ?", {order_id})) {
        if (!i.at("product_id").empty()) {
            app.db.exec("UPDATE products SET stock = stock + ? WHERE id = ?", {i.at("quantity"), i.at("product_id")});
        }
    }
}

// Пересчитывает сумму товаров и стоимость доставки — только на сервере
void recalculate(App& app, const std::string& order_id) {
    Row o = app.db.query("SELECT delivery FROM orders WHERE id = ?", {order_id})[0];
    int items_total = to_int(app.db.query(
        "SELECT COALESCE(SUM(price * quantity), 0) AS total FROM order_items WHERE order_id = ?", {order_id})[0]["total"]);
    int fee = items_total >= app.cfg.free_delivery_from ? 0 : app.cfg.delivery_prices.at(o["delivery"]);
    app.db.exec("UPDATE orders SET items_total = ?, delivery_price = ?, updated_at = ? WHERE id = ?",
                {std::to_string(items_total), std::to_string(fee), now_iso(), order_id});
}

// Заказ по id; чужой заказ для покупателя выглядит как несуществующий
Row find_order(App& app, const std::string& id, const Row& user) {
    Rows rows = app.db.query("SELECT * FROM orders WHERE id = ?", {id});
    if (rows.empty() || (rows[0]["user_id"] != user.at("id") && !is_admin(user))) {
        throw ApiError(404, "Заказ не найден");
    }
    return rows[0];
}

std::optional<std::string> get_delivery(const json& body) {
    auto v = get_text(body, "delivery", 1, 20, false);
    if (v && !(*v == "pickup" || *v == "post" || *v == "courier")) throw ApiError(422, "Неизвестный способ доставки");
    return v;
}

}  // namespace

void register_orders(httplib::Server& srv, App& app) {
    // Read: список заказов (свои; администратор — все)
    srv.Get("/api/orders", guarded(app, [&app](const Request& req, Response& res) {
        Row user = current_user(app, req);
        std::string sql = "SELECT * FROM orders WHERE 1 = 1";
        Params params;
        if (!is_admin(user)) { sql += " AND user_id = ?"; params.push_back(user["id"]); }
        if (req.has_param("status_filter")) { sql += " AND status = ?"; params.push_back(req.get_param_value("status_filter")); }
        json list = json::array();
        for (const Row& o : app.db.query(sql + " ORDER BY created_at DESC, id DESC", params)) list.push_back(order_json(app, o));
        send_json(res, list);
    }));

    // Read: один заказ
    srv.Get(R"(/api/orders/(\d+))", guarded(app, [&app](const Request& req, Response& res) {
        Row user = current_user(app, req);
        send_json(res, order_json(app, find_order(app, req.matches[1], user)));
    }));

    // Create
    srv.Post("/api/orders", guarded(app, [&app](const Request& req, Response& res) {
        Row user = current_user(app, req);
        json body = parse_body(req);
        auto quantities = parse_items(body);
        std::string name = *get_text(body, "customer_name", 2, 120, true);
        std::string phone = *get_text(body, "phone", 5, 30, true);
        std::string address = get_text(body, "address", 0, 300, false).value_or("");
        std::string delivery = get_delivery(body).value_or("post");
        std::string comment = get_text(body, "comment", 0, 1000, false).value_or("");
        if (delivery != "pickup" && address.find_first_not_of(" \t") == std::string::npos) {
            throw ApiError(400, "Укажите адрес доставки");
        }

        Transaction tx(app.db);  // если товара не хватит, списание остатков откатится
        auto lines = reserve(app, quantities);
        std::string now = now_iso();
        long long id = app.db.insert(
            "INSERT INTO orders (user_id, status, customer_name, phone, address, delivery, comment, created_at, updated_at) "
            "VALUES (?, 'new', ?, ?, ?, ?, ?, ?, ?)",
            {user["id"], name, phone, address, delivery, comment, now, now});
        std::string order_id = std::to_string(id);
        save_lines(app, order_id, lines);
        recalculate(app, order_id);
        tx.commit();
        send_json(res, order_json(app, find_order(app, order_id, user)), 201);
    }));

    // Update: состав, контакты, доставка и/или статус
    srv.Put(R"(/api/orders/(\d+))", guarded(app, [&app](const Request& req, Response& res) {
        Row user = current_user(app, req);
        std::string id = req.matches[1];
        Row order = find_order(app, id, user);
        bool admin = is_admin(user);
        json body = parse_body(req);

        std::map<std::string, std::string> changes;
        if (auto v = get_text(body, "customer_name", 2, 120, false)) changes["customer_name"] = *v;
        if (auto v = get_text(body, "phone", 5, 30, false)) changes["phone"] = *v;
        if (auto v = get_text(body, "address", 0, 300, false)) changes["address"] = *v;
        if (auto v = get_text(body, "comment", 0, 1000, false)) changes["comment"] = *v;
        if (auto v = get_delivery(body)) changes["delivery"] = *v;
        bool new_items = body.contains("items");
        auto new_status = get_text(body, "status", 1, 20, false);
        if (new_status && !STATUSES.count(*new_status)) throw ApiError(422, "Неизвестный статус");

        if ((!changes.empty() || new_items) && order["status"] != "new" && !admin) {
            throw ApiError(400, "Изменить можно только новый, ещё не подтверждённый заказ");
        }

        Transaction tx(app.db);
        for (const auto& [column, value] : changes) {
            app.db.exec("UPDATE orders SET " + column + " = ? WHERE id = ?", {value, id});
        }
        if (new_items) {
            if (order["status"] != "new") throw ApiError(400, "Состав меняется только у нового заказа");
            auto quantities = parse_items(body);
            release(app, id);  // старые позиции возвращаем на склад и резервируем новые
            app.db.exec("DELETE FROM order_items WHERE order_id = ?", {id});
            save_lines(app, id, reserve(app, quantities));
        }
        Row updated = app.db.query("SELECT * FROM orders WHERE id = ?", {id})[0];
        if (updated["delivery"] != "pickup" && updated["address"].find_first_not_of(" \t") == std::string::npos) {
            throw ApiError(400, "Укажите адрес доставки");
        }
        if (new_status && *new_status != order["status"]) {
            const auto& allowed = admin ? ADMIN_TRANSITIONS : USER_TRANSITIONS;
            if (!allowed.count({order["status"], *new_status})) {
                throw ApiError(400, "Нельзя перевести заказ из «" + order["status"] + "» в «" + *new_status + "»");
            }
            if (*new_status == "cancelled" && reserved(order["status"])) release(app, id);
            app.db.exec("UPDATE orders SET status = ? WHERE id = ?", {*new_status, id});
        }
        recalculate(app, id);
        tx.commit();
        send_json(res, order_json(app, find_order(app, id, user)));
    }));

    // Delete
    srv.Delete(R"(/api/orders/(\d+))", guarded(app, [&app](const Request& req, Response& res) {
        Row user = current_user(app, req);
        std::string id = req.matches[1];
        Row order = find_order(app, id, user);
        if (!is_admin(user) && order["status"] != "new" && order["status"] != "cancelled") {
            throw ApiError(400, "Удалить можно только новый или отменённый заказ");
        }
        Transaction tx(app.db);
        if (reserved(order["status"])) release(app, id);
        app.db.exec("DELETE FROM order_items WHERE order_id = ?", {id});
        app.db.exec("DELETE FROM orders WHERE id = ?", {id});
        tx.commit();
        res.status = 204;
    }));
}
