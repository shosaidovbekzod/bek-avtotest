from functools import lru_cache
from pathlib import Path
from pydantic import BaseModel
import os


ROOT_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseModel):
    app_name: str = "bek_avtotest"
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./eavtotest.db")
    admin_username: str = os.getenv("ADMIN_USERNAME", "admin")
    admin_password: str = os.getenv("ADMIN_PASSWORD", "admin123")
    token_ttl_hours: int = int(os.getenv("TOKEN_TTL_HOURS", "168"))
    original_assets_dir: Path = ROOT_DIR


@lru_cache
def get_settings() -> Settings:
    return Settings()
