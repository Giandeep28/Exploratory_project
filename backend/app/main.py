from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy import text
from app.auth import require_auth
from app.config import settings
from app.db import SessionLocal, engine
from app.models import User

from app.routers import auth, calendar, dashboard, imports, inventory, sales, suppliers


@asynccontextmanager
async def lifespan(_app):
    if settings.app_username and settings.app_password_hash:
        with SessionLocal() as db:
            admin = db.scalar(select(User).where(User.role == "admin"))
            if admin is None:
                db.add(User(username=settings.app_username, password_hash=settings.app_password_hash, role="admin"))
                db.commit()
    yield


app = FastAPI(title="Medicine Inventory API", version="1.0.0", lifespan=lifespan)
origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
if origins:
    app.add_middleware(CORSMiddleware, allow_origins=origins,
        allow_methods=["GET", "POST", "PATCH"], allow_headers=["Content-Type", "Authorization"])
app.include_router(auth.router, prefix="/api")
protected = [Depends(require_auth)]
app.include_router(inventory.router, prefix="/api", dependencies=protected)
app.include_router(sales.router, prefix="/api", dependencies=protected)
app.include_router(dashboard.router, prefix="/api", dependencies=protected)
app.include_router(imports.router, prefix="/api", dependencies=protected)
app.include_router(suppliers.router, prefix="/api", dependencies=protected)
app.include_router(calendar.router, prefix="/api", dependencies=protected)


@app.get("/health")
def health():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"status": "ok"}
