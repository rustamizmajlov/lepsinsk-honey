// База SQLite: один файл honey.db, используется при запуске без Docker
#ifdef USE_SQLITE
#include <cstdlib>
#include <stdexcept>

#include "db.hpp"
#include "sqlite3.h"

class SqliteDatabase : public Database {
public:
    explicit SqliteDatabase(const std::string& path) {
        if (sqlite3_open(path.c_str(), &db_) != SQLITE_OK) {
            throw std::runtime_error("Cannot open SQLite database: " + path);
        }
        exec("PRAGMA foreign_keys = ON");
    }

    ~SqliteDatabase() override { sqlite3_close(db_); }

    Rows query(const std::string& sql, const Params& params) override {
        sqlite3_stmt* stmt = nullptr;
        if (sqlite3_prepare_v2(db_, sql.c_str(), -1, &stmt, nullptr) != SQLITE_OK) {
            throw std::runtime_error(std::string("SQL error: ") + sqlite3_errmsg(db_));
        }
        for (size_t i = 0; i < params.size(); ++i) {
            sqlite3_bind_text(stmt, static_cast<int>(i + 1), params[i].c_str(), -1, SQLITE_TRANSIENT);
        }
        Rows rows;
        int rc;
        while ((rc = sqlite3_step(stmt)) == SQLITE_ROW) {
            Row row;
            for (int c = 0; c < sqlite3_column_count(stmt); ++c) {
                const unsigned char* text = sqlite3_column_text(stmt, c);
                row[sqlite3_column_name(stmt, c)] = text ? reinterpret_cast<const char*>(text) : "";
            }
            rows.push_back(std::move(row));
        }
        std::string error = sqlite3_errmsg(db_);
        sqlite3_finalize(stmt);
        if (rc != SQLITE_DONE) throw std::runtime_error("SQL error: " + error);
        return rows;
    }

    long long insert(const std::string& sql, const Params& params) override {
        query(sql, params);
        return sqlite3_last_insert_rowid(db_);
    }

    std::string id_column() const override { return "INTEGER PRIMARY KEY AUTOINCREMENT"; }

private:
    sqlite3* db_ = nullptr;
};

std::unique_ptr<Database> open_database() {
    const char* path = std::getenv("DB_PATH");
    return std::make_unique<SqliteDatabase>(path ? path : "honey.db");
}
#endif
