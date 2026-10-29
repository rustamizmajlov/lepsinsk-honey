# 🍯 Лепсинский мёд — интернет-магазин пасеки

> Горный и луговой мёд с семейных пасек села Лепсинск у подножия Джунгарского Алатау (область Жетысу, Казахстан).

![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

Веб-приложение для небольшой пасеки: покупатели выбирают мёд по вкусу и высоте пасеки, оформляют заказ
с доставкой по Казахстану и следят за его статусом. Пасечник ведёт каталог, остатки и заказы и видит статистику сезона.

> Учебный проект: пасека, товары, цены и демо-заказ вымышлены.

📄 Описание проекта — [docs/PROJECT.md](docs/PROJECT.md)
📋 60 use cases (20 MVP) — [docs/USE_CASES.md](docs/USE_CASES.md)
🔌 REST API — [docs/API.md](docs/API.md)

## Возможности

- 🏔️ Главная с историей села, «годом на пасеке» и горным пейзажем в SVG
- 🍯 Каталог: поиск, сорта, сортировка по цене, «только в наличии», банки нарисованы цветом конкретного мёда
- 🧭 **Подбор мёда** — тест из 3 вопросов подбирает сорт по сладости и яркости вкуса
- 🛒 Корзина без регистрации, три способа доставки, бесплатная доставка от 20 000 ₸
- 📦 **CRUD заказов**: оформление, просмотр со статусами, изменение и отмена нового заказа, удаление
- 🧑‍🌾 **CRUD товаров** в панели пасечника: цена, остаток, вкус, высота пасеки, цвет мёда, скрытие с витрины
- 📊 Статистика: выручка, проданные килограммы, хиты, заканчивающиеся товары
- 🔐 JWT-авторизация, роли **user** (покупатель) и **admin** (пасечник), пароли в bcrypt
- 🐳 Сервер, база данных и UI — в отдельных Docker-контейнерах; есть запуск без Docker

## Стек

| Слой | Технологии |
|---|---|
| UI | HTML, CSS, JavaScript (SPA без сборки), nginx |
| Сервер | Python 3.12, FastAPI, SQLAlchemy 2, Pydantic 2, PyJWT, bcrypt |
| База данных | PostgreSQL 16 (в Docker) / SQLite (локальный запуск) |
| Инфраструктура | Docker, Docker Compose |

## Быстрый старт (Docker)

```bash
git clone https://github.com/rustamizmajlov/lepsinsk-honey.git
cd lepsinsk-honey
cp .env.example .env        # необязательно: значения по умолчанию уже работают
docker compose up --build
```

| Что | Адрес |
|---|---|
| Магазин | http://localhost:8080 |
| Swagger (документация API) | http://localhost:8080/api/docs |
| Backend напрямую | http://localhost:8000/api/health |

## Запуск без Docker (Windows, одним кликом)

Нужен только [Python 3.10+](https://www.python.org/downloads/).

1. Скачайте проект (`git clone …` или **Code → Download ZIP** и распакуйте).
2. Дважды кликните **`run-local.bat`**.

Скрипт создаст окружение в `%USERPROFILE%\.venvs\lepsinsk-honey`, установит зависимости
из `requirements-local.txt`, запустит магазин на SQLite по адресу http://localhost:8080 и откроет его в **Brave**
(если Brave не установлен — в браузере по умолчанию). Остановить — `Ctrl+C` в окне консоли.

На macOS / Linux:

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements-local.txt
python run_local.py
```

Данные хранятся в файле `honey.db` в корне проекта; удалите его, чтобы начать с чистой базы.

## Тестовые аккаунты

| Роль | Логин | Пароль |
|---|---|---|
| Пасечник (admin) | `admin` | `admin12345` |
| Покупатель (user) | `demo` | `demo123` |

Перед реальным использованием смените `ADMIN_PASSWORD` и `JWT_SECRET` в `.env`.

### для демонстрации

1. Без входа: **Подобрать мёд** → ответьте на 3 вопроса → положите рекомендацию в корзину.
2. **Корзина** → выберите Казпочту → увидите подсказку до бесплатной доставки → «Войти, чтобы оформить» → `demo`.
3. Данные получателя подставятся из профиля → «Оформить заказ» → заказ появится в **Мои заказы** со статусом «Новый».
4. Войдите как `admin` → **Пасечнику**: подтвердите заказ, отправьте, отметьте доставленным; на вкладке «Товары» добавьте новый сорт.

## Структура проекта

```
lepsinsk-honey/
├── backend/                 # сервер (FastAPI)
│   ├── app/
│   │   ├── main.py          # точка входа, создание таблиц, демо-данные
│   │   ├── config.py        # настройки и тарифы доставки
│   │   ├── database.py      # подключение к БД
│   │   ├── models.py        # User, Product, Order, OrderItem
│   │   ├── schemas.py       # Pydantic-схемы
│   │   ├── security.py      # bcrypt и JWT
│   │   ├── deps.py          # текущий пользователь, проверка роли
│   │   └── routers/         # auth, products, orders, admin
│   ├── tests/test_api.py    # сквозной тест API
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                # UI (nginx + SPA)
│   ├── public/              # index.html, app.js, styles.css
│   ├── nginx.conf
│   └── Dockerfile
├── docs/                    # PROJECT.md, USE_CASES.md, API.md
├── docker-compose.yml
├── run-local.bat            # запуск без Docker
├── run_local.py
├── requirements-local.txt
├── .env.example
└── LICENSE
```

## Тесты

```bash
pip install -r requirements-local.txt pytest httpx
DATABASE_URL=sqlite:///./test.db pytest -q backend/tests
```

## Лицензия

[MIT](LICENSE)
