"""CLI entry point: python -m app.soundspace --precompute ..."""
import argparse

from app.soundspace import build_and_write_builtin_json


def main() -> None:
    parser = argparse.ArgumentParser(description="Soundromeda sound space: precompute built-in library layout and meta")
    parser.add_argument("--precompute", nargs="+", help="Audio file paths to precompute")
    parser.add_argument("--meta", required=True, help="Output builtin.json path")
    parser.add_argument("--model", help="Save UMAP model path for transform of user uploads")
    parser.add_argument("--base-audio", default="audio/", help="Base path prefix for audio_path in meta")
    args = parser.parse_args()

    if not args.precompute:
        parser.error("--precompute requires at least one path")
    build_and_write_builtin_json(args.precompute, args.meta, model_path=args.model, base_audio_path=args.base_audio)
    print(f"Wrote {args.meta}" + (f", model {args.model}" if args.model else ""))


if __name__ == "__main__":
    main()
