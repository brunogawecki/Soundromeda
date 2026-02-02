"""Pydantic schemas for galaxy API responses."""
from pydantic import BaseModel, Field


class Point(BaseModel):
    """Single sound point: id, coords_2d, name, audioUrl."""

    id: str | int = Field(..., description="Sound id (string for builtin, int for user)")
    coords_2d: list[float] = Field(..., min_length=2, max_length=2)
    coords_3d: list[float] = Field(..., min_length=3, max_length=3)
    name: str
    audioUrl: str = Field(..., description="URL to audio file")


class PointsResponse(BaseModel):
    """Response for GET /api/sounds?source=builtin|user."""

    points: list[Point]
