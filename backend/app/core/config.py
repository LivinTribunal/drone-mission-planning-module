from pathlib import Path

from pydantic_settings import BaseSettings

# resolved once relative to the project root (backend/../data/terrain)
TERRAIN_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "terrain"


class Settings(BaseSettings):
    """application settings loaded from environment."""

    database_url: str = "postgresql://tarmacview:tarmacview@localhost:5432/tarmacview"
    # overridden via .env in production
    jwt_secret: str = "change-me-in-production-minimum-256-bits"
    jwt_expiration_minutes: int = 15
    jwt_refresh_expiration_days: int = 7
    cors_origins: list[str] = ["http://localhost:5173"]

    # safety constants - overridable via .env
    takeoff_safe_altitude: float = 10.0
    landing_safe_altitude: float = 10.0
    vertex_buffer_m: float = 5.0

    # terrain download limits
    terrain_download_timeout: float = 300.0  # 5 min total wall-clock limit

    class Config:
        env_file = ".env"


settings = Settings()
