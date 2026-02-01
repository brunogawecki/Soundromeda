"""CLI entry point: python -m app.pipeline --precompute ..."""
import argparse

from app.pipeline.builtin import precompute_and_save_meta


def main() -> None:
    parser = argparse.ArgumentParser(description="Soundromeda audio embedding pipeline")
    parser.add_argument("--precompute", nargs="+", help="Audio file paths to precompute")
    parser.add_argument("--meta", required=True, help="Output builtin.json path")
    parser.add_argument("--model", help="Save UMAP model path for transform of user uploads")
    parser.add_argument("--base-audio", default="audio/", help="Base path prefix for audio_path in meta")
    args = parser.parse_args()

    if not args.precompute:
        parser.error("--precompute requires at least one path")
    precompute_and_save_meta(
        args.precompute,
        args.meta,
        model_path=args.model,
        base_audio_path=args.base_audio,
    )
    print(f"Wrote {args.meta}" + (f", model {args.model}" if args.model else ""))


if __name__ == "__main__":
    main()
