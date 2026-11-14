from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import hash_password, issue_token, require_auth, verify_password
from app.config import settings
from app.db import get_db
from app.models import User

router = APIRouter(tags=["authentication"])


class LoginInput(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=256)


class AdminCredentials(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    username: str | None = Field(default=None, min_length=1, max_length=100)
    new_password: str | None = Field(default=None, min_length=12, max_length=256)


class NewUser(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=12, max_length=256)


@router.post("/auth/login")
def login(payload: LoginInput, db: Session = Depends(get_db)):
    if not settings.app_username or not settings.app_password_hash or len(settings.token_secret) < 32:
        raise HTTPException(503, "Login is not configured")
    user = db.scalar(select(User).where(User.username == payload.username, User.is_active.is_(True)))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Incorrect username or password")
    return {"access_token": issue_token(user), "token_type": "bearer",
            "expires_in": settings.token_ttl_minutes * 60, "username": user.username, "role": user.role}


@router.get("/auth/me")
def current_profile(user: User = Depends(require_auth)):
    return {"id": user.id, "username": user.username, "role": user.role}


@router.get("/auth/users")
def list_users(admin: User = Depends(require_auth), db: Session = Depends(get_db)):
    if admin.role != "admin":
        raise HTTPException(403, "Only an admin can manage user accounts")
    users = db.scalars(select(User).order_by(User.username)).all()
    return [{"id": user.id, "username": user.username, "role": user.role,
             "is_active": user.is_active} for user in users]


@router.patch("/auth/me/credentials")
def update_admin_credentials(payload: AdminCredentials, user: User = Depends(require_auth),
                             db: Session = Depends(get_db)):
    if user.role != "admin":
        raise HTTPException(403, "Only an admin can change account credentials")
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(401, "Current password is incorrect")
    if payload.username:
        existing = db.scalar(select(User.id).where(User.username == payload.username, User.id != user.id))
        if existing:
            raise HTTPException(409, "Username is already in use")
        user.username = payload.username
    if payload.new_password:
        user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"id": user.id, "username": user.username, "role": user.role}


@router.post("/auth/users", status_code=201)
def create_regular_user(payload: NewUser, admin: User = Depends(require_auth), db: Session = Depends(get_db)):
    if admin.role != "admin":
        raise HTTPException(403, "Only an admin can create user accounts")
    user = User(username=payload.username, password_hash=hash_password(payload.password), role="user")
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Username is already in use") from exc
    db.refresh(user)
    return {"id": user.id, "username": user.username, "role": user.role}
