"""Galaxy API routes: GET /api/sounds, hide/show built-in, delete, recalculate UMAP (all-user, all, selected)."""
import asyncio
import json
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import (
    BUILTIN_JSON_PATH,
    HIDDEN_BUILTIN_JSON_PATH,
    META_DIR,
    STATIC_PATH,
    UMAP_MODEL_PATH,
)
from app.database import get_db
from app.models import Sound
from app.schemas import Point, PointsResponse
from app.soundspace import SoundSpaceError, fit_umap_get_coords
from app.soundspace.embedding import SoundSpaceEmbedder

router = APIRouter(prefix="/api", tags=["sounds"])


class IdsBody(BaseModel):
    """Request body for hide/show built-in: list of built-in sound IDs."""

    ids: list[str] = []


class BulkIdsBody(BaseModel):
    """Request body for bulk delete or recalculate selected: list of user sound IDs (integers)."""

    ids: list[int] = []


def _static_file_path(relative_path: str) -> Path:
    """Resolve static file path from relative audio_path (e.g. uploads/foo.wav)."""
    return STATIC_PATH / relative_path.lstrip("/")


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


# --- Built-in sounds data model ---
# Built-in sounds live in static/meta/builtin.json (id, coords_2d, coords_3d, name, audio_path).
# User sounds live in the DB (Sound table). The API returns both as "points" for the galaxy.
# Hidden built-in IDs are stored in static/meta/hidden_builtin.json so we can hide/show without
# changing builtin.json. The helpers below support: loading points for API responses, resolving
# audio paths for UMAP (recalculate), and reading/writing the hidden list.


def _base_url(request: Request) -> str:
    """Base URL for building audioUrl (no trailing slash). Used when returning points so the frontend can play /static/... URLs."""
    return str(request.base_url).rstrip("/")


def _load_builtin_json() -> list[dict]:
    """Load and parse builtin.json → list of raw dicts. Single source for all builtin data access."""
    if not BUILTIN_JSON_PATH.exists():
        return []
    data = json.loads(BUILTIN_JSON_PATH.read_text(encoding="utf-8"))
    items = data.get("points", data) if isinstance(data, dict) else data
    return list(items) if isinstance(items, list) else []


def _load_hidden_builtin_ids() -> set[str]:
    """IDs of built-in sounds the user has chosen to hide."""
    if not HIDDEN_BUILTIN_JSON_PATH.exists():
        return set()
    try:
        data = json.loads(HIDDEN_BUILTIN_JSON_PATH.read_text(encoding="utf-8"))
        ids = data.get("hidden_ids", [])
        return set(ids) if isinstance(ids, list) else set()
    except (json.JSONDecodeError, KeyError, OSError):
        return set()


def _save_hidden_builtin_ids(hidden_ids: list[str]) -> None:
    """Persist the hidden built-in list."""
    META_DIR.mkdir(parents=True, exist_ok=True)
    HIDDEN_BUILTIN_JSON_PATH.write_text(
        json.dumps({"hidden_ids": hidden_ids}, indent=2), encoding="utf-8"
    )


# --- Point construction helpers (single source for ORM → Point and dict → Point) ---


def _normalize_audio_url(item: dict, base: str) -> str:
    """Turn a builtin dict's audio_path/audioUrl into an absolute URL."""
    url = item.get("audioUrl") or f"/static/{item.get('audio_path', 'audio/')}"
    if url.startswith(("http://", "https://")):
        return url
    return f"{base}/{url.lstrip('/')}"


def _sound_to_point(sound: Sound, base: str) -> Point:
    """User Sound ORM row → Point."""
    path = sound.audio_path
    url = f"{base}/static/{path}" if not path.startswith("/") else f"{base}{path}"
    return Point(id=sound.id, coords_2d=sound.coords_2d, coords_3d=sound.coords_3d, name=sound.name, audioUrl=url)


def _builtin_to_point(item: dict, base: str) -> Point:
    """Raw builtin dict → Point."""
    return Point(
        id=item["id"],
        coords_2d=item["coords_2d"],
        coords_3d=item.get("coords_3d", [0, 0, 0]),
        name=item["name"],
        audioUrl=_normalize_audio_url(item, base),
    )


def _load_builtin_points(request: Request) -> list[Point]:
    """Visible builtin sounds as Point list (hidden IDs filtered out)."""
    hidden = _load_hidden_builtin_ids()
    base = _base_url(request)
    return [
        _builtin_to_point(item, base)
        for item in _load_builtin_json()
        if str(item.get("id", "")) not in hidden
    ]


def _builtin_audio_path(item: dict) -> str | None:
    """Relative path under static/ for a builtin point (for UMAP feature extraction)."""
    if path := item.get("audio_path"):
        return path
    url = item.get("audioUrl") or ""
    if "/static/" in url:
        return url.split("/static/", 1)[-1].lstrip("/")
    return None


# ----- Recalculate mapping helpers -----


def _collect_user_sounds_for_umap(
    sounds: list[Sound],
    embedder: SoundSpaceEmbedder,
) -> tuple[list[Path], list[int]]:
    """Run feature extraction on each sound; return (successful_paths, successful_ids) in same order."""
    paths: list[Path] = []
    ids: list[int] = []
    for sound in sounds:
        path = _static_file_path(sound.audio_path)
        try:
            embedder.extract_features_from_audio(path)
            paths.append(path)
            ids.append(sound.id)
        except Exception:
            continue
    return paths, ids


def _collect_builtin_for_umap(
    builtin_points_raw: list[dict],
    embedder: SoundSpaceEmbedder,
) -> tuple[list[Path], list[str | int], list[dict]]:
    """Run feature extraction on each builtin point; return (successful_paths, successful_ids, original_points)."""
    paths: list[Path] = []
    ids: list[str | int] = []
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
            paths.append(path)
            ids.append(bid)
        except Exception:
            continue
    return paths, ids, builtin_points_raw


async def _run_umap_and_apply(
    *,
    successful_paths: list[Path],
    successful_user_ids: list[int],
    id_to_sound: dict[int, Sound],
    save_model: bool,
    user_coords_offset: int = 0,
    successful_builtin_ids: list[str | int] | None = None,
    builtin_points_raw: list[dict] | None = None,
    db: AsyncSession,
) -> int:
    """Fit UMAP on paths, update user Sound rows (and optionally builtin.json). Path order must be [builtin..., user...] when successful_builtin_ids is set; user_coords_offset is the start index for user coords."""
    if not successful_paths:
        raise HTTPException(
            status_code=400,
            detail="Feature extraction failed for all selected files",
        )
    save_path = UMAP_MODEL_PATH if save_model else None
    try:
        coords_list = await asyncio.to_thread(
            fit_umap_get_coords, successful_paths, save_model_path=save_path, n_components=3
        )
    except (SoundSpaceError, ValueError, Exception) as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    updated = 0
    for i, uid in enumerate(successful_user_ids):
        idx = user_coords_offset + i
        if idx >= len(coords_list):
            break
        coords = coords_list[idx]
        sound = id_to_sound.get(uid)
        if sound is not None:
            sound.coords_2d = coords[:2]
            sound.coords_3d = coords[:3] if len(coords) >= 3 else [coords[0], coords[1], 0.0]
            updated += 1

    if successful_builtin_ids is not None and builtin_points_raw is not None:
        builtin_coords_by_id = {
            bid: coords_list[j] for j, bid in enumerate(successful_builtin_ids) if j < len(coords_list)
        }
        for point in builtin_points_raw:
            pid = point.get("id")
            if pid is not None and pid in builtin_coords_by_id:
                c = builtin_coords_by_id[pid]
                point["coords_2d"] = c[:2]
                point["coords_3d"] = c[:3] if len(c) >= 3 else [c[0], c[1], 0.0]
                updated += 1
        META_DIR.mkdir(parents=True, exist_ok=True)
        BUILTIN_JSON_PATH.write_text(
            json.dumps({"points": builtin_points_raw}, indent=2),
            encoding="utf-8",
        )

    await db.commit()
    return updated


# ----- Routes -----


@router.get("/sounds/hidden-builtin")
async def get_hidden_builtin_ids() -> dict:
    """GET /api/sounds/hidden-builtin — returns list of currently hidden built-in sound IDs."""
    return {"hidden_ids": list(_load_hidden_builtin_ids())}


@router.get("/sounds/builtin-ids")
async def get_all_builtin_ids() -> dict:
    """GET /api/sounds/builtin-ids — returns all built-in sound IDs (including hidden)."""
    ids = [str(item["id"]) for item in _load_builtin_json() if item.get("id") is not None]
    return {"ids": ids}


@router.get("/sounds", response_model=PointsResponse)
async def get_sounds(source: Literal["builtin", "user"], request: Request, db: AsyncSession = Depends(get_db)) -> PointsResponse:
    """GET /api/sounds?source=builtin|user — returns { points: [...] }."""
    if source == "builtin":
        return PointsResponse(points=_load_builtin_points(request))
    result = await db.execute(select(Sound))
    base = _base_url(request)
    points = [_sound_to_point(s, base) for s in result.scalars().all()]
    return PointsResponse(points=points)


@router.get("/sounds/{sound_id}", response_model=Point)
async def get_sound_by_id(sound_id: str, request: Request, db: AsyncSession = Depends(get_db)) -> Point:
    """GET /api/sounds/:id — single sound meta + audioUrl."""
    base = _base_url(request)
    # Try user sound (integer id) first
    try:
        primary_key = int(sound_id)
    except ValueError:
        primary_key = None
    if primary_key is not None:
        result = await db.execute(select(Sound).where(Sound.id == primary_key))
        if sound := result.scalar_one_or_none():
            return _sound_to_point(sound, base)
    # Fall back to builtin
    for p in _load_builtin_points(request):
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


# ----- Recalculate mapping endpoints -----


@router.post("/sounds/recalculate-mapping/all-user")
async def recalculate_mapping_all_user(db: AsyncSession = Depends(get_db)) -> dict:
    """POST /api/sounds/recalculate-mapping/all-user — fit UMAP on all user sounds only, update coords, save model."""
    result = await db.execute(select(Sound))
    sounds = result.scalars().all()
    embedder = SoundSpaceEmbedder()
    successful_paths, successful_ids = _collect_user_sounds_for_umap(sounds, embedder)
    id_to_sound = {s.id: s for s in sounds}
    updated = await _run_umap_and_apply(
        successful_paths=successful_paths,
        successful_user_ids=successful_ids,
        id_to_sound=id_to_sound,
        save_model=True,
        db=db,
    )
    return {"updated": updated}


@router.post("/sounds/recalculate-mapping/all")
async def recalculate_mapping_all(db: AsyncSession = Depends(get_db)) -> dict:
    """POST /api/sounds/recalculate-mapping/all — fit UMAP on built-in + all user sounds, update both, save model."""
    embedder = SoundSpaceEmbedder()
    builtin_points_raw = _load_builtin_json()
    b_paths, b_ids, _ = _collect_builtin_for_umap(builtin_points_raw, embedder)
    result = await db.execute(select(Sound))
    sounds = result.scalars().all()
    u_paths, u_ids = _collect_user_sounds_for_umap(sounds, embedder)
    if not b_paths and not u_paths:
        raise HTTPException(
            status_code=400,
            detail="Feature extraction failed for all files",
        )
    # Order: builtin first, then user (must match _run_umap_and_apply expectations)
    all_paths = b_paths + u_paths
    id_to_sound = {s.id: s for s in sounds}
    updated = await _run_umap_and_apply(
        successful_paths=all_paths,
        successful_user_ids=u_ids,
        id_to_sound=id_to_sound,
        save_model=True,
        user_coords_offset=len(b_ids),
        successful_builtin_ids=b_ids if b_ids else None,
        builtin_points_raw=builtin_points_raw if b_ids else None,
        db=db,
    )
    return {"updated": updated}


@router.post("/sounds/recalculate-mapping/selected")
async def recalculate_mapping_selected(body: BulkIdsBody, db: AsyncSession = Depends(get_db)) -> dict:
    """POST /api/sounds/recalculate-mapping/selected — fit UMAP on selected user sounds only; do not save model."""
    if not body.ids:
        raise HTTPException(status_code=400, detail="No sound ids provided")
    result = await db.execute(select(Sound).where(Sound.id.in_(body.ids)))
    sounds = result.scalars().all()
    embedder = SoundSpaceEmbedder()
    successful_paths, successful_ids = _collect_user_sounds_for_umap(sounds, embedder)
    id_to_sound = {s.id: s for s in sounds}
    updated = await _run_umap_and_apply(
        successful_paths=successful_paths,
        successful_user_ids=successful_ids,
        id_to_sound=id_to_sound,
        save_model=False,
        db=db,
    )
    return {"updated": updated}


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
