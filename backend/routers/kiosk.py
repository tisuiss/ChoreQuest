import secrets
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models import User, UserRole, AuditLog, AppSetting, Chore, ChoreAssignment, AssignmentStatus
from backend.schemas import KioskKidResponse, KioskLoginRequest, AuthResponse
from backend.auth import verify_pin, issue_tokens
from backend.rate_limit import rate_limiter
from backend.dependencies import require_family_access, require_device_token

router = APIRouter(prefix="/api/kiosk", tags=["kiosk"])


# ---------- GET /settings ----------
@router.get("/settings")
async def get_kiosk_settings(db: AsyncSession = Depends(get_db)):
    """Public, minimal settings needed before any kid is selected (or for
    the public Family Zone screen).

    Only ever exposes an allowlisted set of keys — never the full
    AppSetting table.
    """
    result = await db.execute(
        select(AppSetting).where(
            AppSetting.key.in_([
                "default_language",
                "family_zone_default_view",
                "family_zone_layout",
                "calendar_colors",
                "idle_kiosk_redirect",
                "idle_kiosk_timeout_minutes",
            ])
        )
    )
    settings_map = {s.key: s.value for s in result.scalars().all()}
    return {
        "default_language": settings_map.get("default_language", "fr"),
        "family_zone_default_view": settings_map.get("family_zone_default_view", "week"),
        "family_zone_layout": settings_map.get("family_zone_layout", "grid"),
        # A JSON-stringified {"family"|"parents"|"kids"|"<user id>": "<color name>"}
        # map, set from the family settings page. "{}" (no overrides) by default.
        "calendar_colors": settings_map.get("calendar_colors", "{}"),
        # Where an idle kiosk session (picked from /kiosk, or from a kid tile
        # on /familyzone) lands after the inactivity timeout: "kiosk" or
        # "familyzone". Read by useIdleKioskLogout on the frontend.
        "idle_kiosk_redirect": settings_map.get("idle_kiosk_redirect", "kiosk"),
        "idle_kiosk_timeout_minutes": settings_map.get("idle_kiosk_timeout_minutes", "3"),
    }


# ---------- GET /kids ----------
@router.get("/kids", response_model=list[KioskKidResponse])
async def list_kiosk_kids(
    db: AsyncSession = Depends(get_db),
    _access: User | None = Depends(require_family_access),
):
    """Roster for the kiosk kid-selection screen — paired device or logged-in
    user only (family names/avatars, not meant for random visitors).

    Only exposes what's needed to render tappable tiles: id, display name,
    avatar, whether a PIN gate is needed, and today's pending chore count.
    Never exposes the PIN hash.
    """
    result = await db.execute(
        select(User).where(User.role == UserRole.kid, User.is_active == True)
    )
    kids = result.scalars().all()
    kid_ids = [k.id for k in kids]

    pending_counts = {}
    if kid_ids:
        today = date.today()
        count_result = await db.execute(
            select(
                ChoreAssignment.user_id,
                func.count().label("cnt"),
            )
            .join(Chore, ChoreAssignment.chore_id == Chore.id)
            .where(
                ChoreAssignment.user_id.in_(kid_ids),
                ChoreAssignment.date == today,
                ChoreAssignment.status == AssignmentStatus.pending,
                Chore.is_active == True,
            )
            .group_by(ChoreAssignment.user_id)
        )
        pending_counts = {row.user_id: row.cnt for row in count_result.all()}

    return [
        KioskKidResponse(
            id=k.id,
            display_name=k.display_name or k.username,
            avatar_config=k.avatar_config,
            avatar_photo_url=k.avatar_photo_url,
            has_pin=k.pin_hash is not None,
            pending_chores=pending_counts.get(k.id, 0),
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
    else:
        # No PIN set on this kid — nothing else secret-checks this login, so
        # require the paired kiosk device (same trust boundary as login-direct)
        # instead of leaving it open to anyone who can guess/enumerate a kid_id.
        await require_device_token(request, db)

    audit = AuditLog(
        user_id=kid.id,
        action="login",
        details={"method": "kiosk"},
        ip_address=request.client.host if request.client else None,
    )
    db.add(audit)
    await db.commit()

    return await issue_tokens(kid, db, response)


# ---------- GET /pair-check ----------
@router.get("/pair-check")
async def check_pairing_token(token: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Public: lets the /pair page confirm a candidate device token before
    the frontend stores it in localStorage, instead of blindly trusting the
    URL. The token is high-entropy (32 random bytes via secrets.token_urlsafe)
    so brute force isn't the real risk — the rate limit here is defense in
    depth, same as every other public kiosk endpoint.
    """
    client_ip = request.client.host if request.client else "unknown"
    rate_limiter.check(f"pair-check:{client_ip}", 10, 900)

    result = await db.execute(select(AppSetting).where(AppSetting.key == "kiosk_device_token"))
    setting = result.scalar_one_or_none()
    valid = bool(setting and setting.value and secrets.compare_digest(token, setting.value))
    return {"valid": valid}


# ---------- POST /login-direct/{username} ----------
@router.post("/login-direct/{username}", response_model=AuthResponse)
async def kiosk_login_direct(
    username: str,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    _device: None = Depends(require_device_token),
):
    """Log straight into a kid's kiosk session by username, bypassing any PIN.

    Powers a bookmarkable /kiosk/<username> URL for a device dedicated to one
    kid (e.g. a tablet mounted in their room) — intentionally skips the PIN
    gate that /login normally enforces, since the whole point is frictionless
    access from a trusted, already-physically-secured device. Restricted to
    the paired kiosk device (require_device_token) — no fallback to a
    logged-in user's Bearer token, since that would let any authenticated
    family member bypass into a DIFFERENT kid's account with no secret.
    Still rate limited and audit-logged (with a distinct "kiosk-direct"
    method) so this bypass stays visible and abuse-resistant.
    """
    client_ip = request.client.host if request.client else "unknown"
    rate_limiter.check(f"kiosk-direct:{client_ip}", 20, 900)
    rate_limiter.check(f"kiosk-direct:{client_ip}:{username}", 10, 900)

    result = await db.execute(
        select(User).where(
            User.username == username,
            User.role == UserRole.kid,
            User.is_active == True,
        )
    )
    kid = result.scalar_one_or_none()
    if kid is None:
        raise HTTPException(status_code=404, detail="Kid not found")

    audit = AuditLog(
        user_id=kid.id,
        action="login",
        details={"method": "kiosk-direct"},
        ip_address=request.client.host if request.client else None,
    )
    db.add(audit)
    await db.commit()

    return await issue_tokens(kid, db, response)
