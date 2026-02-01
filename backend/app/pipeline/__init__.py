"""Audio embedding and layout pipeline. Produces 2D/3D coords for galaxy placement.

Modules:
- features: Audio feature extraction (librosa mel + MFCC)
- layout: UMAP-based layout, model persistence, transform
- builtin: Precompute and write built-in meta JSON
"""
from app.pipeline.features import extract_features
from app.pipeline.layout import PipelineError, embed_and_layout, precompute_layout
from app.pipeline.builtin import precompute_and_save_meta

__all__ = [
    "extract_features",
    "embed_and_layout",
    "precompute_layout",
    "precompute_and_save_meta",
    "PipelineError",
]
