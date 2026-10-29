// Панель администратора: пользователи и статистика магазина
#include <cmath>

#include "app.hpp"

void register_admin(httplib::Server& srv, App& app) {
    srv.Get("/api/admin/users", guarded(app, [&app](const Request& req, Response& res) {
        require_admin(current_user(app, req));
        std::string q = req.get_param_value("q");
        json list = json::array();
        for (const Row& u : app.db.query("SELECT * FROM users ORDER BY id")) {
            if (q.empty() || contains_ci(u.at("username"), q)) list.push_back(user_json(u));
        }
        send_json(res, list);
    }));

    // Изменить роль или заблокировать
    srv.Patch(R"(/api/admin/users/(\d+))", guarded(app, [&app](const Request& req, Response& res) {
        Row admin = current_user(app, req);
        require_admin(admin);
        std::string id = req.matches[1];
        if (app.db.query("SELECT id FROM users WHERE id = ?", {id}).empty()) throw ApiError(404, "Пользователь не найден");
        json body = parse_body(req);
        auto role = get_text(body, "role", 1, 10, false);
        auto active = get_flag(body, "is_active");
        if (role && *role != "user" && *role != "admin") throw ApiError(422, "Роль может быть только user или admin");
        if (id == admin["id"] && ((role && *role == "user") || (active && !*active))) {
            throw ApiError(400, "Нельзя понизить или заблокировать себя");
        }
        if (role) app.db.exec("UPDATE users SET role = ? WHERE id = ?", {*role, id});
        if (active) {
            app.db.exec("UPDATE users SET is_active = ? WHERE id = ?", {*active ? "1" : "0", id});
            if (!*active) app.db.exec("DELETE FROM sessions WHERE user_id = ?", {id});  // выкидываем из аккаунта
        }
        send_json(res, user_json(app.db.query("SELECT * FROM users WHERE id = ?", {id})[0]));
    }));

    // Удалить пользователя вместе с его заказами
    srv.Delete(R"(/api/admin/users/(\d+))", guarded(app, [&app](const Request& req, Response& res) {
        Row admin = current_user(app, req);
        require_admin(admin);
        std::string id = req.matches[1];
        if (id == admin["id"]) throw ApiError(400, "Нельзя удалить самого себя");
        if (app.db.query("SELECT id FROM users WHERE id = ?", {id}).empty()) throw ApiError(404, "Пользователь не найден");
        Transaction tx(app.db);
        app.db.exec("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id = ?)", {id});
        app.db.exec("DELETE FROM orders WHERE user_id = ?", {id});
        app.db.exec("DELETE FROM sessions WHERE user_id = ?", {id});
        app.db.exec("DELETE FROM users WHERE id = ?", {id});
        tx.commit();
        res.status = 204;
    }));

    srv.Get("/api/admin/stats", guarded(app, [&app](const Request& req, Response& res) {
        require_admin(current_user(app, req));
        auto number = [&app](const std::string& sql) { return std::stoll(app.db.query(sql)[0].at("v")); };

        json by_status = json::object();
        long long orders = 0;
        for (const Row& r : app.db.query("SELECT status, COUNT(*) AS n FROM orders GROUP BY status")) {
            by_status[r.at("status")] = std::stoll(r.at("n"));
            orders += std::stoll(r.at("n"));
        }
        long long grams = number(
            "SELECT COALESCE(SUM(i.quantity * p.weight_g), 0) AS v FROM order_items i "
            "JOIN orders o ON o.id = i.order_id JOIN products p ON p.id = i.product_id WHERE o.status <> 'cancelled'");
        json top = json::array();
        for (const Row& r : app.db.query(
                 "SELECT i.product_name AS name, SUM(i.quantity) AS qty FROM order_items i "
                 "JOIN orders o ON o.id = i.order_id WHERE o.status <> 'cancelled' "
                 "GROUP BY i.product_name ORDER BY qty DESC LIMIT 5")) {
            top.push_back({{"name", r.at("name")}, {"quantity", std::stoll(r.at("qty"))}});
        }
        json low = json::array();
        for (const Row& r : app.db.query("SELECT id, name, stock FROM products WHERE is_active = 1 AND stock < 5 ORDER BY stock")) {
            low.push_back({{"id", to_int(r.at("id"))}, {"name", r.at("name")}, {"stock", to_int(r.at("stock"))}});
        }
        send_json(res, {
            {"users", number("SELECT COUNT(*) AS v FROM users")},
            {"products", number("SELECT COUNT(*) AS v FROM products")},
            {"orders", orders},
            {"orders_by_status", by_status},
            {"revenue", number("SELECT COALESCE(SUM(items_total + delivery_price), 0) AS v FROM orders WHERE status <> 'cancelled'")},
            {"honey_sold_kg", std::round(grams / 100.0) / 10.0},
            {"low_stock", low},
            {"top_products", top},
        });
    }));
}
