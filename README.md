# ⇄ SkillSwap — банк времени для обмена навыками

> Учите и учитесь без денег: час вашего занятия = 1 тайм-кредит, который можно потратить на обучение у другого участника.

![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

**SkillSwap** — веб-приложение, где люди обмениваются знаниями: программист учит вёрстке, дизайнер — Figma,
музыкант — гитаре. Вместо денег используются **тайм-кредиты**: их зарабатывают, преподавая, и тратят, обучаясь.

📄 Подробное описание проекта — [docs/PROJECT.md](docs/PROJECT.md)
📋 60 use cases (20 MVP) — [docs/USE_CASES.md](docs/USE_CASES.md)
🔌 REST API — [docs/API.md](docs/API.md)

## Возможности

- 🔎 Каталог навыков с поиском и фильтрами по категории, уровню и формату
- 🧑‍🏫 **CRUD навыков**: публикация, редактирование, скрытие, удаление
- 🤝 **CRUD заявок на обмен**: создание, изменение, принятие/отклонение, отмена, завершение, удаление
- ⏱ Тайм-кредиты: 3 стартовых, автоматический перевод при завершении занятия, проверка баланса
- 🔐 Авторизация JWT, роли **user** и **admin**, хеширование паролей bcrypt
- 🛠 Админ-панель: статистика, управление пользователями (роль, блокировка, баланс), модерация навыков и заявок
- 🐳 Сервер, база данных и UI — в отдельных Docker-контейнерах

## Стек

| Слой | Технологии |
|---|---|
| UI | HTML, CSS, JavaScript (SPA), nginx |
| Сервер | Python 3.12, FastAPI, SQLAlchemy 2, Pydantic 2, PyJWT, bcrypt |
| База данных | PostgreSQL 16 |
| Инфраструктура | Docker, Docker Compose |

## Быстрый старт

Нужен установленный [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
git clone https://github.com/rustamizmajlov/skillswap.git
cd skillswap
cp .env.example .env        # необязательно: значения по умолчанию уже работают
docker compose up --build
```

После запуска:

| Что | Адрес |
|---|---|
| Приложение | http://localhost:8080 |
| Swagger (документация API) | http://localhost:8080/api/docs |
| Backend напрямую | http://localhost:8000/api/health |

### Тестовые аккаунты

| Роль | Логин | Пароль |
|---|---|---|
| Администратор | `admin` | `admin12345` |
| Пользователь | `anna` | `demo123` |
| Пользователь | `ivan` | `demo123` |

Демо-аккаунты создаются при первом запуске (`SEED_DEMO=true`). Перед реальным использованием
смените `ADMIN_PASSWORD` и `JWT_SECRET` в `.env`.

### Сценарий для демонстрации

1. Войдите как `ivan` → «Каталог» → «Записаться» на «Разговорный английский» на 2 часа.
2. Выйдите и войдите как `anna` → «Заявки» → «Входящие» → «Принять» → «Занятие проведено».
3. Баланс anna вырос до 5 кредитов, у ivan уменьшился до 1.
4. Войдите как `admin` → «Админка»: статистика показывает 1 завершённый обмен и 2 часа обучения.

## Структура проекта

```
skillswap/
├── backend/                 # сервер (FastAPI)
│   ├── app/
│   │   ├── main.py          # точка входа, создание таблиц, сид-данные
│   │   ├── config.py        # настройки из переменных окружения
│   │   ├── database.py      # подключение к PostgreSQL
│   │   ├── models.py        # ORM-модели: User, Skill, SwapRequest
│   │   ├── schemas.py       # Pydantic-схемы запросов и ответов
│   │   ├── security.py      # bcrypt и JWT
│   │   ├── deps.py          # текущий пользователь, проверка роли admin
│   │   └── routers/         # auth, skills, swaps, admin
│   ├── tests/test_api.py    # сквозной тест API
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                # UI (nginx + SPA)
│   ├── public/              # index.html, app.js, styles.css
│   ├── nginx.conf           # раздача статики и прокси /api → backend
│   └── Dockerfile
├── docs/                    # PROJECT.md, USE_CASES.md, API.md
├── docker-compose.yml
├── .env.example
└── LICENSE
```

## Запуск тестов без Docker

```bash
cd backend
pip install -r requirements.txt pytest httpx
DATABASE_URL=sqlite:///./test.db pytest -q
```

## Лицензия

[MIT](LICENSE)
