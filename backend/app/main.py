import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import select
from sqlalchemy.exc import OperationalError

from .config import settings
from .database import Base, SessionLocal, engine
from .models import Skill, User
from .routers import admin, auth, skills, swaps
from .security import hash_password

log = logging.getLogger("skillswap")

DEMO_SKILLS = [
    ("anna", "Разговорный английский", "Языки", "expert", "online", 1,
     "Практика разговорной речи, произношение, подготовка к собеседованиям."),
    ("anna", "Основы фотографии на смартфон", "Творчество", "intermediate", "both", 1,
     "Композиция, свет, обработка в Lightroom Mobile."),
    ("ivan", "Python для начинающих", "IT", "expert", "online", 2,
     "Переменные, циклы, функции и первый телеграм-бот за 4 занятия."),
    ("ivan", "Гитара: первые аккорды", "Музыка", "beginner", "offline", 1,
     "Научу держать гитару и сыграть 3 песни у костра."),
]


def wait_for_db(retries: int = 30) -> None:
    for attempt in range(retries):
        try:
            with engine.connect():
                return
        except OperationalError:
            log.warning("База данных недоступна, попытка %s/%s", attempt + 1, retries)
            time.sleep(2)
    raise RuntimeError("Не удалось подключиться к базе данных")


def seed() -> None:
    with SessionLocal() as db:
        if db.scalar(select(User).where(User.username == settings.admin_username)) is None:
            db.add(User(
                username=settings.admin_username,
                email=settings.admin_email,
                password_hash=hash_password(settings.admin_password),
                role="admin",
                credits=0,
            ))
        if os.getenv("SEED_DEMO", "true").lower() == "true" and db.scalar(select(Skill.id)) is None:
            users = {}
            for name, bio in (("anna", "Преподаватель английского, люблю фотографию"),
                              ("ivan", "Backend-разработчик и гитарист-любитель")):
                users[name] = User(username=name, email=f"{name}@skillswap.dev", bio=bio,
                                   password_hash=hash_password("demo123"),
                                   credits=settings.start_credits)
                db.add(users[name])
            db.flush()
            for owner, title, category, level, fmt, cost, desc in DEMO_SKILLS:
                db.add(Skill(title=title, description=desc, category=category, level=level,
                             format=fmt, hours_cost=cost, owner_id=users[owner].id))
        db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    wait_for_db()
    Base.metadata.create_all(engine)
    seed()
    yield


app = FastAPI(
    title="SkillSwap API",
    description="Банк времени: обмен навыками за тайм-кредиты",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.include_router(auth.router)
app.include_router(skills.router)
app.include_router(swaps.router)
app.include_router(admin.router)


@app.get("/api/health", tags=["system"])
def health():
    return {"status": "ok"}
