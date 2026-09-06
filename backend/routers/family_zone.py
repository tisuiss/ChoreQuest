import os
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models import User, UserRole, FamilyEvent, WeeklyMenuEntry, FamilyPhoto
from backend.schemas import (
    FamilyEventCreate,
    FamilyEventResponse,
    WeeklyMenuUpsert,
    WeeklyMenuResponse,
    FamilyStarsResponse,
    FamilyPhotoCreate,
    FamilyPhotoResponse,
)
from backend.rate_limit import rate_limiter
from backend.dependencies import require_parent
from backend.routers.uploads import UPLOAD_DIR

router = APIRouter(prefix="/api/family-zone", tags=["family-zone"])


# ---------- GET /events ----------
@router.get("/events", response_model=list[FamilyEventResponse])
async def list_family_events(
    start: date = Query(...),
    end: date = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Public roster of family events in [start, end], for the Family Zone
    calendar screen -- no auth required, same trust model as /api/kiosk.
    """
    if end < start:
        raise HTTPException(status_code=400, detail="end must be on or after start")
    if (end - start).days > 62:
        raise HTTPException(status_code=400, detail="Date range too large")

    result = await db.execute(
        select(FamilyEvent)
        .where(FamilyEvent.date >= start, FamilyEvent.date <= end)
        .order_by(FamilyEvent.date, FamilyEvent.time)
    )
    return result.scalars().all()


# ---------- POST /events ----------
@router.post("/events", response_model=FamilyEventResponse, status_code=201)
async def create_family_event(
    body: FamilyEventCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Public: add an event from the Family Zone screen.

    No login required, on purpose -- this mirrors the kiosk's trust model
    (a device already physically secured in the home), so any family member
    standing at the screen can jot down an appointment or outing.
    """
    client_ip = request.client.host if request.client else "unknown"
    rate_limiter.check(f"family-zone-events:{client_ip}", 30, 900)

    if body.member_id is not None:
        member_result = await db.execute(
            select(User).where(User.id == body.member_id, User.is_active == True)
        )
        if member_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Member not found")

    event = FamilyEvent(
        title=body.title,
        date=body.date,
        time=body.time,
        member_id=body.member_id,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event


# ---------- GET /menu ----------
@router.get("/menu", response_model=list[WeeklyMenuResponse])
async def get_weekly_menu(
    week_start: date = Query(..., description="ISO date for the Monday of the desired week"),
    db: AsyncSession = Depends(get_db),
):
    """Public: the planned dinners for the 7 days starting at week_start."""
    if week_start.weekday() != 0:
        raise HTTPException(status_code=400, detail="week_start must be a Monday")

    week_end = week_start + timedelta(days=6)
    result = await db.execute(
        select(WeeklyMenuEntry).where(
            WeeklyMenuEntry.date >= week_start,
            WeeklyMenuEntry.date <= week_end,
        )
    )
    return result.scalars().all()


# ---------- PUT /menu ----------
@router.put("/menu", response_model=WeeklyMenuResponse)
async def upsert_weekly_menu_entry(
    body: WeeklyMenuUpsert,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Public: set (or clear, with an empty dish) one day's planned dinner."""
    client_ip = request.client.host if request.client else "unknown"
    rate_limiter.check(f"family-zone-menu:{client_ip}", 30, 900)

    result = await db.execute(
        select(WeeklyMenuEntry).where(WeeklyMenuEntry.date == body.date)
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        entry = WeeklyMenuEntry(date=body.date, dish=body.dish)
        db.add(entry)
    else:
        entry.dish = body.dish
    await db.commit()
    await db.refresh(entry)
    return entry


# ---------- GET /stars ----------
@router.get("/stars", response_model=list[FamilyStarsResponse])
async def get_family_stars(db: AsyncSession = Depends(get_db)):
    """Public: kids ranked by current star balance, for the Family Zone."""
    result = await db.execute(
        select(User)
        .where(User.role == UserRole.kid, User.is_active == True)
        .order_by(User.points_balance.desc())
    )
    return result.scalars().all()


# ---------------------------------------------------------------------------
# Photo frame
# ---------------------------------------------------------------------------
# The Family Zone screen can switch into a fullscreen photo-frame slideshow
# (e.g. when guests are over, instead of showing everyone's chores/stars).
# Photos are uploaded via the existing /api/uploads endpoint and merely
# registered here; GET is public like the rest of the Family Zone screen,
# while adding/removing photos is parent-only and done from Settings.

# ---------- GET /photos ----------
@router.get("/photos", response_model=list[FamilyPhotoResponse])
async def list_family_photos(db: AsyncSession = Depends(get_db)):
    """Public: photos available for the Family Zone photo-frame slideshow."""
    result = await db.execute(select(FamilyPhoto).order_by(FamilyPhoto.created_at.desc()))
    return result.scalars().all()


# ---------- POST /photos ----------
@router.post("/photos", response_model=FamilyPhotoResponse, status_code=201)
async def add_family_photo(
    body: FamilyPhotoCreate,
    parent: User = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
):
    """Parent-only: register an already-uploaded image (via /api/uploads) as
    a photo-frame slideshow source."""
    photo = FamilyPhoto(url=body.url, uploaded_by=parent.id)
    db.add(photo)
    await db.commit()
    await db.refresh(photo)
    return photo


# ---------- DELETE /photos/{id} ----------
@router.delete("/photos/{photo_id}", status_code=204)
async def remove_family_photo(
    photo_id: int,
    parent: User = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
):
    """Parent-only: remove a photo from the slideshow source and delete its file."""
    result = await db.execute(select(FamilyPhoto).where(FamilyPhoto.id == photo_id))
    photo = result.scalar_one_or_none()
    if photo is None:
        raise HTTPException(status_code=404, detail="Photo not found")

    filename = os.path.basename(photo.url)
    filepath = os.path.join(UPLOAD_DIR, filename)
    if os.path.isfile(filepath):
        try:
            os.remove(filepath)
        except OSError:
            pass

    await db.delete(photo)
    await db.commit()
    return None
