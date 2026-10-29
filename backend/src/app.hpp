#pragma once
// Общие типы и помощники для всех маршрутов сервера
#include <functional>
#include <map>
#include <optional>
#include <stdexcept>
#include <string>

#include "db.hpp"
#include "httplib.h"
#include "json.hpp"

using json = nlohmann::json;
using httplib::Request;
using httplib::Response;

struct Config {
    std::string host = "0.0.0.0";
    int port = 8000;
    std::string static_dir;  // папка с интерфейсом; пусто — интерфейс отдаёт nginx
    std::string admin_username = "admin";
    std::string admin_email = "admin@lepsinsk-honey.kz";
    std::string admin_password = "admin12345";
    bool seed_demo = true;
    int free_delivery_from = 20000;  // от этой суммы доставка бесплатная, ₸
    std::map<std::string, int> delivery_prices = {{"pickup", 0}, {"post", 1500}, {"courier", 2500}};
};

struct App {
    Database& db;
    Config cfg;
};

// Ошибка, которая превращается в HTTP-ответ {"detail": "..."} с нужным кодом
struct ApiError : std::runtime_error {
    int status;
    ApiError(int status, const std::string& message) : std::runtime_error(message), status(status) {}
};

using Handler = std::function<void(const Request&, Response&)>;

// Обёртка для каждого маршрута: берёт замок базы и превращает исключения в JSON-ошибки
Handler guarded(App& app, Handler handler);

void send_json(Response& res, const json& body, int status = 200);
json parse_body(const Request& req);
std::string now_iso();
long long now_seconds();
int to_int(const std::string& value);
std::string utf8_lower(const std::string& text);  // нижний регистр для латиницы и кириллицы
bool contains_ci(const std::string& text, const std::string& needle);

// Авторизация: пользователь по токену из заголовка "Authorization: Bearer <токен>"
Row current_user(App& app, const Request& req);       // 401, если не вошёл
std::optional<Row> optional_user(App& app, const Request& req);
void require_admin(const Row& user);                   // 403, если не администратор
inline bool is_admin(const Row& user) { return user.at("role") == "admin"; }

// Чтение и проверка полей из JSON. Если поля нет и required == false — вернётся std::nullopt
std::optional<std::string> get_text(const json& body, const std::string& key, size_t min_len, size_t max_len,
                                    bool required);
std::optional<int> get_number(const json& body, const std::string& key, int min, int max, bool required);
std::optional<bool> get_flag(const json& body, const std::string& key);

// JSON-представления сущностей
json user_json(const Row& u);
json product_json(const Row& p);
json order_json(App& app, const Row& o);

// Регистрация маршрутов по разделам
void register_auth(httplib::Server& srv, App& app);
void register_products(httplib::Server& srv, App& app);
void register_orders(httplib::Server& srv, App& app);
void register_admin(httplib::Server& srv, App& app);

// Таблицы и демо-данные
void create_tables(Database& db);
void seed(App& app);
