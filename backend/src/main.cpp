// Сервер интернет-магазина «Лепсинский мёд»
// Запуск: honey-server (настройки берутся из переменных окружения)
#include <cstdlib>
#include <iostream>

#include "app.hpp"

namespace {

std::string env(const char* name, const std::string& fallback) {
    const char* value = std::getenv(name);
    return value && *value ? value : fallback;
}

Config load_config() {
    Config cfg;
    cfg.host = env("HOST", cfg.host);
    cfg.port = std::stoi(env("PORT", std::to_string(cfg.port)));
    cfg.static_dir = env("STATIC_DIR", "");
    cfg.admin_username = env("ADMIN_USERNAME", cfg.admin_username);
    cfg.admin_email = env("ADMIN_EMAIL", cfg.admin_email);
    cfg.admin_password = env("ADMIN_PASSWORD", cfg.admin_password);
    cfg.seed_demo = env("SEED_DEMO", "true") == "true";
    cfg.free_delivery_from = std::stoi(env("FREE_DELIVERY_FROM", std::to_string(cfg.free_delivery_from)));
    return cfg;
}

}  // namespace

int main() {
    try {
        Config cfg = load_config();
        auto db = open_database();
        App app{*db, cfg};
        create_tables(*db);
        seed(app);

        httplib::Server srv;
        register_auth(srv, app);
        register_products(srv, app);
        register_orders(srv, app);
        register_admin(srv, app);

        srv.Get("/api/health", [](const Request&, Response& res) { send_json(res, {{"status", "ok"}}); });
        srv.Get("/api/settings", [&app](const Request&, Response& res) {
            send_json(res, {{"delivery_prices", app.cfg.delivery_prices},
                            {"free_delivery_from", app.cfg.free_delivery_from}});
        });

        // при запуске без Docker сервер сам отдаёт интерфейс (в Docker это делает nginx)
        if (!cfg.static_dir.empty() && !srv.set_mount_point("/", cfg.static_dir)) {
            std::cerr << "Static folder not found: " << cfg.static_dir << "\n";
        }

        std::cout << "Lepsinsk Honey server: http://" << (cfg.host == "0.0.0.0" ? "localhost" : cfg.host) << ":"
                  << cfg.port << "  (admin / " << cfg.admin_password << ", demo / demo123)\n"
                  << "Press Ctrl+C to stop\n"
                  << std::flush;
        if (!srv.listen(cfg.host, cfg.port)) {
            std::cerr << "Cannot listen on port " << cfg.port << " - is the server already running?\n";
            return 1;
        }
    } catch (const std::exception& e) {
        std::cerr << "Fatal error: " << e.what() << "\n";
        return 1;
    }
    return 0;
}
