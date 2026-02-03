#!/usr/bin/env python3
"""
Regenerate built-in library: run soundspace embedding on static/audio/*.wav and write
static/meta/builtin.json + static/meta/umap_model.joblib.

Requires: librosa (and soundfile or working audioread backend) for loading WAV.

Run from backend directory:
  python scripts/build_builtin.py
"""
import sys
from pathlib import Path

# Backend root (parent of app) — add to path so "from app..." works when run as script
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))
STATIC = BACKEND_ROOT / "static"
AUDIO_DIR = STATIC / "audio"
UK_GARAGE = AUDIO_DIR / "UK_Garage_Samples"
META_DIR = STATIC / "meta"
BUILTIN_JSON = META_DIR / "builtin.json"
UMAP_MODEL = META_DIR / "umap_model.joblib"

AUDIO_EXTENSIONS = frozenset({".wav", ".WAV", ".mp3", ".ogg", ".flac", ".m4a", ".aac"})


def collect_audio_files(root: Path) -> list[Path]:
    """Recursively collect all audio files under root (skip .asd and non-audio)."""
    out: list[Path] = []
    for p in root.rglob("*"):
        if p.is_file() and p.suffix in AUDIO_EXTENSIONS:
            out.append(p)
    return sorted(out)


def main() -> None:
    if not UK_GARAGE.is_dir():
        print(f"Directory not found: {UK_GARAGE}")
        return

    audio_files = collect_audio_files(UK_GARAGE)
    if not audio_files:
        print("No audio files in static/audio/UK_Garage_Samples/. Add .wav or .mp3 and re-run.")
        return

    paths = [str(p) for p in audio_files]
    print(f"Precomputing layout for {len(paths)} file(s) from UK_Garage_Samples...")

    from app.soundspace import build_and_write_builtin_json

    build_and_write_builtin_json(
        paths,
        BUILTIN_JSON,
        model_path=UMAP_MODEL,
        base_audio_path="audio/",
        audio_root=AUDIO_DIR,
    )
    print(f"Wrote {BUILTIN_JSON}, model {UMAP_MODEL}")


if __name__ == "__main__":
    main()
