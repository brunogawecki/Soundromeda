"""Sound space embedding: audio features, UMAP layout, and built-in meta export.

This module turns audio files into 2D/3D coordinates for galaxy placement by
extracting features (mel + MFCC), fitting or applying a UMAP model, and
optionally exporting built-in library metadata.
"""
from pathlib import Path
from typing import Any

import joblib
import librosa
import numpy as np
import umap


class SoundSpaceError(Exception):
    """Raised when coordinates cannot be computed (e.g. no model, transform failed)."""
    pass


class SoundSpaceEmbedder:
    """Embeds audio files into a 2D/3D space for galaxy visualization.

    Handles feature extraction, UMAP fit/transform, model persistence,
    and built-in library meta JSON export.
    """

    def __init__(
        self,
        *,
        sample_rate: int = 22050,
        n_fft: int = 256,
        n_mels: int = 32,
        n_mfcc: int = 13,
        max_duration_sec: float = 30.0,
    ) -> None:
        self.sample_rate = sample_rate
        self.n_fft = n_fft
        self.n_mels = n_mels
        self.n_mfcc = n_mfcc
        self.max_duration_sec = max_duration_sec

    def extract_features_from_audio(self, audio_path: str | Path) -> np.ndarray:
        """Extract a fixed-size feature vector from an audio file.

        Uses mel spectrogram (mean/std per band) + MFCC (mean/std across time)
        to produce a compact representation suitable for UMAP.

        Args:
            audio_path: Path to the audio file.

        Returns:
            1D numpy array of features (float32).
        """
        y, sr = librosa.load(
            audio_path,
            sr=self.sample_rate,
            mono=True,
            duration=self.max_duration_sec,
        )
        mel = librosa.feature.melspectrogram(
            y=y, sr=sr, n_fft=self.n_fft, n_mels=self.n_mels, fmax=8000
        )
        mel_db = librosa.power_to_db(mel, ref=np.max)
        mel_mean = np.mean(mel_db, axis=1)
        mel_std = np.std(mel_db, axis=1)
        mel_features = np.concatenate([mel_mean, mel_std])

        mfcc = librosa.feature.mfcc(
            y=y, sr=sr, n_fft=self.n_fft, n_mfcc=self.n_mfcc
        )
        mfcc_mean = np.mean(mfcc, axis=1)
        mfcc_std = np.std(mfcc, axis=1)
        mfcc_features = np.concatenate([mfcc_mean, mfcc_std])

        return np.concatenate([mel_features, mfcc_features]).astype(np.float32)

    def fit_umap_get_coords(
        self,
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
            save_model_path: If set, save the fitted UMAP and normalization for later transform.
            n_components: Number of dimensions (2 or 3).
            n_neighbors: UMAP n_neighbors (smaller = more local structure).
            min_dist: UMAP min_dist (0–1, lower = tighter clusters).

        Returns:
            List of coords per file; each is [x, y] or [x, y, z] (length n_components).
        """
        if n_components not in (2, 3):
            raise ValueError("n_components must be 2 or 3")
        if not audio_paths:
            return []

        paths = [Path(p) for p in audio_paths]
        features_list: list[np.ndarray] = []
        for p in paths:
            try:
                features_list.append(self.extract_features_from_audio(p))
            except Exception:
                continue

        if not features_list:
            return []

        X = np.vstack(features_list)
        if len(X) == 1:
            return [[0.0] * n_components]

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
        centroid = np.mean(embedding, axis=0)
        embedding = embedding - centroid

        coords_list: list[list[float]] = [
            embedding[i].tolist() for i in range(len(embedding))
        ]

        if save_model_path:
            self._save_umap_model(
                save_model_path,
                reducer=reducer,
                X_mean=X_mean,
                X_std=X_std,
                centroid=centroid,
            )

        return coords_list

    def embed_single_sample(
        self,
        audio_path: str | Path,
        model_path: str | Path | None = None,
    ) -> list[float]:
        """Compute layout coordinates for a single audio file using a saved model.

        Transforms the file into the existing UMAP space. Requires a model
        previously saved via fit_umap_get_coords(..., save_model_path=...).

        Args:
            audio_path: Path to the audio file.
            model_path: Path to saved model. If None, uses backend static/meta/umap_model.joblib.

        Returns:
            Coords [x, y] or [x, y, z] (length matches the model's n_components).

        Raises:
            SoundSpaceError: If no model exists at model_path or transform fails.
        """
        path = Path(audio_path)
        if model_path is None:
            backend_root = Path(__file__).resolve().parent.parent.parent
            model_path = backend_root / "static" / "meta" / "umap_model.joblib"
        model_path = Path(model_path)

        if not model_path.exists():
            raise SoundSpaceError(
                f"No layout model at {model_path}. Run fit_umap_get_coords with save_model_path "
                "on built-in or seed audio first."
            )
        try:
            return self._transform_with_umap_model(path, model_path)
        except Exception as e:
            raise SoundSpaceError(
                f"Failed to transform {path} with model: {e}"
            ) from e

    def build_and_write_builtin_json(
        self,
        audio_paths: list[str | Path],
        meta_path: str | Path,
        *,
        model_path: str | Path | None = None,
        base_audio_path: str = "audio/",
        audio_root: str | Path | None = None,
    ) -> None:
        """Precompute layout and write built-in meta JSON for the galaxy API.

        Runs fit_umap_get_coords, optionally saves the model, and writes a JSON file
        with points (id, coords_2d, coords_3d, name, audio_path).

        Args:
            audio_paths: List of paths to audio files.
            meta_path: Output path for the meta JSON (e.g. builtin.json).
            model_path: If set, save UMAP model here for transform of user uploads.
            base_audio_path: Prefix for audio_path in each point (e.g. "audio/").
            audio_root: If set, audio_path is base_audio_path + path relative to this.
        """
        import json

        paths = [Path(p).resolve() for p in audio_paths]
        coords_list = self.fit_umap_get_coords(
            paths,
            save_model_path=model_path,
            n_components=3,
        )
        root = Path(audio_root).resolve() if audio_root else None

        points = []
        for i, (path, coords) in enumerate(zip(paths, coords_list)):
            coords_2d = coords[:2]
            coords_3d = coords[:3]
            name = path.stem or path.name
            if root is not None:
                try:
                    rel = path.relative_to(root)
                except ValueError:
                    rel = path.name
            else:
                rel = path.name
            rel_str = str(rel).replace("\\", "/")
            points.append({
                "id": f"builtin-{i}",
                "coords_2d": coords_2d,
                "coords_3d": coords_3d,
                "name": name,
                "audio_path": base_audio_path + rel_str,
            })

        meta_path = Path(meta_path)
        meta_path.parent.mkdir(parents=True, exist_ok=True)
        meta_path.write_text(
            json.dumps({"points": points}, indent=2),
            encoding="utf-8",
        )

    def _save_umap_model(
        self,
        path: str | Path,
        *,
        reducer: umap.UMAP,
        X_mean: np.ndarray,
        X_std: np.ndarray,
        centroid: np.ndarray | None = None,
    ) -> None:
        """Persist UMAP model and normalization params for transform."""
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        state: dict[str, Any] = {
            "reducer": reducer,
            "X_mean": X_mean,
            "X_std": X_std,
        }
        if centroid is not None:
            state["centroid"] = centroid
        joblib.dump(state, path, compress=3)

    def _load_umap_model(self, path: Path) -> dict[str, Any]:
        """Load persisted UMAP model and normalization params."""
        return joblib.load(path)

    def _transform_with_umap_model(
        self, audio_path: Path, model_path: Path
    ) -> list[float]:
        """Transform a single file using a saved UMAP model."""
        data = self._load_umap_model(model_path)
        reducer = data["reducer"]
        X_mean = data["X_mean"]
        X_std = data["X_std"]

        feat = self.extract_features_from_audio(audio_path)
        X_std_safe = np.where(X_std < 1e-8, 1.0, X_std)
        X_norm = (feat - X_mean) / X_std_safe
        embedding = reducer.transform(X_norm.reshape(1, -1))[0]

        if "centroid" in data:
            embedding = embedding - data["centroid"]

        return embedding.tolist()
