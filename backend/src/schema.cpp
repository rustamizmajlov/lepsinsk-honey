// Создание таблиц и демо-данные при первом запуске
#include <iostream>

#include "app.hpp"
#include "security.hpp"

void create_tables(Database& db) {
    const std::string id = db.id_column();
    const std::string tables[] = {
        "CREATE TABLE IF NOT EXISTS users ("
        " id " + id + ","
        " username VARCHAR(50) NOT NULL UNIQUE,"
        " email VARCHAR(255) NOT NULL UNIQUE,"
        " password_hash VARCHAR(255) NOT NULL,"
        " role VARCHAR(10) NOT NULL DEFAULT 'user',"
        " full_name VARCHAR(120) NOT NULL DEFAULT '',"
        " phone VARCHAR(30) NOT NULL DEFAULT '',"
        " address VARCHAR(300) NOT NULL DEFAULT '',"
        " is_active INTEGER NOT NULL DEFAULT 1,"
        " created_at VARCHAR(25) NOT NULL)",

        "CREATE TABLE IF NOT EXISTS sessions ("
        " token VARCHAR(64) PRIMARY KEY,"
        " user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,"
        " expires_at BIGINT NOT NULL)",

        "CREATE TABLE IF NOT EXISTS products ("
        " id " + id + ","
        " name VARCHAR(120) NOT NULL,"
        " variety VARCHAR(50) NOT NULL,"
        " description TEXT NOT NULL DEFAULT '',"
        " taste VARCHAR(200) NOT NULL DEFAULT '',"
        " color VARCHAR(7) NOT NULL DEFAULT '#E9A23B',"
        " weight_g INTEGER NOT NULL,"
        " price INTEGER NOT NULL,"
        " stock INTEGER NOT NULL,"
        " harvest_year INTEGER NOT NULL,"
        " altitude_m INTEGER NOT NULL,"
        " sweetness INTEGER NOT NULL,"
        " intensity INTEGER NOT NULL,"
        " is_active INTEGER NOT NULL DEFAULT 1,"
        " created_at VARCHAR(25) NOT NULL,"
        " updated_at VARCHAR(25) NOT NULL)",

        "CREATE TABLE IF NOT EXISTS orders ("
        " id " + id + ","
        " user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,"
        " status VARCHAR(20) NOT NULL DEFAULT 'new',"
        " customer_name VARCHAR(120) NOT NULL,"
        " phone VARCHAR(30) NOT NULL,"
        " address VARCHAR(300) NOT NULL DEFAULT '',"
        " delivery VARCHAR(20) NOT NULL,"
        " comment TEXT NOT NULL DEFAULT '',"
        " items_total INTEGER NOT NULL DEFAULT 0,"
        " delivery_price INTEGER NOT NULL DEFAULT 0,"
        " created_at VARCHAR(25) NOT NULL,"
        " updated_at VARCHAR(25) NOT NULL)",

        "CREATE TABLE IF NOT EXISTS order_items ("
        " id " + id + ","
        " order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,"
        " product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,"
        " product_name VARCHAR(120) NOT NULL,"
        " price INTEGER NOT NULL,"
        " quantity INTEGER NOT NULL)",
    };
    for (const auto& sql : tables) db.exec(sql);
}

namespace {

struct DemoProduct {
    const char *name, *variety, *taste, *color;
    int weight_g, price, stock, altitude_m, sweetness, intensity;
    const char* description;
};

const DemoProduct DEMO_PRODUCTS[] = {
    {"Горный «Джунгарский»", "Горный", "густой, пряный, с долгим травяным послевкусием", "#D98E2B",
     1000, 7500, 25, 1800, 3, 5,
     "Собран на альпийских лугах Джунгарского Алатау выше села. Тёмно-янтарный, медленно кристаллизуется "
     "в плотную мелкозернистую массу."},
    {"Разнотравье «Лепсинские луга»", "Луговой", "мягкий цветочный, с нотами клевера и душицы", "#EDB547",
     1000, 5500, 40, 1100, 4, 3,
     "Классический летний мёд с цветущих лугов вдоль реки Лепсы. Подходит к чаю на каждый день."},
    {"Донниковый", "Луговой", "нежный, ванильный, почти без горчинки", "#F3DE9A",
     1000, 6000, 18, 900, 5, 1,
     "Очень светлый мёд с донника. Кристаллизуется в белую кремообразную массу — любимец детей."},
    {"Эспарцетовый", "Луговой", "лёгкий, освежающий, с розовым ароматом", "#F1CF73",
     1000, 6200, 15, 1000, 4, 2,
     "Редкий светлый мёд с эспарцета. Долго остаётся жидким и прозрачным."},
    {"Кипрейный (иван-чай)", "Горный", "сливочный, тонкий, с лёгкой кислинкой", "#F5E7BD",
     500, 4200, 12, 1600, 4, 2,
     "Кипрей цветёт на горных полянах в июле. Мёд быстро садится в «сливочную» нежную текстуру."},
    {"Мёд в сотах", "Соты", "живой вкус воска и свежего цветочного нектара", "#E0A13A",
     400, 5000, 8, 1300, 4, 3,
     "Рамка запечатанных сот прямо с пасеки — мёд, который не касался ни насоса, ни банки."},
    {"Мёд с прополисом", "Продукты пчеловодства", "терпкий, смолистый, слегка щиплет язык", "#B8752A",
     500, 4800, 4, 1100, 2, 5,
     "Луговой мёд, смешанный с прополисом. Хорош осенью и зимой, к горячему чаю."},
    {"Перга", "Продукты пчеловодства", "кисло-сладкая, с хлебными нотами", "#8C5A2B",
     100, 3500, 3, 1100, 2, 4,
     "«Пчелиный хлеб» — цветочная пыльца, законсервированная пчёлами в сотах. Принимают по чайной ложке."},
};

}  // namespace

void seed(App& app) {
    Database& db = app.db;
    std::string now = now_iso();
    if (db.query("SELECT id FROM users WHERE username = ?", {app.cfg.admin_username}).empty()) {
        db.exec("INSERT INTO users (username, email, password_hash, role, full_name, created_at) "
                "VALUES (?, ?, ?, 'admin', 'Пасечник', ?)",
                {app.cfg.admin_username, app.cfg.admin_email, security::hash_password(app.cfg.admin_password), now});
        std::cout << "Created admin user '" << app.cfg.admin_username << "'\n";
    }
    if (!app.cfg.seed_demo || !db.query("SELECT id FROM products").empty()) return;

    Transaction tx(db);
    std::vector<std::string> ids;
    for (const auto& p : DEMO_PRODUCTS) {
        ids.push_back(std::to_string(db.insert(
            "INSERT INTO products (name, variety, description, taste, color, weight_g, price, stock, harvest_year, "
            "altitude_m, sweetness, intensity, is_active, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, '2026', ?, ?, ?, 1, ?, ?)",
            {p.name, p.variety, p.description, p.taste, p.color, std::to_string(p.weight_g), std::to_string(p.price),
             std::to_string(p.stock), std::to_string(p.altitude_m), std::to_string(p.sweetness),
             std::to_string(p.intensity), now, now})));
    }
    std::string buyer = std::to_string(db.insert(
        "INSERT INTO users (username, email, password_hash, role, full_name, phone, address, created_at) "
        "VALUES ('demo', 'demo@lepsinsk-honey.kz', ?, 'user', 'Демо Покупатель', '+7 700 000 00 00', "
        "'г. Алматы, ул. Примерная, 1', ?)",
        {security::hash_password("demo123"), now}));
    // один доставленный заказ, чтобы панель администратора не была пустой
    std::string order = std::to_string(db.insert(
        "INSERT INTO orders (user_id, status, customer_name, phone, address, delivery, comment, items_total, "
        "delivery_price, created_at, updated_at) VALUES (?, 'delivered', 'Демо Покупатель', '+7 700 000 00 00', "
        "'г. Алматы, ул. Примерная, 1', 'post', '', 13000, 1500, ?, ?)",
        {buyer, now, now}));
    db.exec("INSERT INTO order_items (order_id, product_id, product_name, price, quantity) VALUES (?, ?, ?, 7500, 1)",
            {order, ids[0], DEMO_PRODUCTS[0].name});
    db.exec("INSERT INTO order_items (order_id, product_id, product_name, price, quantity) VALUES (?, ?, ?, 5500, 1)",
            {order, ids[1], DEMO_PRODUCTS[1].name});
    tx.commit();
    std::cout << "Added demo data: 8 products, user 'demo', 1 order\n";
}
