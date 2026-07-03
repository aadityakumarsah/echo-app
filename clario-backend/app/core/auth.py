"""Custom JWT auth — no external auth provider required."""
import binascii
import hashlib
import hmac
import os
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from typing import Optional

from app.core.config import settings
from app.core.database import get_conn

bearer_scheme = HTTPBearer()

_ALGORITHM = "HS256"
_TOKEN_EXPIRE_DAYS = 30


# ── Password hashing ──────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    salt = os.urandom(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
    return binascii.hexlify(salt).decode() + ":" + binascii.hexlify(key).decode()


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, key_hex = stored.split(":")
    except ValueError:
        return False
    salt = binascii.unhexlify(salt_hex)
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
    return hmac.compare_digest(binascii.hexlify(key).decode(), key_hex)


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(days=_TOKEN_EXPIRE_DAYS),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=_ALGORITHM)


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[_ALGORITHM])
    except jwt.PyJWTError:
        return None


# ── User DB helpers ───────────────────────────────────────────────────────────

def create_user(email: str, password: str) -> dict | None:
    """Insert a new user; returns the user row or None if email already exists."""
    conn = get_conn()
    user_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    try:
        conn.execute(
            "INSERT INTO users (id, email, hashed_password, created_at) VALUES (?, ?, ?, ?)",
            (user_id, email.lower().strip(), hash_password(password), created_at),
        )
        conn.commit()
        return {"id": user_id, "email": email.lower().strip(), "created_at": created_at}
    except Exception:
        return None


def authenticate_user(email: str, password: str) -> dict | None:
    """Return user row if credentials are correct, else None."""
    conn = get_conn()
    row = conn.execute(
        "SELECT id, email, hashed_password, created_at FROM users WHERE email = ?",
        (email.lower().strip(),),
    ).fetchone()
    if not row:
        return None
    if not verify_password(password, row["hashed_password"]):
        return None
    return {"id": row["id"], "email": row["email"], "created_at": row["created_at"]}


def get_user_by_id(user_id: str) -> dict | None:
    conn = get_conn()
    row = conn.execute(
        "SELECT id, email, created_at FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    return dict(row) if row else None


# ── Guest user (no-auth mode) ─────────────────────────────────────────────────

GUEST_USER = {"id": "guest", "email": "guest@local", "created_at": "2024-01-01T00:00:00+00:00"}


# ── FastAPI dependencies ──────────────────────────────────────────────────────

optional_bearer = HTTPBearer(auto_error=False)


def _verify_supabase_token_via_secret(token: str) -> dict | None:
    """Fast path: verify with SUPABASE_JWT_SECRET (no network call).
    Skipped if the secret is missing or still set to the placeholder value.
    """
    secret = settings.SUPABASE_JWT_SECRET
    if not secret or secret == "your-jwt-secret":
        return None
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"], audience="authenticated")
        user_id = payload.get("sub")
        email   = payload.get("email", "")
        if not user_id:
            return None
        return {"id": user_id, "email": email, "created_at": payload.get("iat", "")}
    except jwt.PyJWTError:
        return None


def _verify_supabase_token_via_api(token: str) -> dict | None:
    """Fallback: ask Supabase to validate the token using the admin client.
    Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. One network call per request.
    """
    try:
        from app.core.supabase import get_supabase_client
        client = get_supabase_client()
        if client is None:
            return None
        resp = client.auth.get_user(token)
        u = resp.user if hasattr(resp, "user") else None
        if not u or not u.id:
            return None
        return {
            "id": str(u.id),
            "email": u.email or "",
            "created_at": str(u.created_at) if u.created_at else "",
        }
    except Exception:
        return None


def _resolve_token(token: str) -> dict | None:
    """Try Supabase JWT (secret → API fallback), then legacy custom JWT."""
    # 1. Fast: local JWT verification
    user = _verify_supabase_token_via_secret(token)
    if user:
        return user
    # 2. Fallback: ask Supabase auth API (works even without JWT secret configured)
    user = _verify_supabase_token_via_api(token)
    if user:
        return user
    # 3. Legacy: custom Clario JWT
    payload = decode_token(token)
    if not payload:
        return None
    return get_user_by_id(payload["sub"])


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_bearer),
) -> dict:
    """Returns the authenticated user, or the guest user if no token is provided."""
    if not credentials:
        return GUEST_USER
    user = _resolve_token(credentials.credentials)
    return user if user else GUEST_USER


def get_current_user_from_token(token: str | None) -> dict:
    """Verify a raw JWT string — falls back to guest user if missing/invalid."""
    if not token:
        return GUEST_USER
    user = _resolve_token(token)
    return user if user else GUEST_USER
