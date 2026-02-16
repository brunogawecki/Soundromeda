"""Application configuration loaded from environment."""
from pathlib import Path

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
    # Backend root; leave empty to auto-detect from this file's location
    backend_root: str = ""
    # Default audio source folder name under static/audio (e.g. for build_builtin.py)
    default_audio_source: str = "Neptunes Drumkit"
    # Comma-separated audio file extensions, e.g. ".wav,.mp3,.ogg"
    audio_extensions: str = ".wav,.WAV,.mp3,.ogg,.flac,.m4a,.aac"

    # CORS: comma-separated origins, e.g. "http://localhost:5173,http://127.0.0.1:5173"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Max duration (seconds) for a single audio sample (upload + build_builtin); longer files are rejected/skipped
    max_sample_duration_sec: float = 5.0


settings = Settings()

# --- Path constants (derived from settings) ---
_BACKEND_ROOT_PATH: Path = (
    Path(settings.backend_root).resolve()
    if settings.backend_root
    else Path(__file__).resolve().parent.parent
)
STATIC_PATH: Path = _BACKEND_ROOT_PATH / settings.static_dir
AUDIO_DIR: Path = STATIC_PATH / "audio"
META_DIR: Path = STATIC_PATH / "meta"
DEFAULT_AUDIO_SOURCE_PATH: Path = AUDIO_DIR / settings.default_audio_source
BUILTIN_JSON_PATH: Path = META_DIR / "builtin.json"
HIDDEN_BUILTIN_JSON_PATH: Path = META_DIR / "hidden_builtin.json"
UMAP_MODEL_PATH: Path = META_DIR / "umap_model.joblib"
AUDIO_EXTENSIONS_SET: frozenset[str] = frozenset(
    ext.strip() for ext in settings.audio_extensions.split(",") if ext.strip()
)
MAX_SAMPLE_DURATION_SEC: float = settings.max_sample_duration_sec

