// База PostgreSQL через библиотеку libpq, используется в Docker
#ifdef USE_POSTGRES
#include <libpq-fe.h>

#include <chrono>
#include <cstdlib>
#include <iostream>
#include <stdexcept>
#include <thread>

#include "db.hpp"

class PostgresDatabase : public Database {
public:
    explicit PostgresDatabase(const std::string& url) {
        // контейнер с базой может стартовать позже сервера — ждём до минуты
        for (int attempt = 1; attempt <= 30; ++attempt) {
            conn_ = PQconnectdb(url.c_str());
            if (PQstatus(conn_) == CONNECTION_OK) return;
            std::cerr << "PostgreSQL is not ready, attempt " << attempt << "/30\n";
            PQfinish(conn_);
            std::this_thread::sleep_for(std::chrono::seconds(2));
        }
        throw std::runtime_error("Cannot connect to PostgreSQL");
    }

    ~PostgresDatabase() override { PQfinish(conn_); }

    Rows query(const std::string& sql, const Params& params) override {
        std::vector<const char*> values;
        for (const auto& p : params) values.push_back(p.c_str());
        PGresult* res = PQexecParams(conn_, to_postgres(sql).c_str(), static_cast<int>(params.size()),
                                     nullptr, values.data(), nullptr, nullptr, 0);
        ExecStatusType status = PQresultStatus(res);
        if (status != PGRES_TUPLES_OK && status != PGRES_COMMAND_OK) {
            std::string error = PQerrorMessage(conn_);
            PQclear(res);
            throw std::runtime_error("SQL error: " + error);
        }
        Rows rows;
        for (int r = 0; r < PQntuples(res); ++r) {
            Row row;
            for (int c = 0; c < PQnfields(res); ++c) {
                row[PQfname(res, c)] = PQgetisnull(res, r, c) ? "" : PQgetvalue(res, r, c);
            }
            rows.push_back(std::move(row));
        }
        PQclear(res);
        return rows;
    }

    long long insert(const std::string& sql, const Params& params) override {
        Rows rows = query(sql + " RETURNING id", params);
        return std::stoll(rows.at(0).at("id"));
    }

    std::string id_column() const override { return "SERIAL PRIMARY KEY"; }

private:
    // PostgreSQL ждёт параметры в виде $1, $2 … вместо "?"
    static std::string to_postgres(const std::string& sql) {
        std::string out;
        int n = 0;
        for (char ch : sql) {
            if (ch == '?') out += "$" + std::to_string(++n);
            else out += ch;
        }
        return out;
    }

    PGconn* conn_ = nullptr;
};

std::unique_ptr<Database> open_database() {
    const char* url = std::getenv("DATABASE_URL");
    return std::make_unique<PostgresDatabase>(url ? url : "postgresql://honey:honey@db:5432/honey");
}
#endif
