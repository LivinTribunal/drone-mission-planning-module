from pathlib import Path

from pydantic_settings import BaseSettings

# project root - resolved once for default paths
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


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

    # terrain settings
    terrain_dir: Path = _PROJECT_ROOT / "data" / "terrain"
    terrain_download_timeout: float = 300.0  # 5 min total wall-clock limit
    terrain_grid_delta_deg: float = 0.045  # ~5km bounding box half-width
    terrain_grid_step_deg: float = 0.00027  # ~30m grid spacing
    terrain_api_batch_size: int = 2000  # max points per API request
    open_elevation_url: str = "https://api.open-elevation.com/api/v1/lookup"

    class Config:
        env_file = ".env"


settings = Settings()

# backwards-compatible alias
TERRAIN_DIR = settings.terrain_dir
