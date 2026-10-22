# REST API

Базовый путь — `/api`. Интерактивная документация Swagger доступна по адресу
http://localhost:8080/api/docs после запуска.

Защищённые запросы передают токен в заголовке `Authorization: Bearer <access_token>`.

## Авторизация

| Метод | Путь | Доступ | Описание |
|---|---|---|---|
| POST | `/auth/register` | все | Регистрация `{username, email, password}` |
| POST | `/auth/login` | все | Вход `{username, password}` → `{access_token}` |
| GET | `/auth/me` | user | Текущий пользователь |
| PATCH | `/auth/me` | user | Изменить email, «о себе», пароль |

## Навыки (CRUD №1)

| Метод | Путь | Доступ | Описание |
|---|---|---|---|
| GET | `/skills` | все | Список; фильтры `q`, `category`, `level`, `format`, `owner_id`, `include_inactive`, `limit`, `offset` |
| GET | `/skills/categories` | все | Список категорий |
| GET | `/skills/{id}` | все | Один навык |
| POST | `/skills` | user | Создать навык |
| PUT | `/skills/{id}` | владелец / admin | Изменить навык |
| DELETE | `/skills/{id}` | владелец / admin | Удалить навык |

## Заявки на обмен (CRUD №2)

| Метод | Путь | Доступ | Описание |
|---|---|---|---|
| GET | `/swaps?box=incoming\|outgoing\|all&status_filter=` | user | Свои заявки (admin с `box=all` видит все) |
| GET | `/swaps/{id}` | участник / admin | Одна заявка |
| POST | `/swaps` | user | Создать `{skill_id, hours, message, scheduled_at}` |
| PUT | `/swaps/{id}` | участник / admin | Изменить поля и/или `status` |
| DELETE | `/swaps/{id}` | автор / admin | Удалить (автор — только pending/rejected/cancelled) |

## Администрирование

| Метод | Путь | Доступ | Описание |
|---|---|---|---|
| GET | `/admin/users?q=` | admin | Список пользователей |
| PATCH | `/admin/users/{id}` | admin | Изменить `role`, `is_active`, `credits` |
| DELETE | `/admin/users/{id}` | admin | Удалить пользователя |
| GET | `/admin/stats` | admin | Статистика платформы |
| GET | `/users/{id}/public` | все | Публичный профиль |
| GET | `/health` | все | Проверка работоспособности |

## Пример

```bash
# вход
TOKEN=$(curl -s -X POST localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"anna","password":"demo123"}' | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

# создать навык
curl -X POST localhost:8080/api/skills -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Шахматы для начинающих","category":"Игры","level":"beginner","format":"online","hours_cost":1}'
```
