"""Built-in library: precompute layout and write meta JSON for the galaxy API."""
import json
from pathlib import Path

from app.pipeline.layout import precompute_layout


def precompute_and_save_meta(
    audio_paths: list[str | Path],
    meta_path: str | Path,
    *,
    model_path: str | Path | None = None,
    base_audio_path: str = "audio/",
) -> None:
    """Precompute layout and write builtin meta JSON for the galaxy API.

    Convenience for the built-in-library task: runs precompute_layout,
    saves the model if model_path is given, and writes builtin.json
    with points (id, coords_2d, coords_3d, name, audio_path).

    Args:
        audio_paths: List of paths to audio files.
        meta_path: Output path for builtin.json.
        model_path: If set, save UMAP model here for transform of user uploads.
        base_audio_path: Prefix for audio_path in each point (e.g. "audio/").
    """
    paths = [Path(p) for p in audio_paths]
    coords_list = precompute_layout(paths, save_model_path=model_path)

    points = []
    for i, (path, (coords_2d, coords_3d)) in enumerate(zip(paths, coords_list)):
        name = path.stem or path.name
        rel = path.name
        points.append({
            "id": f"builtin-{i}",
            "coords_2d": coords_2d,
            "coords_3d": coords_3d,
            "name": name,
            "audio_path": base_audio_path + rel,
        })

    meta_path = Path(meta_path)
    meta_path.parent.mkdir(parents=True, exist_ok=True)
    meta_path.write_text(json.dumps({"points": points}, indent=2), encoding="utf-8")
