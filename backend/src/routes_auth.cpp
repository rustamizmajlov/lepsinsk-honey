// Регистрация, вход, выход и профиль покупателя
#include <regex>

#include "app.hpp"
#include "security.hpp"

namespace {

const long long SESSION_SECONDS = 7 * 24 * 3600;  // токен действует неделю

void check_email(const std::string& email) {
    static const std::regex pattern(R"([^@\s]+@[^@\s]+\.[^@\s]+)");
    if (!std::regex_match(email, pattern)) throw ApiError(422, "Некорректный email");
}

}  // namespace

void register_auth(httplib::Server& srv, App& app) {
    srv.Post("/api/auth/register", guarded(app, [&app](const Request& req, Response& res) {
        json body = parse_body(req);
        std::string username = *get_text(body, "username", 3, 50, true);
        std::string email = *get_text(body, "email", 3, 255, true);
        std::string password = *get_text(body, "password", 6, 128, true);
        std::string full_name = get_text(body, "full_name", 0, 120, false).value_or("");
        static const std::regex login_pattern("[A-Za-z0-9_.-]+");
        if (!std::regex_match(username, login_pattern)) {
            throw ApiError(422, "Логин: только латиница, цифры и символы _ . -");
        }
        check_email(email);
        if (!app.db.query("SELECT id FROM users WHERE username = ? OR email = ?", {username, email}).empty()) {
            throw ApiError(409, "Имя пользователя или email уже заняты");
        }
        long long id = app.db.insert(
            "INSERT INTO users (username, email, password_hash, role, full_name, created_at) VALUES (?, ?, ?, 'user', ?, ?)",
            {username, email, security::hash_password(password), full_name, now_iso()});
        send_json(res, user_json(app.db.query("SELECT * FROM users WHERE id = ?", {std::to_string(id)})[0]), 201);
    }));

    srv.Post("/api/auth/login", guarded(app, [&app](const Request& req, Response& res) {
        json body = parse_body(req);
        std::string username = get_text(body, "username", 0, 50, true).value();
        std::string password = get_text(body, "password", 0, 128, true).value();
        Rows rows = app.db.query("SELECT * FROM users WHERE username = ?", {username});
        if (rows.empty() || !security::verify_password(password, rows[0]["password_hash"])) {
            throw ApiError(401, "Неверный логин или пароль");
        }
        if (rows[0]["is_active"] != "1") throw ApiError(403, "Аккаунт заблокирован администратором");
        // токен — случайная строка; сервер хранит его в таблице sessions
        std::string token = security::random_hex(32);
        app.db.exec("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
                    {token, rows[0]["id"], std::to_string(now_seconds() + SESSION_SECONDS)});
        send_json(res, {{"access_token", token}, {"token_type", "bearer"}});
    }));

    srv.Post("/api/auth/logout", guarded(app, [&app](const Request& req, Response& res) {
        std::string header = req.get_header_value("Authorization");
        if (header.rfind("Bearer ", 0) == 0) app.db.exec("DELETE FROM sessions WHERE token = ?", {header.substr(7)});
        res.status = 204;
    }));

    srv.Get("/api/auth/me", guarded(app, [&app](const Request& req, Response& res) {
        send_json(res, user_json(current_user(app, req)));
    }));

    srv.Patch("/api/auth/me", guarded(app, [&app](const Request& req, Response& res) {
        Row user = current_user(app, req);
        json body = parse_body(req);
        if (auto email = get_text(body, "email", 3, 255, false); email && *email != user["email"]) {
            check_email(*email);
            if (!app.db.query("SELECT id FROM users WHERE email = ?", {*email}).empty()) {
                throw ApiError(409, "Email уже используется");
            }
            app.db.exec("UPDATE users SET email = ? WHERE id = ?", {*email, user["id"]});
        }
        if (auto v = get_text(body, "full_name", 0, 120, false)) app.db.exec("UPDATE users SET full_name = ? WHERE id = ?", {*v, user["id"]});
        if (auto v = get_text(body, "phone", 0, 30, false)) app.db.exec("UPDATE users SET phone = ? WHERE id = ?", {*v, user["id"]});
        if (auto v = get_text(body, "address", 0, 300, false)) app.db.exec("UPDATE users SET address = ? WHERE id = ?", {*v, user["id"]});
        if (auto v = get_text(body, "password", 6, 128, false)) {
            app.db.exec("UPDATE users SET password_hash = ? WHERE id = ?", {security::hash_password(*v), user["id"]});
        }
        send_json(res, user_json(app.db.query("SELECT * FROM users WHERE id = ?", {user["id"]})[0]));
    }));
}
