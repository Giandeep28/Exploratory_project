import base64
import getpass
import hashlib
import hmac
import json
import secrets
import time

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import User

ITERATIONS = 310_000


def hash_password(password: str) -> str:
    if len(password) < 12:
        raise ValueError("Use a password with at least 12 characters")
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), ITERATIONS).hex()
    return f"{salt}:{digest}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        salt, expected = encoded.split(":", 1)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), ITERATIONS).hex()
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def issue_token(user: User) -> str:
    payload = base64.urlsafe_b64encode(json.dumps({
        "sub": user.username, "uid": user.id, "exp": int(time.time()) + settings.token_ttl_minutes * 60,
    }, separators=(",", ":")).encode()).rstrip(b"=")
    signature = hmac.new(settings.token_secret.encode(), payload, hashlib.sha256).digest()
    return f"{payload.decode()}.{base64.urlsafe_b64encode(signature).rstrip(b'=').decode()}"


def require_auth(authorization: str = Header(default=""), db: Session = Depends(get_db)):
    if not settings.app_username or not settings.app_password_hash or len(settings.token_secret) < 32:
        raise HTTPException(503, "Login is not configured")
    try:
        scheme, token = authorization.split(" ", 1)
        payload_text, signature_text = token.split(".", 1)
        payload = payload_text.encode()
        expected = hmac.new(settings.token_secret.encode(), payload, hashlib.sha256).digest()
        signature = base64.urlsafe_b64decode(signature_text + "=" * (-len(signature_text) % 4))
        data = json.loads(base64.urlsafe_b64decode(payload_text + "=" * (-len(payload_text) % 4)))
        valid = scheme.lower() == "bearer" and hmac.compare_digest(signature, expected) and data["exp"] > time.time()
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        raise HTTPException(401, "Login expired or invalid")
    user = db.scalar(select(User).where(User.id == data.get("uid"), User.is_active.is_(True))) if valid else None
    if not user or user.username != data.get("sub"):
        raise HTTPException(401, "Login expired or invalid")
    return user


if __name__ == "__main__":
    try:
        print(hash_password(getpass.getpass("New login password (12+ characters): ")))
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
