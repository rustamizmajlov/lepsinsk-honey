import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import select
from sqlalchemy.exc import OperationalError

from .config import settings
from .database import Base, SessionLocal, engine
from .models import Order, OrderItem, Product, User
from .routers import admin, auth, orders, products
from .security import hash_password

log = logging.getLogger("honey")

# name, variety, taste, colour, weight, price, stock, altitude, sweetness, intensity, description
DEMO_PRODUCTS = [
    ("Горный «Джунгарский»", "Горный", "густой, пряный, с долгим травяным послевкусием",
     "#D98E2B", 1000, 7500, 25, 1800, 3, 5,
     "Собран на альпийских лугах Джунгарского Алатау выше села. Тёмно-янтарный, "
     "медленно кристаллизуется в плотную мелкозернистую массу."),
    ("Разнотравье «Лепсинские луга»", "Луговой", "мягкий цветочный, с нотами клевера и душицы",
     "#EDB547", 1000, 5500, 40, 1100, 4, 3,
     "Классический летний мёд с цветущих лугов вдоль реки Лепсы. Подходит к чаю на каждый день."),
    ("Донниковый", "Луговой", "нежный, ванильный, почти без горчинки",
     "#F3DE9A", 1000, 6000, 18, 900, 5, 1,
     "Очень светлый мёд с донника. Кристаллизуется в белую кремообразную массу — любимец детей."),
    ("Эспарцетовый", "Луговой", "лёгкий, освежающий, с розовым ароматом",
     "#F1CF73", 1000, 6200, 15, 1000, 4, 2,
     "Редкий светлый мёд с эспарцета. Долго остаётся жидким и прозрачным."),
    ("Кипрейный (иван-чай)", "Горный", "сливочный, тонкий, с лёгкой кислинкой",
     "#F5E7BD", 500, 4200, 12, 1600, 4, 2,
     "Кипрей цветёт на горных полянах в июле. Мёд быстро садится в «сливочную» нежную текстуру."),
    ("Мёд в сотах", "Соты", "живой вкус воска и свежего цветочного нектара",
     "#E0A13A", 400, 5000, 8, 1300, 4, 3,
     "Рамка запечатанных сот прямо с пасеки — мёд, который не касался ни насоса, ни банки."),
    ("Мёд с прополисом", "Продукты пчеловодства", "терпкий, смолистый, слегка щиплет язык",
     "#B8752A", 500, 4800, 4, 1100, 2, 5,
     "Луговой мёд, смешанный с прополисом. Хорош осенью и зимой, к горячему чаю."),
    ("Перга", "Продукты пчеловодства", "кисло-сладкая, с хлебными нотами",
     "#8C5A2B", 100, 3500, 3, 1100, 2, 4,
     "«Пчелиный хлеб» — цветочная пыльца, законсервированная пчёлами в сотах. Принимают по чайной ложке."),
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
                full_name="Пасечник",
                password_hash=hash_password(settings.admin_password),
                role="admin",
            ))
        if not settings.seed_demo or db.scalar(select(Product.id)) is not None:
            db.commit()
            return
        products = []
        for (name, variety, taste, color, weight, price, stock, altitude, sweet, intense, desc) in DEMO_PRODUCTS:
            products.append(Product(
                name=name, variety=variety, taste=taste, color=color, weight_g=weight, price=price,
                stock=stock, altitude_m=altitude, sweetness=sweet, intensity=intense,
                description=desc, harvest_year=2026,
            ))
        db.add_all(products)
        buyer = User(
            username="demo", email="demo@lepsinsk-honey.kz", full_name="Демо Покупатель",
            phone="+7 700 000 00 00", address="г. Алматы, ул. Примерная, 1",
            password_hash=hash_password("demo123"),
        )
        db.add(buyer)
        db.flush()
        # one delivered order so the admin dashboard is not empty on first launch
        order = Order(
            user_id=buyer.id, status="delivered", customer_name=buyer.full_name, phone=buyer.phone,
            address=buyer.address, delivery="post", items_total=13000, delivery_price=1500,
            items=[
                OrderItem(product_id=products[0].id, product_name=products[0].name, price=7500, quantity=1),
                OrderItem(product_id=products[1].id, product_name=products[1].name, price=5500, quantity=1),
            ],
        )
        db.add(order)
        db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    wait_for_db()
    Base.metadata.create_all(engine)
    seed()
    yield


app = FastAPI(
    title="Лепсинский мёд — API",
    description="Интернет-магазин мёда с пасеки в селе Лепсинск",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.include_router(auth.router)
app.include_router(products.router)
app.include_router(orders.router)
app.include_router(admin.router)


@app.get("/api/health", tags=["system"])
def health():
    return {"status": "ok"}


@app.get("/api/settings", tags=["system"])
def public_settings():
    return {
        "delivery_prices": settings.delivery_prices,
        "free_delivery_from": settings.free_delivery_from,
    }
