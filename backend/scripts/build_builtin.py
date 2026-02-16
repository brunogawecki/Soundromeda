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
import shutil
import sys
from pathlib import Path

# Add backend root to path so "from app..." works when run as script
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from app.config import (
    AUDIO_DIR,
    AUDIO_EXTENSIONS_SET,
    BUILTIN_JSON_PATH,
    DEFAULT_AUDIO_SOURCE_PATH,
    UMAP_MODEL_PATH,
)


def collect_audio_files(root: Path) -> list[Path]:
    """Recursively collect all audio files under root (skip .asd and non-audio)."""
    audio_files: list[Path] = []
    for file_path in root.rglob("*"):
        if file_path.is_file() and file_path.suffix in AUDIO_EXTENSIONS_SET:
            audio_files.append(file_path)
    return sorted(audio_files)


def main() -> None:
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

    paths = [str(p) for p in audio_files]
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
        model_path=UMAP_MODEL_PATH,
        base_audio_path=base_audio_path,
        audio_root=audio_root,
    )
    print(f"Wrote {BUILTIN_JSON_PATH}, model {UMAP_MODEL_PATH}")


if __name__ == "__main__":
    main()
