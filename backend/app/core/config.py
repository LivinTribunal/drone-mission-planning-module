from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """application settings loaded from environment."""

    database_url: str = "postgresql://tarmacview:tarmacview@localhost:5432/tarmacview"
    jwt_secret: str = "change-me-in-production-minimum-256-bits"
    jwt_expiration_minutes: int = 15
    jwt_refresh_expiration_days: int = 7
    cors_origins: list[str] = ["http://localhost:5173"]

    class Config:
        env_file = ".env"


settings = Settings()
