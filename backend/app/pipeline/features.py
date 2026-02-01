"""Audio feature extraction for the layout pipeline."""
from pathlib import Path

import librosa
import numpy as np


def extract_features(audio_path: str | Path, sr: int = 22050) -> np.ndarray:
    """Extract a fixed-size feature vector from an audio file.

    Uses mel spectrogram (mean/std per band) + MFCC (mean across time) to produce
    a compact representation suitable for UMAP.

    Args:
        audio_path: Path to the audio file.
        sr: Target sample rate for loading.

    Returns:
        1D numpy array of features.
    """
    y, sr_actual = librosa.load(audio_path, sr=sr, mono=True, duration=30.0)
    # Mel spectrogram
    mel = librosa.feature.melspectrogram(y=y, sr=sr_actual, n_mels=32, fmax=8000)
    mel_db = librosa.power_to_db(mel, ref=np.max)
    mel_mean = np.mean(mel_db, axis=1)
    mel_std = np.std(mel_db, axis=1)
    mel_features = np.concatenate([mel_mean, mel_std])

    # MFCC
    mfcc = librosa.feature.mfcc(y=y, sr=sr_actual, n_mfcc=13)
    mfcc_mean = np.mean(mfcc, axis=1)
    mfcc_std = np.std(mfcc, axis=1)
    mfcc_features = np.concatenate([mfcc_mean, mfcc_std])

    return np.concatenate([mel_features, mfcc_features]).astype(np.float32)
