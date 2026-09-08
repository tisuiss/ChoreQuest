import secrets

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.database import get_db
from backend.auth import decode_access_token
from backend.models import User, UserRole, AppSetting


async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth_header.split(" ", 1)[1]
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user_id = int(payload["sub"])
    result = await db.execute(select(User).where(User.id == user_id, User.is_active == True))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


async def require_parent(user: User = Depends(get_current_user)) -> User:
    if user.role not in (UserRole.parent, UserRole.admin):
        raise HTTPException(status_code=403, detail="Parent or admin role required")
    return user


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin role required")
    return user


async def require_kid(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.kid:
        raise HTTPException(status_code=403, detail="Kid role required")
    return user


async def _check_device_token(request: Request, db: AsyncSession) -> bool:
    """Compare the X-Device-Token header against the paired kiosk device's
    token (a single active AppSetting value, regenerated to revoke)."""
    token = request.headers.get("X-Device-Token")
    if not token:
        return False
    result = await db.execute(select(AppSetting).where(AppSetting.key == "kiosk_device_token"))
    setting = result.scalar_one_or_none()
    return bool(setting and setting.value and secrets.compare_digest(token, setting.value))


async def require_device_token(request: Request, db: AsyncSession = Depends(get_db)) -> None:
    """Device token ONLY — no fallback to a logged-in user's Bearer token.

    Used for endpoints that grant access to someone else's account with no
    other secret (kiosk login-direct, PIN-less kid login) — a Bearer token
    belonging to a different, already-authenticated user must never be able
    to substitute for physical possession of the paired kiosk device.
    """
    if not await _check_device_token(request, db):
        raise HTTPException(status_code=401, detail="Device token required")


async def require_family_access(request: Request, db: AsyncSession = Depends(get_db)) -> User | None:
    """Paired kiosk device OR a logged-in user.

    Gates endpoints that used to be fully public under the "physically
    secured device" trust model — now only the one paired device keeps that
    trust; every other caller must authenticate normally. Returns the User
    when authenticated via Bearer, or None when authenticated via device
    token (no specific user in that case).
    """
    if await _check_device_token(request, db):
        return None
    return await get_current_user(request, db)
