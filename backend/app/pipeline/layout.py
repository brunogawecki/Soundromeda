"""UMAP-based layout: fit on a set, transform new files into existing map."""
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import umap

from app.pipeline.features import extract_features


class PipelineError(Exception):
    """Raised when layout coordinates cannot be computed (e.g. no model, transform failed)."""
    pass


def precompute_layout(
    audio_paths: list[str | Path],
    *,
    save_model_path: str | Path | None = None,
    n_components: int = 2,
    n_neighbors: int = 15,
    min_dist: float = 0.1,
) -> list[list[float]]:
    """Fit UMAP on a set of audio files and return coordinates for each.

    Args:
        audio_paths: List of paths to audio files.
        save_model_path: If set, save the fitted UMAP + normalization for transform.
        n_components: Number of dimensions (2 or 3). Default 2.
        n_neighbors: UMAP n_neighbors (smaller = more local structure).
        min_dist: UMAP min_dist (0–1, lower = tighter clusters).

    Returns:
        List of coords per file; each coords is [x, y] or [x, y, z] (length n_components).
    """
    if n_components not in (2, 3):
        raise ValueError("n_components must be 2 or 3")
    if not audio_paths:
        return []

    paths = [Path(p) for p in audio_paths]
    features_list: list[np.ndarray] = []

    for p in paths:
        try:
            feat = extract_features(p)
            features_list.append(feat)
        except Exception:
            continue

    if not features_list:
        return []

    X = np.vstack(features_list)
    origin = [0.0] * n_components
    if len(X) == 1:
        return [origin]

    # Normalize per feature for stable UMAP
    X_mean = np.mean(X, axis=0)
    X_std = np.std(X, axis=0)
    X_std = np.where(X_std < 1e-8, 1.0, X_std)
    X_norm = (X - X_mean) / X_std

    n_neighbors_actual = max(2, min(n_neighbors, len(X_norm) - 1))
    reducer = umap.UMAP(
        n_components=n_components,
        n_neighbors=n_neighbors_actual,
        min_dist=min_dist,
        metric="euclidean",
        random_state=42,
    )
    embedding = reducer.fit_transform(X_norm)
    
    # Center the coordinates
    centroid = np.mean(embedding, axis=0)
    embedding = embedding - centroid

    results: list[list[float]] = [embedding[i].tolist() for i in range(len(embedding))]

    if save_model_path:
        _save_model(save_model_path, reducer=reducer, X_mean=X_mean, X_std=X_std, centroid=centroid)

    return results


def embed_and_layout(
    audio_path: str | Path,
    model_path: str | Path | None = None,
) -> list[float]:
    """Compute layout coordinates for an audio file.

    If a persisted UMAP model exists at model_path, transforms the file into
    the existing map. Otherwise raises PipelineError.

    Args:
        audio_path: Path to the audio file.
        model_path: Path to saved pipeline model (from precompute_layout). If None,
            uses default path: static/meta/umap_model.joblib relative to backend root.

    Returns:
        Coords [x, y] or [x, y, z] (length matches the model's n_components).

    Raises:
        PipelineError: If no model exists at model_path or transform fails.
    """
    path = Path(audio_path)
    if model_path is None:
        backend_root = Path(__file__).resolve().parent.parent.parent
        model_path = backend_root / "static" / "meta" / "umap_model.joblib"
    model_path = Path(model_path)

    if not model_path.exists():
        raise PipelineError(
            f"No layout model at {model_path}. Run precompute_layout with save_model_path "
            "on built-in or seed audio first."
        )
    try:
        return _transform_with_model(path, model_path)
    except Exception as e:
        raise PipelineError(f"Failed to transform {path} with model: {e}") from e


def _save_model(
    path: str | Path,
    *,
    reducer: umap.UMAP,
    X_mean: np.ndarray,
    X_std: np.ndarray,
    centroid: np.ndarray | None = None,
) -> None:
    """Persist UMAP model, normalization params and centroid for transform."""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    state = {"reducer": reducer, "X_mean": X_mean, "X_std": X_std}
    if centroid is not None:
        state["centroid"] = centroid
    joblib.dump(
        state,
        path,
        compress=3,
    )


def _load_model(path: Path) -> dict[str, Any]:
    """Load persisted pipeline model."""
    return joblib.load(path)


def _transform_with_model(audio_path: Path, model_path: Path) -> list[float]:
    """Transform a single file using a saved UMAP model."""
    data = _load_model(model_path)
    reducer = data["reducer"]
    X_mean = data["X_mean"]
    X_std = data["X_std"]

    feat = extract_features(audio_path)
    X_norm = (feat - X_mean) / np.where(X_std < 1e-8, 1.0, X_std)
    embedding = reducer.transform(X_norm.reshape(1, -1))[0]
    
    # Apply centering if we have stored centroid (or calculate from embedding if training)
    if "centroid" in data:
        embedding = embedding - data["centroid"]
        
    return embedding.tolist()
