"""Sound space: audio embedding and 2D/3D layout for galaxy placement.

Extracts audio features (mel + MFCC), fits or applies UMAP, and exports
built-in library meta JSON. Use SoundSpaceEmbedder for all operations,
or the convenience functions below.
"""
from pathlib import Path

import numpy as np

from app.soundspace.embedding import SoundSpaceEmbedder, SoundSpaceError

__all__ = [
    "SoundSpaceEmbedder",
    "SoundSpaceError",
    "embed_single_sample",
    "fit_umap_get_coords",
    "build_and_write_builtin_json",
    "extract_features",
]


def _default_embedder() -> SoundSpaceEmbedder:
    return SoundSpaceEmbedder()


def extract_features(audio_path: str | Path) -> np.ndarray:
    """Extract feature vector from an audio file (convenience)."""
    return _default_embedder().extract_features_from_audio(audio_path)


def fit_umap_get_coords(audio_paths: list[str | Path], *, save_model_path: str | Path | None = None, n_components: int = 2, n_neighbors: int = 15, min_dist: float = 0.1) -> list[list[float]]:
    """Fit UMAP on audio files and return coordinates (convenience)."""
    return _default_embedder().fit_umap_get_coords(audio_paths, save_model_path=save_model_path, n_components=n_components, n_neighbors=n_neighbors, min_dist=min_dist)


def embed_single_sample(audio_path: str | Path, model_path: str | Path | None = None) -> list[float]:
    """Compute coordinates for one file using a saved model (convenience)."""
    return _default_embedder().embed_single_sample(audio_path, model_path=model_path)


def build_and_write_builtin_json(audio_paths: list[str | Path], meta_path: str | Path, *, model_path: str | Path | None = None, base_audio_path: str = "audio/", audio_root: str | Path | None = None) -> None:
    """Precompute layout and write built-in meta JSON (convenience)."""
    _default_embedder().build_and_write_builtin_json(audio_paths, meta_path, model_path=model_path, base_audio_path=base_audio_path, audio_root=audio_root)
