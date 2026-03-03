"""Upload API: POST /api/upload — accept file, save, run soundspace embedding, persist coords."""
import logging
import uuid
from pathlib import Path

import librosa
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, MAX_SAMPLE_DURATION_SEC
from app.database import get_db
from app.models import Sound
from app.soundspace import SoundSpaceError, embed_single_sample
from app.schemas import Point

router = APIRouter(prefix="/api", tags=["upload"])
logger = logging.getLogger(__name__)
_settings = Settings()

# Allowed audio extensions
ALLOWED_EXTENSIONS = frozenset({".wav", ".mp3", ".ogg", ".flac", ".m4a", ".aac"})


def _base_url(request: Request) -> str:
    """Base URL for building audioUrl (no trailing slash)."""
    return str(request.base_url).rstrip("/")


def _uploads_path() -> Path:
    """Path to static/uploads directory (relative to backend root)."""
    backend_root = Path(__file__).resolve().parent.parent.parent
    return backend_root / _settings.static_dir / "uploads"


async def _ensure_uploads_dir() -> Path:
    """Ensure uploads directory exists; return its path."""
    p = _uploads_path()
    p.mkdir(parents=True, exist_ok=True)
    return p


def _safe_filename(original_filename: str) -> str:
    """Generate a unique, safe filename preserving extension."""
    stem = Path(original_filename).stem or "audio"
    ext = Path(original_filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        ext = ".wav"
    return f"{uuid.uuid4().hex}_{stem[:32]}{ext}"


@router.post("/upload", response_model=Point)
async def upload_sound(request: Request, file: UploadFile = File(...), db: AsyncSession = Depends(get_db)) -> Point:
    """POST /api/upload — accept audio file, save to uploads/, run embedding+layout, persist coords, return point."""
    # Validate extension
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    uploads_dir = await _ensure_uploads_dir()
    safe_name = _safe_filename(file.filename or "audio.wav")
    destination_path = uploads_dir / safe_name

    # Save file
    content = await file.read()
    destination_path.write_bytes(content)

    # Reject if duration exceeds limit (from config / .env)
    try:
        duration_sec = librosa.get_duration(path=destination_path)
    except Exception as e:
        logger.warning(f"Could not read audio duration for {file.filename}: {e}", exc_info=True)
        destination_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Could not read audio duration. File may be corrupt or unsupported.")
    if duration_sec > MAX_SAMPLE_DURATION_SEC:
        logger.warning(f"Upload rejected: {file.filename} exceeds max duration ({duration_sec:.1f}s > {MAX_SAMPLE_DURATION_SEC:.0f}s)")
        destination_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Audio exceeds maximum duration of {MAX_SAMPLE_DURATION_SEC:.0f}s (got {duration_sec:.1f}s).")

    # Run soundspace embedding (uses saved UMAP models so new sound maps into existing galaxy)
    try:
        result = embed_single_sample(destination_path)
    except SoundSpaceError as e:
        raise HTTPException(status_code=503, detail=str(e))

    coords_2d = result["coords_2d"]
    coords_3d = result["coords_3d"]

    # Persist to DB
    audio_path = f"uploads/{safe_name}"
    sound = Sound(
        name=file.filename or safe_name,
        coords_2d=coords_2d,
        coords_3d=coords_3d,
        audio_path=audio_path,
    )
    db.add(sound)
    await db.flush()
    await db.refresh(sound)

    base = _base_url(request)
    return Point(
        id=sound.id,
        coords_2d=sound.coords_2d,
        coords_3d=sound.coords_3d,
        name=sound.name,
        audioUrl=f"{base}/static/{sound.audio_path}",
    )
