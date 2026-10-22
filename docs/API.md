# REST API

Базовый путь — `/api`. Интерактивная документация Swagger: http://localhost:8080/api/docs.
Защищённые запросы передают токен в заголовке `Authorization: Bearer <access_token>`.

## Авторизация и профиль

| Метод | Путь | Доступ | Описание |
|---|---|---|---|
| POST | `/auth/register` | все | `{username, email, password, full_name?}` |
| POST | `/auth/login` | все | `{username, password}` → `{access_token}` |
| GET | `/auth/me` | user | Текущий пользователь |
| PATCH | `/auth/me` | user | Изменить `email`, `full_name`, `phone`, `address`, `password` |

## Товары — CRUD №1

| Метод | Путь | Доступ | Описание |
|---|---|---|---|
| GET | `/products` | все | Фильтры `q`, `variety`, `min_price`, `max_price`, `in_stock`, `sort` (`name`, `price_asc`, `price_desc`, `new`); `include_inactive=true` — только для admin |
| GET | `/products/varieties` | все | Список сортов |
| GET | `/products/{id}` | все | Один товар (скрытый — только admin) |
| POST | `/products` | admin | Создать товар |
| PUT | `/products/{id}` | admin | Изменить любые поля |
| DELETE | `/products/{id}` | admin | Удалить товар |

## Заказы — CRUD №2

| Метод | Путь | Доступ | Описание |
|---|---|---|---|
| GET | `/orders?status_filter=` | user | Свои заказы; admin видит все |
| GET | `/orders/{id}` | владелец / admin | Один заказ |
| POST | `/orders` | user | `{items: [{product_id, quantity}], customer_name, phone, address, delivery, comment}` |
| PUT | `/orders/{id}` | владелец / admin | Изменить состав, контакты, доставку и/или `status` |
| DELETE | `/orders/{id}` | владелец / admin | Удалить (владелец — только `new` или `cancelled`) |

Статусы: `new` → `confirmed` → `shipped` → `delivered`; `new`/`confirmed` → `cancelled`.

## Администрирование

| Метод | Путь | Описание |
|---|---|---|
| GET | `/admin/users?q=` | Список пользователей |
| PATCH | `/admin/users/{id}` | Изменить `role`, `is_active` |
| DELETE | `/admin/users/{id}` | Удалить пользователя и его заказы |
| GET | `/admin/stats` | Выручка, кг продано, заказы по статусам, хиты, заканчивающиеся товары |

## Служебные

| Метод | Путь | Описание |
|---|---|---|
| GET | `/health` | Проверка работоспособности |
| GET | `/settings` | Тарифы доставки и порог бесплатной доставки |

## Пример

```bash
TOKEN=$(curl -s -X POST localhost:8080/api/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"demo123"}' | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

curl -X POST localhost:8080/api/orders -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"items":[{"product_id":1,"quantity":2}],"customer_name":"Алия","phone":"+77011234567","address":"Алматы","delivery":"post"}'
```
