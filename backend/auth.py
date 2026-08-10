import hashlib
import hmac
import json
import base64
import time
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import Response
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(s: str) -> bytes:
    s += "=" * (4 - len(s) % 4)
    return base64.urlsafe_b64decode(s)


def _jwt_encode(payload: dict, secret: str) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    # Convert datetime to timestamp
    p = {}
    for k, v in payload.items():
        if isinstance(v, datetime):
            p[k] = int(v.timestamp())
        else:
            p[k] = v
    segments = [
        _b64url_encode(json.dumps(header).encode()),
        _b64url_encode(json.dumps(p).encode()),
    ]
    signing_input = f"{segments[0]}.{segments[1]}".encode()
    signature = hmac.new(secret.encode(), signing_input, hashlib.sha256).digest()
    segments.append(_b64url_encode(signature))
    return ".".join(segments)


def _jwt_decode(token: str, secret: str) -> dict | None:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        signing_input = f"{parts[0]}.{parts[1]}".encode()
        expected_sig = hmac.new(secret.encode(), signing_input, hashlib.sha256).digest()
        actual_sig = _b64url_decode(parts[2])
        if not hmac.compare_digest(expected_sig, actual_sig):
            return None
        payload = json.loads(_b64url_decode(parts[1]))
        if "exp" in payload and payload["exp"] < time.time():
            return None
        return payload
    except Exception:
        return None


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def hash_pin(pin: str) -> str:
    return bcrypt.hashpw(pin.encode(), bcrypt.gensalt()).decode()


def verify_pin(pin: str, hashed: str) -> bool:
    return bcrypt.checkpw(pin.encode(), hashed.encode())


def create_access_token(user_id: int, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(user_id), "role": role, "exp": expire, "type": "access"}
    return _jwt_encode(payload, settings.SECRET_KEY)


def create_refresh_token(user_id: int) -> tuple[str, datetime]:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {"sub": str(user_id), "exp": expire, "type": "refresh"}
    token = _jwt_encode(payload, settings.SECRET_KEY)
    return token, expire


def decode_access_token(token: str) -> dict | None:
    payload = _jwt_decode(token, settings.SECRET_KEY)
    if payload is None or payload.get("type") != "access":
        return None
    return payload


def decode_refresh_token(token: str) -> dict | None:
    payload = _jwt_decode(token, settings.SECRET_KEY)
    if payload is None or payload.get("type") != "refresh":
        return None
    return payload


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


REFRESH_COOKIE_NAME = "refresh_token"


def set_refresh_cookie(response: Response, token: str):
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        path="/api/auth",
        secure=settings.COOKIE_SECURE,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
    )


def clear_refresh_cookie(response: Response):
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path="/api/auth",
        httponly=True,
        samesite="lax",
        secure=settings.COOKIE_SECURE,
    )


async def issue_tokens(user, db: AsyncSession, response: Response):
    """Issue a fresh access+refresh token pair for `user` and set the refresh cookie.

    Shared by every login path (password, PIN, kiosk, register) so token
    issuance stays consistent regardless of which router triggers it.
    """
    from backend.models import RefreshToken
    from backend.schemas import AuthResponse, UserResponse

    access_token = create_access_token(user.id, user.role.value)
    raw_refresh, expires_at = create_refresh_token(user.id)

    stored = RefreshToken(
        user_id=user.id,
        token_hash=hash_token(raw_refresh),
        expires_at=expires_at,
    )
    db.add(stored)
    await db.commit()

    set_refresh_cookie(response, raw_refresh)

    return AuthResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user),
    )
