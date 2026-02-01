"""Application configuration loaded from environment."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Backend settings. Override via env vars or .env file."""

    model_config = SettingsConfigDict(
        env_prefix="SOUNDROMEDA_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    app_name: str = "Soundromeda"
    debug: bool = False

    # Database: SQLite by default; set SOUNDROMEDA_DATABASE_URL for PostgreSQL
    database_url: str = "sqlite+aiosqlite:///./soundromeda.db"

    # Paths (relative to backend root or absolute)
    static_dir: str = "static"

