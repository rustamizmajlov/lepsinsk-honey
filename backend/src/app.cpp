#include "app.hpp"

#include <cctype>
#include <ctime>
#include <iostream>

Handler guarded(App& app, Handler handler) {
    return [&app, handler](const Request& req, Response& res) {
        std::lock_guard<std::mutex> lock(app.db.lock);
        try {
            handler(req, res);
        } catch (const ApiError& e) {
            send_json(res, {{"detail", e.what()}}, e.status);
        } catch (const std::exception& e) {
            std::cerr << "Error: " << e.what() << "\n";
            send_json(res, {{"detail", "Внутренняя ошибка сервера"}}, 500);
        }
    };
}

void send_json(Response& res, const json& body, int status) {
    res.status = status;
    res.set_content(body.dump(), "application/json; charset=utf-8");
}

json parse_body(const Request& req) {
    json body = json::parse(req.body, nullptr, false);
    if (body.is_discarded() || !body.is_object()) throw ApiError(400, "Ожидается JSON-объект");
    return body;
}

std::string now_iso() {
    std::time_t t = std::time(nullptr);
    char buf[32];
    std::strftime(buf, sizeof buf, "%Y-%m-%dT%H:%M:%SZ", std::gmtime(&t));
    return buf;
}

long long now_seconds() { return static_cast<long long>(std::time(nullptr)); }

int to_int(const std::string& value) { return value.empty() ? 0 : std::stoi(value); }

std::string utf8_lower(const std::string& text) {
    std::string out;
    for (size_t i = 0; i < text.size(); ++i) {
        unsigned char c = text[i];
        if (c < 0x80) {
            out += static_cast<char>(std::tolower(c));
        } else if (c == 0xD0 && i + 1 < text.size()) {
            unsigned char n = text[++i];
            if (n >= 0x90 && n <= 0x9F) { out += '\xD0'; out += static_cast<char>(n + 0x20); }       // А–П
            else if (n >= 0xA0 && n <= 0xAF) { out += '\xD1'; out += static_cast<char>(n - 0x20); }  // Р–Я
            else if (n == 0x81) { out += '\xD1'; out += '\x91'; }                                     // Ё
            else { out += static_cast<char>(c); out += static_cast<char>(n); }
        } else {
            out += static_cast<char>(c);
        }
    }
    return out;
}

bool contains_ci(const std::string& text, const std::string& needle) {
    return utf8_lower(text).find(utf8_lower(needle)) != std::string::npos;
}

// ---------- авторизация ----------
std::optional<Row> optional_user(App& app, const Request& req) {
    std::string header = req.get_header_value("Authorization");
    const std::string prefix = "Bearer ";
    if (header.rfind(prefix, 0) != 0) return std::nullopt;
    std::string token = header.substr(prefix.size());
    Rows rows = app.db.query(
        "SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?", {token});
    if (rows.empty()) return std::nullopt;
    Row user = rows[0];
    if (std::stoll(user["expires_at"]) < now_seconds()) {
        app.db.exec("DELETE FROM sessions WHERE token = ?", {token});
        return std::nullopt;
    }
    if (user["is_active"] != "1") return std::nullopt;
    return user;
}

Row current_user(App& app, const Request& req) {
    auto user = optional_user(app, req);
    if (!user) throw ApiError(401, "Требуется вход в аккаунт");
    return *user;
}

void require_admin(const Row& user) {
    if (!is_admin(user)) throw ApiError(403, "Доступно только пасечнику (администратору)");
}

// ---------- проверка полей ----------
std::optional<std::string> get_text(const json& body, const std::string& key, size_t min_len, size_t max_len,
                                    bool required) {
    if (!body.contains(key) || body[key].is_null()) {
        if (required) throw ApiError(422, "Не заполнено поле «" + key + "»");
        return std::nullopt;
    }
    if (!body[key].is_string()) throw ApiError(422, "Поле «" + key + "» должно быть строкой");
    std::string value = body[key];
    // длину считаем в символах, а не в байтах UTF-8
    size_t chars = 0;
    for (unsigned char c : value) chars += (c & 0xC0) != 0x80;
    if (chars < min_len) throw ApiError(422, "Поле «" + key + "» слишком короткое (минимум " + std::to_string(min_len) + ")");
    if (chars > max_len) throw ApiError(422, "Поле «" + key + "» слишком длинное (максимум " + std::to_string(max_len) + ")");
    return value;
}

std::optional<int> get_number(const json& body, const std::string& key, int min, int max, bool required) {
    if (!body.contains(key) || body[key].is_null()) {
        if (required) throw ApiError(422, "Не заполнено поле «" + key + "»");
        return std::nullopt;
    }
    if (!body[key].is_number_integer()) throw ApiError(422, "Поле «" + key + "» должно быть целым числом");
    long long value = body[key];
    if (value < min || value > max) {
        throw ApiError(422, "Поле «" + key + "» должно быть от " + std::to_string(min) + " до " + std::to_string(max));
    }
    return static_cast<int>(value);
}

std::optional<bool> get_flag(const json& body, const std::string& key) {
    if (!body.contains(key) || body[key].is_null()) return std::nullopt;
    if (!body[key].is_boolean()) throw ApiError(422, "Поле «" + key + "» должно быть true или false");
    return body[key].get<bool>();
}

// ---------- JSON-представления ----------
json user_json(const Row& u) {
    return {{"id", to_int(u.at("id"))},           {"username", u.at("username")}, {"email", u.at("email")},
            {"role", u.at("role")},               {"full_name", u.at("full_name")}, {"phone", u.at("phone")},
            {"address", u.at("address")},         {"is_active", u.at("is_active") == "1"},
            {"created_at", u.at("created_at")}};
}

json product_json(const Row& p) {
    json j = {{"id", to_int(p.at("id"))}, {"name", p.at("name")}, {"variety", p.at("variety")},
              {"description", p.at("description")}, {"taste", p.at("taste")}, {"color", p.at("color")},
              {"is_active", p.at("is_active") == "1"}, {"created_at", p.at("created_at")},
              {"updated_at", p.at("updated_at")}};
    for (const char* key : {"weight_g", "price", "stock", "harvest_year", "altitude_m", "sweetness", "intensity"}) {
        j[key] = to_int(p.at(key));
    }
    return j;
}

json order_json(App& app, const Row& o) {
    json items = json::array();
    for (const Row& i : app.db.query("SELECT * FROM order_items WHERE order_id = ? ORDER BY id", {o.at("id")})) {
        items.push_back({{"product_id", i.at("product_id").empty() ? json(nullptr) : json(to_int(i.at("product_id")))},
                         {"product_name", i.at("product_name")},
                         {"price", to_int(i.at("price"))},
                         {"quantity", to_int(i.at("quantity"))}});
    }
    Rows owner = app.db.query("SELECT username FROM users WHERE id = ?", {o.at("user_id")});
    int items_total = to_int(o.at("items_total"));
    int delivery_price = to_int(o.at("delivery_price"));
    return {{"id", to_int(o.at("id"))},
            {"username", owner.empty() ? "" : owner[0].at("username")},
            {"status", o.at("status")},
            {"customer_name", o.at("customer_name")},
            {"phone", o.at("phone")},
            {"address", o.at("address")},
            {"delivery", o.at("delivery")},
            {"comment", o.at("comment")},
            {"items", items},
            {"items_total", items_total},
            {"delivery_price", delivery_price},
            {"total", items_total + delivery_price},
            {"created_at", o.at("created_at")},
            {"updated_at", o.at("updated_at")}};
}
