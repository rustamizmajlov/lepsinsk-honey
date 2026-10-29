// Товары — бизнес-сущность №1 (CRUD). Читать могут все, изменять — только администратор.
#include <regex>

#include "app.hpp"

namespace {

struct NumberField {
    const char* name;
    int min, max, fallback;
};

// Числовые поля товара: имя, допустимый диапазон и значение по умолчанию
const NumberField NUMBER_FIELDS[] = {
    {"weight_g", 10, 10000, 1000},     {"price", 1, 1000000, 0},      {"stock", 0, 100000, 0},
    {"harvest_year", 2000, 2100, 2026}, {"altitude_m", 0, 5000, 1000}, {"sweetness", 1, 5, 3},
    {"intensity", 1, 5, 3},
};

// Проверяет поля товара и возвращает пары «колонка → значение».
// partial = true — для изменения: берутся только присланные поля.
std::map<std::string, std::string> product_fields(const json& body, bool partial) {
    std::map<std::string, std::string> f;
    bool required = !partial;
    if (auto v = get_text(body, "name", 2, 120, required)) f["name"] = *v;
    if (auto v = get_text(body, "variety", 2, 50, required)) f["variety"] = *v;
    if (auto v = get_text(body, "description", 0, 3000, false)) f["description"] = *v;
    if (auto v = get_text(body, "taste", 0, 200, false)) f["taste"] = *v;
    if (auto v = get_text(body, "color", 7, 7, false)) {
        static const std::regex hex("#[0-9A-Fa-f]{6}");
        if (!std::regex_match(*v, hex)) throw ApiError(422, "Цвет должен быть в формате #RRGGBB");
        f["color"] = *v;
    }
    for (const auto& n : NUMBER_FIELDS) {
        bool must = required && std::string(n.name) == "price";
        if (auto v = get_number(body, n.name, n.min, n.max, must)) f[n.name] = std::to_string(*v);
        else if (!partial) f[n.name] = std::to_string(n.fallback);
    }
    if (auto v = get_flag(body, "is_active")) f["is_active"] = *v ? "1" : "0";
    if (!partial) {
        f.try_emplace("description", "");
        f.try_emplace("taste", "");
        f.try_emplace("color", "#E9A23B");
        f.try_emplace("is_active", "1");
    }
    return f;
}

Row find_product(App& app, const std::string& id) {
    Rows rows = app.db.query("SELECT * FROM products WHERE id = ?", {id});
    if (rows.empty()) throw ApiError(404, "Товар не найден");
    return rows[0];
}

}  // namespace

void register_products(httplib::Server& srv, App& app) {
    // Read: список с фильтрами
    srv.Get("/api/products", guarded(app, [&app](const Request& req, Response& res) {
        auto user = optional_user(app, req);
        bool show_hidden = req.get_param_value("include_inactive") == "true" && user && is_admin(*user);
        std::string sql = "SELECT * FROM products WHERE 1 = 1";
        Params params;
        if (!show_hidden) sql += " AND is_active = 1";
        if (req.has_param("min_price")) { sql += " AND price >= ?"; params.push_back(std::to_string(to_int(req.get_param_value("min_price")))); }
        if (req.has_param("max_price")) { sql += " AND price <= ?"; params.push_back(std::to_string(to_int(req.get_param_value("max_price")))); }
        if (req.get_param_value("in_stock") == "true") sql += " AND stock > 0";
        std::string sort = req.get_param_value("sort");
        if (sort == "price_asc") sql += " ORDER BY price ASC, id";
        else if (sort == "price_desc") sql += " ORDER BY price DESC, id";
        else if (sort == "new") sql += " ORDER BY created_at DESC, id DESC";
        else sql += " ORDER BY name, id";

        // поиск по тексту делаем в C++, чтобы он одинаково работал с кириллицей в SQLite и PostgreSQL
        std::string q = req.get_param_value("q");
        std::string variety = req.get_param_value("variety");
        json list = json::array();
        for (const Row& p : app.db.query(sql, params)) {
            if (!variety.empty() && utf8_lower(p.at("variety")) != utf8_lower(variety)) continue;
            if (!q.empty() && !contains_ci(p.at("name"), q) && !contains_ci(p.at("description"), q) &&
                !contains_ci(p.at("taste"), q)) continue;
            list.push_back(product_json(p));
        }
        send_json(res, list);
    }));

    srv.Get("/api/products/varieties", guarded(app, [&app](const Request&, Response& res) {
        json list = json::array();
        for (const Row& r : app.db.query("SELECT DISTINCT variety FROM products WHERE is_active = 1 ORDER BY variety")) {
            list.push_back(r.at("variety"));
        }
        send_json(res, list);
    }));

    // Read: один товар
    srv.Get(R"(/api/products/(\d+))", guarded(app, [&app](const Request& req, Response& res) {
        Row p = find_product(app, req.matches[1]);
        auto user = optional_user(app, req);
        if (p["is_active"] != "1" && !(user && is_admin(*user))) throw ApiError(404, "Товар не найден");
        send_json(res, product_json(p));
    }));

    // Create
    srv.Post("/api/products", guarded(app, [&app](const Request& req, Response& res) {
        require_admin(current_user(app, req));
        auto f = product_fields(parse_body(req), false);
        std::string now = now_iso();
        long long id = app.db.insert(
            "INSERT INTO products (name, variety, description, taste, color, weight_g, price, stock, harvest_year, "
            "altitude_m, sweetness, intensity, is_active, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            {f["name"], f["variety"], f["description"], f["taste"], f["color"], f["weight_g"], f["price"], f["stock"],
             f["harvest_year"], f["altitude_m"], f["sweetness"], f["intensity"], f["is_active"], now, now});
        send_json(res, product_json(find_product(app, std::to_string(id))), 201);
    }));

    // Update: меняются только присланные поля
    srv.Put(R"(/api/products/(\d+))", guarded(app, [&app](const Request& req, Response& res) {
        require_admin(current_user(app, req));
        std::string id = req.matches[1];
        find_product(app, id);
        for (const auto& [column, value] : product_fields(parse_body(req), true)) {
            // имя колонки берётся из нашего списка полей, а не из запроса, поэтому вставлять его в SQL безопасно
            app.db.exec("UPDATE products SET " + column + " = ? WHERE id = ?", {value, id});
        }
        app.db.exec("UPDATE products SET updated_at = ? WHERE id = ?", {now_iso(), id});
        send_json(res, product_json(find_product(app, id)));
    }));

    // Delete: в старых заказах товар остаётся под своим названием
    srv.Delete(R"(/api/products/(\d+))", guarded(app, [&app](const Request& req, Response& res) {
        require_admin(current_user(app, req));
        std::string id = req.matches[1];
        find_product(app, id);
        app.db.exec("UPDATE order_items SET product_id = NULL WHERE product_id = ?", {id});
        app.db.exec("DELETE FROM products WHERE id = ?", {id});
        res.status = 204;
    }));
}
