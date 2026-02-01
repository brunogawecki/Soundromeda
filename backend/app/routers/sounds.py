"""Galaxy API: GET /api/sounds and GET /api/sounds/:id."""
import json
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.database import get_db
from app.models import Sound
from app.schemas import Point, PointsResponse

router = APIRouter(prefix="/api", tags=["sounds"])
_settings = Settings()

# Path to static meta (built-in library). Relative to backend root.
_STATIC_META_PATH = Path(__file__).resolve().parent.parent.parent / _settings.static_dir / "meta" / "builtin.json"


def _base_url(request: Request) -> str:
    """Base URL for building audioUrl (no trailing slash)."""
    return str(request.base_url).rstrip("/")


def _load_builtin_points(request: Request) -> list[Point]:
    """Load built-in points from static meta if file exists; else return []."""
    if not _STATIC_META_PATH.exists():
        return []
    raw = _STATIC_META_PATH.read_text(encoding="utf-8")
    data = json.loads(raw)
    # Accept either {"points": [...]} or direct list
    items = data.get("points", data) if isinstance(data, dict) else data
    base = _base_url(request)
    return [
        Point(
            id=item["id"],
            coords_2d=item["coords_2d"],
            coords_3d=item["coords_3d"],
            name=item["name"],
            audioUrl=_normalize_audio_url(item, base),
        )
        for item in items
    ]


def _normalize_audio_url(item: dict, base: str) -> str:
    """Build full audioUrl from item (audioUrl or audio_path) and request base."""
    url = item.get("audioUrl") or f"/static/{item.get('audio_path', 'audio/')}"
    if url.startswith(("http://", "https://")):
        return url
    return f"{base}/{url.lstrip('/')}"


@router.get("/sounds", response_model=PointsResponse)
async def get_sounds(source: Literal["builtin", "user"], request: Request, db: AsyncSession = Depends(get_db)) -> PointsResponse:
    """GET /api/sounds?source=builtin|user — returns { points: [...] }."""
    if source == "builtin":
        points = _load_builtin_points(request)
        return PointsResponse(points=points)
        
    result = await db.execute(select(Sound))
    sounds = result.scalars().all()
    base = _base_url(request)
    points = [
        Point(
            id=s.id,
            coords_2d=s.coords_2d,
            coords_3d=s.coords_3d,
            name=s.name,
            audioUrl=f"{base}/static/{s.audio_path}" if not s.audio_path.startswith("/") else f"{base}{s.audio_path}",
        )
        for s in sounds
    ]
    return PointsResponse(points=points)


@router.get("/sounds/{sound_id}", response_model=Point)
async def get_sound_by_id(sound_id: str, request: Request, db: AsyncSession = Depends(get_db)) -> Point:
    """GET /api/sounds/:id — single sound meta + audioUrl."""
    base = _base_url(request)
    # Try user DB by integer id
    try:
        primary_key = int(sound_id)
    except ValueError:
        primary_key = None
        
    if primary_key is not None:
        result = await db.execute(select(Sound).where(Sound.id == primary_key))
        sound = result.scalar_one_or_none()
        if sound:
            return Point(
                id=sound.id,
                coords_2d=sound.coords_2d,
                coords_3d=sound.coords_3d,
                name=sound.name,
                audioUrl=f"{base}/static/{sound.audio_path}" if not sound.audio_path.startswith("/") else f"{base}{sound.audio_path}",
            )
    # Fall back to built-in by id (string)
    builtin = _load_builtin_points(request)
    for p in builtin:
        if str(p.id) == str(sound_id):
            return p
    raise HTTPException(status_code=404, detail="Sound not found")
