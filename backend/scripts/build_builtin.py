#!/usr/bin/env python3
"""
Regenerate built-in library: run soundspace embedding on audio files in a directory
and write static/meta/builtin.json + static/meta/umap_model.joblib.

Requires: librosa (and soundfile or working audioread backend) for loading WAV.

Run from backend directory:
  python scripts/build_builtin.py [DIRECTORY] [--copy]

  DIRECTORY: folder containing .wav/.mp3/etc. (default: static/audio/UK_Garage_Samples)
  --copy: copy DIRECTORY into static/audio/<basename> first, then build (so the app can serve files).
"""
import argparse
import shutil
import sys
from pathlib import Path

# Backend root (parent of app) — add to path so "from app..." works when run as script
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))
STATIC = BACKEND_ROOT / "static"
AUDIO_DIR = STATIC / "audio"
DEFAULT_AUDIO_SOURCE = AUDIO_DIR / "UK_Garage_Samples"
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
    parser = argparse.ArgumentParser(
        description="Build builtin.json mapping from audio files in a directory.",
    )
    parser.add_argument(
        "directory",
        nargs="?",
        type=Path,
        default=DEFAULT_AUDIO_SOURCE,
        help=f"Folder containing audio files (default: {DEFAULT_AUDIO_SOURCE})",
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
        BUILTIN_JSON,
        model_path=UMAP_MODEL,
        base_audio_path=base_audio_path,
        audio_root=audio_root,
    )
    print(f"Wrote {BUILTIN_JSON}, model {UMAP_MODEL}")


if __name__ == "__main__":
    main()
