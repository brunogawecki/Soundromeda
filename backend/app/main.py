"""FastAPI app entry. Galaxy API and static assets mounted."""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.config import Settings
from app.database import init_db
from app.routers import sounds, upload

settings = Settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # Ensure uploads directory exists
    uploads_path = Path(__file__).resolve().parent.parent / settings.static_dir / "uploads"
    uploads_path.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title=settings.app_name, debug=settings.debug, lifespan=lifespan)

# Mount static assets (built-in meta + audio + uploads)
static_path = Path(__file__).resolve().parent.parent / settings.static_dir
static_path.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_path)), name="static")

app.include_router(sounds.router)
app.include_router(upload.router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=settings.debug)
    