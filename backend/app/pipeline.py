"""Audio embedding and layout pipeline. Produces 2D/3D coords for galaxy placement.

This module provides a stub implementation. The full python-pipeline task will add
librosa feature extraction and UMAP/t-SNE for real embedding placement.
"""
import hashlib
from pathlib import Path


def embed_and_layout(audio_path: str | Path) -> tuple[list[float], list[float]]:
    """Compute 2D and 3D coordinates for an audio file.

    Stub implementation: returns deterministic coords derived from file path hash.
    The full pipeline will use librosa (mel/MFCC) + UMAP/t-SNE.

    Args:
        audio_path: Path to the audio file.

    Returns:
        Tuple of (coords_2d, coords_3d) where each is [x, y] or [x, y, z].
    """
    path_str = str(audio_path)
    h = hashlib.sha256(path_str.encode()).hexdigest()
    # Use hash bytes to generate deterministic coords in [-2, 2]
    vals = [int(h[i : i + 2], 16) / 127.5 - 1.0 for i in range(0, 12, 2)]
    coords_2d = [vals[0] * 2, vals[1] * 2]
    coords_3d = [vals[0] * 2, vals[1] * 2, vals[2] * 2]
    return coords_2d, coords_3d
