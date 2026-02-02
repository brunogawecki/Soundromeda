"""SQLAlchemy models for Soundromeda. User-uploaded sounds only; built-in from static meta."""
from sqlalchemy import JSON, String, Integer
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Declarative base for all models."""


class Sound(Base):
    """User-uploaded sound: id, coords, name, audio path. Built-in sounds come from static meta."""

    __tablename__ = "sounds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(512), nullable=False)
    coords_2d: Mapped[list[float]] = mapped_column(JSON, nullable=False)  # [x, y]
    audio_path: Mapped[str] = mapped_column(String(1024), nullable=False)  # relative path for URL
