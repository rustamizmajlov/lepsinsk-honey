import os


class Settings:
    database_url: str = os.getenv(
        "DATABASE_URL", "postgresql+psycopg2://honey:honey@db:5432/honey"
    )
    jwt_secret: str = os.getenv("JWT_SECRET", "change-me-to-a-long-random-secret-string")
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))
    admin_username: str = os.getenv("ADMIN_USERNAME", "admin")
    admin_email: str = os.getenv("ADMIN_EMAIL", "admin@lepsinsk-honey.kz")
    admin_password: str = os.getenv("ADMIN_PASSWORD", "admin12345")
    seed_demo: bool = os.getenv("SEED_DEMO", "true").lower() == "true"

    # Delivery price in tenge; free delivery from FREE_DELIVERY_FROM
    delivery_prices: dict[str, int] = {"pickup": 0, "post": 1500, "courier": 2500}
    free_delivery_from: int = int(os.getenv("FREE_DELIVERY_FROM", "20000"))


settings = Settings()
