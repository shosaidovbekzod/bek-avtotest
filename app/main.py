from pathlib import Path
from threading import Thread
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import ROOT_DIR, get_settings
from .database import Base, SessionLocal, engine
from .face_auth import FaceAuthError, warm_face_cache
from .routers import admin, auth, quiz
from .seed import seed_database


settings = get_settings()
app = FastAPI(title=settings.app_name)

app.include_router(auth.router)
app.include_router(quiz.router)
app.include_router(admin.router)

app.mount("/static", StaticFiles(directory=ROOT_DIR / "static"), name="static")
app.mount("/materials", StaticFiles(directory=ROOT_DIR / "assets"), name="materials")

drawables_dir = ROOT_DIR / "res" / "drawable"
if drawables_dir.exists():
    app.mount("/drawables", StaticFiles(directory=drawables_dir), name="drawables")


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_database(db)
    if settings.face_id_enabled:
        def warm_cache() -> None:
            try:
                warm_face_cache(settings.face_id_images_dir)
            except FaceAuthError:
                pass

        Thread(target=warm_cache, name="face-id-cache", daemon=True).start()


@app.get("/")
def index() -> FileResponse:
    return FileResponse(Path(ROOT_DIR / "static" / "index.html"))


@app.get("/{path:path}")
def spa_fallback(path: str) -> FileResponse:
    if path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API route not found")
    return FileResponse(Path(ROOT_DIR / "static" / "index.html"))
