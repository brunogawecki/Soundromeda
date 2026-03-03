#!/usr/bin/env python3
"""
Regenerate built-in library: run soundspace embedding on audio files in a directory
and write static/meta/builtin.json + static/meta/umap_model.joblib.

Requires: librosa (and soundfile or working audioread backend) for loading WAV.

Run from backend directory:
  python scripts/build_builtin.py [DIRECTORY] [--copy]

  DIRECTORY: folder containing .wav/.mp3/etc. (default from config: static/audio/<default_audio_source>)
  --copy: copy DIRECTORY into static/audio/<basename> first, then build (so the app can serve files).
"""
import argparse
import logging
import shutil
import sys
from pathlib import Path
import librosa

# Add backend root to path so "from app..." works when run as script
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from app.config import (
    AUDIO_DIR,
    AUDIO_EXTENSIONS_SET,
    BUILTIN_JSON_PATH,
    DEFAULT_AUDIO_SOURCE_PATH,
    MAX_SAMPLE_DURATION_SEC,
    UMAP_MODEL_2D_PATH,
    UMAP_MODEL_3D_PATH,
)

logger = logging.getLogger(__name__)


def collect_audio_files(root: Path) -> list[Path]:
    """Recursively collect all audio files under root (skip .asd and non-audio)."""
    audio_files: list[Path] = []
    for file_path in root.rglob("*"):
        if file_path.is_file() and file_path.suffix in AUDIO_EXTENSIONS_SET:
            audio_files.append(file_path)
    return sorted(audio_files)


def filter_by_max_duration(audio_files: list[Path], max_duration_sec: float) -> list[str]:
    """Keep only files with duration <= max_duration_sec; log skipped count."""
    paths: list[str] = []
    skipped = 0
    for path in audio_files:
        try:
            duration_sec = librosa.get_duration(path=path)
            if duration_sec <= max_duration_sec:
                paths.append(str(path))
            else:
                skipped += 1
        except Exception as e:
            logger.warning(f"Could not get duration for {path}: {e}")
            skipped += 1
    if skipped:
        logger.info(f"{skipped} file(s) exceeding {max_duration_sec:.1f}s duration skipped")
    return paths


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)s: %(message)s",
    )
    parser = argparse.ArgumentParser(
        description="Build builtin.json mapping from audio files in a directory.",
    )
    parser.add_argument(
        "directory",
        nargs="?",
        type=Path,
        default=DEFAULT_AUDIO_SOURCE_PATH,
        help=f"Folder containing audio files (default: {DEFAULT_AUDIO_SOURCE_PATH})",
    )
    parser.add_argument(
        "--copy",
        action="store_true",
        help="Copy directory into static/audio first so the app can serve the files",
    )
    args = parser.parse_args()
    source_dir = args.directory.resolve()

    if not source_dir.is_dir():
        print(f"Directory not found: {source_dir}")
        return

    if args.copy:
        dest = AUDIO_DIR / source_dir.name
        dest.parent.mkdir(parents=True, exist_ok=True)
        print(f"Copying {source_dir} -> {dest}...")
        shutil.copytree(source_dir, dest, dirs_exist_ok=True)
        source_dir = dest
        print(f"Copied. Building from {source_dir}")

    audio_files = collect_audio_files(source_dir)
    if not audio_files:
        print(f"No audio files in {source_dir}. Add .wav, .mp3, etc. and re-run.")
        return

    logger.info(f"Checking for files exceeding {MAX_SAMPLE_DURATION_SEC}s duration...")
    paths = filter_by_max_duration(audio_files, MAX_SAMPLE_DURATION_SEC)
    if not paths:
        print(f"No audio files within {MAX_SAMPLE_DURATION_SEC}s in {source_dir}.")
        return

    print(f"Precomputing layout for {len(paths)} file(s) from {source_dir}...")

    # Paths in builtin.json: relative to source dir; prefix only when under static/audio
    try:
        source_dir.relative_to(AUDIO_DIR)
        base_audio_path = "audio/"
        audio_root = AUDIO_DIR
    except ValueError:
        base_audio_path = ""
        audio_root = source_dir

    from app.soundspace import build_and_write_builtin_json

    build_and_write_builtin_json(
        paths,
        BUILTIN_JSON_PATH,
        model_path_2d=UMAP_MODEL_2D_PATH,
        model_path_3d=UMAP_MODEL_3D_PATH,
        base_audio_path=base_audio_path,
        audio_root=audio_root,
    )
    print(f"Wrote {BUILTIN_JSON_PATH}, models {UMAP_MODEL_2D_PATH} and {UMAP_MODEL_3D_PATH}")


if __name__ == "__main__":
    main()
