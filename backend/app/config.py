import os


class Settings:
    database_url: str = os.getenv(
        "DATABASE_URL", "postgresql+psycopg2://skillswap:skillswap@db:5432/skillswap"
    )
    jwt_secret: str = os.getenv("JWT_SECRET", "change-me-to-a-long-random-secret-string")
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))
    admin_username: str = os.getenv("ADMIN_USERNAME", "admin")
    admin_email: str = os.getenv("ADMIN_EMAIL", "admin@skillswap.dev")
    admin_password: str = os.getenv("ADMIN_PASSWORD", "admin12345")
    # Every new member gets a few hours to start exchanging right away
    start_credits: int = int(os.getenv("START_CREDITS", "3"))


settings = Settings()
