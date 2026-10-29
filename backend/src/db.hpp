#pragma once
// Работа с базой данных через общий интерфейс.
// Один и тот же SQL выполняется и в SQLite (локальный запуск), и в PostgreSQL (Docker).
// Параметры в запросах всегда пишутся как "?".
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

using Row = std::map<std::string, std::string>;  // колонка -> значение ("" для NULL)
using Rows = std::vector<Row>;
using Params = std::vector<std::string>;

class Database {
public:
    virtual ~Database() = default;

    // Выполнить запрос и вернуть строки результата
    virtual Rows query(const std::string& sql, const Params& params = {}) = 0;

    // Выполнить INSERT и вернуть id новой строки
    virtual long long insert(const std::string& sql, const Params& params = {}) = 0;

    // Тип колонки для автоинкрементного первичного ключа в CREATE TABLE
    virtual std::string id_column() const = 0;

    void exec(const std::string& sql, const Params& params = {}) { query(sql, params); }

    // Все запросы к серверу выполняются под этим замком по очереди.
    // Поэтому две покупки последней банки не могут пройти одновременно.
    std::mutex lock;
};

// Открывает SQLite или PostgreSQL — в зависимости от флага сборки USE_SQLITE / USE_POSTGRES
std::unique_ptr<Database> open_database();

// Транзакция: если код внутри выбросит исключение, все изменения откатываются
class Transaction {
public:
    explicit Transaction(Database& db) : db_(db) { db_.exec("BEGIN"); }
    ~Transaction() {
        if (!committed_) {
            try { db_.exec("ROLLBACK"); } catch (...) {}
        }
    }
    void commit() {
        db_.exec("COMMIT");
        committed_ = true;
    }

private:
    Database& db_;
    bool committed_ = false;
};
