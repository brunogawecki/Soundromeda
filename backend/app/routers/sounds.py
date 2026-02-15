"""Galaxy API: GET /api/sounds and GET /api/sounds/:id; hide/show built-in; delete user sounds; recalculate UMAP."""
import asyncio
import json
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.database import get_db
from app.models import Sound
from app.schemas import Point, PointsResponse
from app.soundspace import SoundSpaceError, fit_umap_get_coords
from app.soundspace.embedding import SoundSpaceEmbedder

router = APIRouter(prefix="/api", tags=["sounds"])
_settings = Settings()

# Path to static meta (built-in library). Relative to backend root.
_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent
_STATIC_META_PATH = _BACKEND_ROOT / _settings.static_dir / "meta" / "builtin.json"
_HIDDEN_BUILTIN_PATH = _BACKEND_ROOT / _settings.static_dir / "meta" / "hidden_builtin.json"


class IdsBody(BaseModel):
    """Request body for hide/show built-in: list of built-in sound IDs."""

    ids: list[str] = []


class BulkIdsBody(BaseModel):
    """Request body for bulk delete: list of user sound IDs (integers)."""

    ids: list[int] = []


class RecalculateBody(BaseModel):
    """Request body for recalculate mapping: ids list for custom selection, or None/omit for all user. include_builtin: when ids is None, fit UMAP on built-in + user sounds and update both."""

    ids: list[int] | None = None
    include_builtin: bool = False


_UMAP_MODEL_PATH = _BACKEND_ROOT / _settings.static_dir / "meta" / "umap_model.joblib"


def _static_file_path(relative_path: str) -> Path:
    """Resolve static file path from relative audio_path (e.g. uploads/foo.wav)."""
    return _BACKEND_ROOT / _settings.static_dir / relative_path.lstrip("/")


async def _delete_user_sound_by_id(sound_id: int, db: AsyncSession) -> bool:
    """Delete one user sound by id: remove file and DB record. Returns True if deleted, False if not found."""
    result = await db.execute(select(Sound).where(Sound.id == sound_id))
    sound = result.scalar_one_or_none()
    if not sound:
        return False
    file_path = _static_file_path(sound.audio_path)
    if file_path.exists():
        try:
            file_path.unlink()
        except OSError:
            pass
    await db.delete(sound)
    return True


def _base_url(request: Request) -> str:
    """Base URL for building audioUrl (no trailing slash)."""
    return str(request.base_url).rstrip("/")


def _load_builtin_points_raw() -> list[dict]:
    """Load built-in points from builtin.json (no request). Returns list of dicts with id, name, coords_2d, coords_3d, audio_path."""
    if not _STATIC_META_PATH.exists():
        return []
    raw = _STATIC_META_PATH.read_text(encoding="utf-8")
    data = json.loads(raw)
    items = data.get("points", data) if isinstance(data, dict) else data
    return list(items) if isinstance(items, list) else []


def _load_hidden_builtin_ids() -> set[str]:
    """Load hidden built-in sound IDs from hidden_builtin.json. Returns empty set if file doesn't exist."""
    if not _HIDDEN_BUILTIN_PATH.exists():
        return set()
    try:
        raw = _HIDDEN_BUILTIN_PATH.read_text(encoding="utf-8")
        data = json.loads(raw)
        hidden_sound_ids = data.get("hidden_ids", [])
        return set(hidden_sound_ids) if isinstance(hidden_sound_ids, list) else set()
    except (json.JSONDecodeError, KeyError, OSError):
        # If file is corrupted or unreadable, return empty set
        return set()


def _save_hidden_builtin_ids(hidden_ids: list[str]) -> None:
    """Save hidden built-in sound IDs to hidden_builtin.json. Creates parent directories if needed."""
    # Ensure parent directory exists
    _HIDDEN_BUILTIN_PATH.parent.mkdir(parents=True, exist_ok=True)
    data = {"hidden_ids": hidden_ids}
    _HIDDEN_BUILTIN_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _load_builtin_points(request: Request) -> list[Point]:
    """Load built-in points from static meta if file exists; else return []. Filters out hidden sounds."""
    if not _STATIC_META_PATH.exists():
        return []
    raw = _STATIC_META_PATH.read_text(encoding="utf-8")
    data = json.loads(raw)
    # Accept either {"points": [...]} or direct list
    items = data.get("points", data) if isinstance(data, dict) else data
    # Load hidden IDs and filter them out
    hidden_ids = _load_hidden_builtin_ids()
    base = _base_url(request)
    return [
        Point(
            id=item["id"],
            coords_2d=item["coords_2d"],
            coords_3d=item.get("coords_3d", [0, 0, 0]),  # Fallback if regenerating not done
            name=item["name"],
            audioUrl=_normalize_audio_url(item, base),
        )
        for item in items
        if str(item.get("id", "")) not in hidden_ids
    ]


def _normalize_audio_url(item: dict, base: str) -> str:
    """Build full audioUrl from item (audioUrl or audio_path) and request base."""
    url = item.get("audioUrl") or f"/static/{item.get('audio_path', 'audio/')}"
    if url.startswith(("http://", "https://")):
        return url
    return f"{base}/{url.lstrip('/')}"


@router.get("/sounds/hidden-builtin")
async def get_hidden_builtin_ids() -> dict:
    """GET /api/sounds/hidden-builtin — returns list of currently hidden built-in sound IDs."""
    hidden = list(_load_hidden_builtin_ids())
    return {"hidden_ids": hidden}


@router.get("/sounds/builtin-ids")
async def get_all_builtin_ids() -> dict:
    """GET /api/sounds/builtin-ids — returns all built-in sound IDs from builtin.json (including hidden)."""
    if not _STATIC_META_PATH.exists():
        return {"ids": []}
    raw = _STATIC_META_PATH.read_text(encoding="utf-8")
    data = json.loads(raw)
    items = data.get("points", data) if isinstance(data, dict) else data
    ids = [str(item.get("id", "")) for item in items if item.get("id") is not None]
    return {"ids": ids}


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


@router.post("/sounds/hide-builtin")
async def hide_builtin(body: IdsBody) -> dict:
    """POST /api/sounds/hide-builtin — add built-in IDs to hidden list (reversible)."""
    hidden = list(_load_hidden_builtin_ids())
    for id_ in body.ids:
        if id_ and id_ not in hidden:
            hidden.append(id_)
    _save_hidden_builtin_ids(hidden)
    return {"hidden_ids": hidden}


@router.post("/sounds/show-builtin")
async def show_builtin(body: IdsBody) -> dict:
    """POST /api/sounds/show-builtin — remove built-in IDs from hidden list."""
    hidden = list(_load_hidden_builtin_ids())
    for id_ in body.ids:
        if id_ in hidden:
            hidden.remove(id_)
    _save_hidden_builtin_ids(hidden)
    return {"hidden_ids": hidden}


@router.delete("/sounds/bulk")
async def delete_sounds_bulk(body: BulkIdsBody, db: AsyncSession = Depends(get_db)) -> dict:
    """DELETE /api/sounds/bulk — delete multiple user sounds by id (files + DB)."""
    deleted_ids: list[int] = []
    for pk in body.ids:
        if await _delete_user_sound_by_id(pk, db):
            deleted_ids.append(pk)
    return {"deleted": deleted_ids}


@router.delete("/sounds/user/all")
async def delete_all_user_sounds(db: AsyncSession = Depends(get_db)) -> dict:
    """DELETE /api/sounds/user/all — delete all user sounds (files + DB)."""
    result = await db.execute(select(Sound))
    sounds = result.scalars().all()
    deleted_count = 0
    for sound in sounds:
        file_path = _static_file_path(sound.audio_path)
        if file_path.exists():
            try:
                file_path.unlink()
            except OSError:
                pass
        await db.delete(sound)
        deleted_count += 1
    return {"deleted": deleted_count}


def _builtin_audio_path(item: dict) -> str | None:
    """Get relative audio path from a builtin point (audio_path or from audioUrl)."""
    path = item.get("audio_path")
    if path:
        return path
    url = item.get("audioUrl") or ""
    if "/static/" in url:
        return url.split("/static/", 1)[-1].lstrip("/")
    return None


@router.post("/sounds/recalculate-mapping")
async def recalculate_mapping(body: RecalculateBody, db: AsyncSession = Depends(get_db)) -> dict:
    """POST /api/sounds/recalculate-mapping — fit UMAP on selected or all user sounds, update coords. Body: { ids?: number[], include_builtin?: bool }. Omit ids for all user; include_builtin=true fits built-in + user and updates both."""
    include_builtin = body.include_builtin and body.ids is None
    successful_paths: list[Path] = []
    successful_ids: list[int | str] = []
    successful_is_builtin: list[bool] = []
    builtin_points_raw: list[dict] = []
    embedder = SoundSpaceEmbedder()

    if include_builtin:
        builtin_points_raw = _load_builtin_points_raw()
        for item in builtin_points_raw:
            rel = _builtin_audio_path(item)
            if not rel:
                continue
            path = _static_file_path(rel)
            if not path.exists():
                continue
            bid = item.get("id")
            if bid is None:
                continue
            try:
                embedder.extract_features_from_audio(path)
                successful_paths.append(path)
                successful_ids.append(bid)
                successful_is_builtin.append(True)
            except Exception:
                continue

    if body.ids is None:
        result = await db.execute(select(Sound))
        sounds = result.scalars().all()
    else:
        if not body.ids:
            raise HTTPException(status_code=400, detail="No sound ids provided")
        result = await db.execute(select(Sound).where(Sound.id.in_(body.ids)))
        sounds = result.scalars().all()

    id_to_sound = {s.id: s for s in sounds}
    for sound in sounds:
        path = _static_file_path(sound.audio_path)
        try:
            embedder.extract_features_from_audio(path)
            successful_paths.append(path)
            successful_ids.append(sound.id)
            successful_is_builtin.append(False)
        except Exception:
            continue

    if not successful_paths:
        raise HTTPException(
            status_code=400,
            detail="Feature extraction failed for all selected files",
        )

    save_model_path = _UMAP_MODEL_PATH if body.ids is None else None

    try:
        coords_list = await asyncio.to_thread(fit_umap_get_coords, successful_paths, save_model_path=save_model_path, n_components=3)
    except (SoundSpaceError, ValueError, Exception) as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    builtin_coords: dict[str | int, list[float]] = {}
    for idx, (sid, is_builtin) in enumerate(zip(successful_ids, successful_is_builtin, strict=True)):
        coords = coords_list[idx]
        if is_builtin:
            builtin_coords[sid] = coords
        else:
            sound = id_to_sound.get(sid)
            if sound is not None:
                sound.coords_2d = coords[:2]
                sound.coords_3d = coords[:3] if len(coords) >= 3 else [coords[0], coords[1], 0.0]

    if builtin_coords and builtin_points_raw:
        for point in builtin_points_raw:
            pid = point.get("id")
            if pid is not None and pid in builtin_coords:
                c = builtin_coords[pid]
                point["coords_2d"] = c[:2]
                point["coords_3d"] = c[:3] if len(c) >= 3 else [c[0], c[1], 0.0]
        _STATIC_META_PATH.parent.mkdir(parents=True, exist_ok=True)
        _STATIC_META_PATH.write_text(
            json.dumps({"points": builtin_points_raw}, indent=2),
            encoding="utf-8",
        )

    await db.commit()
    user_updated = sum(1 for b in successful_is_builtin if not b)
    return {"updated": user_updated + len(builtin_coords)}


@router.delete("/sounds/{sound_id}")
async def delete_sound(sound_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    """DELETE /api/sounds/:id — delete a single user sound (file + DB). Built-in IDs are not accepted."""
    try:
        sound_id_int = int(sound_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid sound id; use integer id for user sounds")
    deleted = await _delete_user_sound_by_id(sound_id_int, db)
    if not deleted:
        raise HTTPException(status_code=404, detail="Sound not found")
    return {"deleted": sound_id}
