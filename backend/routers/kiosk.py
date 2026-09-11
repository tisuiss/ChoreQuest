from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.database import get_db
from backend.models import User, UserRole, AuditLog, AppSetting, TrustedDevice, Chore, ChoreAssignment, AssignmentStatus
from backend.schemas import KioskKidResponse, KioskLoginRequest, AuthResponse
from backend.auth import verify_pin, issue_tokens
from backend.rate_limit import rate_limiter
from backend.dependencies import require_family_access, require_device_token
from backend.routers.vacation import is_vacation_day, load_chore_vacation_dates, load_kid_vacation_map

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
    avatar, whether a PIN gate is needed, and today's active chore count.
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
        # Matches exactly what the kid's own dashboard shows as "today's
        # tasks" (KidDashboard.jsx reads GET /api/calendar's days[today],
        # then filters by isWithinCategoryWindow) -- both the same vacation
        # exclusions that view applies, AND the category display window: a
        # row can still be `pending` in the DB (left alone so history stays
        # intact) while being hidden from the kid because they/the chore are
        # on vacation, or because its category's time window (e.g. "Morning
        # routine") has already ended for today. Counting those here would
        # over-count vs. what's actually shown.
        now_time = datetime.now().time()
        result_assignments = await db.execute(
            select(ChoreAssignment)
            .join(Chore, ChoreAssignment.chore_id == Chore.id)
            .options(selectinload(ChoreAssignment.chore).selectinload(Chore.category))
            .where(
                ChoreAssignment.user_id.in_(kid_ids),
                ChoreAssignment.date == today,
                ChoreAssignment.status == AssignmentStatus.pending,
                Chore.is_active == True,
            )
        )
        todays_assignments = result_assignments.scalars().all()

        family_vacation_today = await is_vacation_day(db, today)
        kid_vacation_map = await load_kid_vacation_map(db, today, today)
        chore_vacation_cache: dict[int, set[date]] = {}

        for a in todays_assignments:
            category = a.chore.category if a.chore else None
            if today in kid_vacation_map.get(a.user_id, set()):
                continue
            if a.chore:
                if category and category.window_start and category.window_end:
                    if not (category.window_start <= now_time <= category.window_end):
                        continue

                if a.chore.id not in chore_vacation_cache:
                    chore_vacation_cache[a.chore.id] = await load_chore_vacation_dates(
                        db, a.chore.id, today, today
                    )
                chore_paused = (
                    (a.chore.pauses_during_vacation and family_vacation_today)
                    or today in chore_vacation_cache[a.chore.id]
                )
                if chore_paused:
                    continue
            pending_counts[a.user_id] = pending_counts.get(a.user_id, 0) + 1

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
        # require the paired kiosk device OR an already logged-in user (same
        # trust boundary as the rest of /kiosk and /family-zone). Deliberately
        # NOT device-token-only like login-direct: this is an explicit click
        # on a kid tile from a screen a family member is already looking at
        # (Kiosk or Family Zone), not a silent/bookmarkable bypass URL — a
        # logged-in parent picking a PIN-less kid from Family Zone must not
        # be blocked just because their own device was never paired.
        await require_family_access(request, db)

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

    result = await db.execute(select(TrustedDevice).where(TrustedDevice.token == token))
    valid = result.scalar_one_or_none() is not None
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
