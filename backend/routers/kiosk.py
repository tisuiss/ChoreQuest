from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models import User, UserRole, AuditLog, AppSetting
from backend.schemas import KioskKidResponse, KioskLoginRequest, AuthResponse
from backend.auth import verify_pin, issue_tokens
from backend.rate_limit import rate_limiter

router = APIRouter(prefix="/api/kiosk", tags=["kiosk"])


# ---------- GET /settings ----------
@router.get("/settings")
async def get_kiosk_settings(db: AsyncSession = Depends(get_db)):
    """Public, minimal settings needed before any kid is selected.

    Only ever exposes an allowlisted key — never the full AppSetting table.
    """
    result = await db.execute(
        select(AppSetting).where(AppSetting.key == "default_language")
    )
    setting = result.scalar_one_or_none()
    return {"default_language": setting.value if setting else "fr"}


# ---------- GET /kids ----------
@router.get("/kids", response_model=list[KioskKidResponse])
async def list_kiosk_kids(db: AsyncSession = Depends(get_db)):
    """Public roster for the kiosk kid-selection screen — no auth required.

    Only exposes what's needed to render tappable tiles: id, display name,
    avatar, and whether a PIN gate is needed. Never exposes the PIN hash.
    """
    result = await db.execute(
        select(User).where(User.role == UserRole.kid, User.is_active == True)
    )
    kids = result.scalars().all()
    return [
        KioskKidResponse(
            id=k.id,
            display_name=k.display_name or k.username,
            avatar_config=k.avatar_config,
            has_pin=k.pin_hash is not None,
        )
        for k in kids
    ]


# ---------- POST /login ----------
@router.post("/login", response_model=AuthResponse)
async def kiosk_login(
    body: KioskLoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Select a kid from the kiosk screen. PIN required only if the kid has one set."""
    client_ip = request.client.host if request.client else "unknown"
    rate_limiter.check(f"kiosk:{client_ip}", 20, 900)
    rate_limiter.check(f"kiosk:{client_ip}:{body.kid_id}", 5, 900)

    result = await db.execute(
        select(User).where(
            User.id == body.kid_id,
            User.role == UserRole.kid,
            User.is_active == True,
        )
    )
    kid = result.scalar_one_or_none()
    if kid is None:
        raise HTTPException(status_code=404, detail="Kid not found")

    if kid.pin_hash is not None:
        if not body.pin or not verify_pin(body.pin, kid.pin_hash):
            raise HTTPException(status_code=401, detail="Invalid PIN")

    audit = AuditLog(
        user_id=kid.id,
        action="login",
        details={"method": "kiosk"},
        ip_address=request.client.host if request.client else None,
    )
    db.add(audit)
    await db.commit()

    return await issue_tokens(kid, db, response)
