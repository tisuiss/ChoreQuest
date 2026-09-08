import os
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models import User, UserRole, FamilyEvent, WeeklyMenuEntry, FamilyPhoto, FamilyTodo, FamilyBirthday
from backend.schemas import (
    FamilyEventCreate,
    FamilyEventResponse,
    WeeklyMenuUpsert,
    WeeklyMenuResponse,
    FamilyStarsResponse,
    FamilyPhotoCreate,
    FamilyPhotoResponse,
    FamilyMemberResponse,
    FamilyBirthdayCreate,
    FamilyBirthdayResponse,
    FamilyTodoCreate,
    FamilyTodoUpdate,
    FamilyTodoResponse,
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

    # An all-day event has no meaningful start time/duration -- normalize
    # server-side regardless of what the client happened to send.
    event = FamilyEvent(
        title=body.title,
        date=body.date,
        time=None if body.all_day else body.time,
        duration_minutes=None if body.all_day else body.duration_minutes,
        all_day=body.all_day,
        member_id=body.member_id,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event


# ---------- GET /members ----------
@router.get("/members", response_model=list[FamilyMemberResponse])
async def list_family_members(db: AsyncSession = Depends(get_db)):
    """Public: every active family member (kid, parent, admin) -- just id,
    display name and role -- so the Family Zone calendar can assign an
    event to a parent as well as a kid."""
    result = await db.execute(
        select(User).where(User.is_active == True).order_by(User.display_name)
    )
    return result.scalars().all()


# ---------------------------------------------------------------------------
# Birthdays
# ---------------------------------------------------------------------------
# A free-form birthday book on the Family Zone screen -- any loved one, not
# just people with a ChoreQuest account (grandparents, friends, etc.). Public
# read/write, same trust model as the rest of the screen. Sorting by next
# occurrence (rather than the raw stored date) is done client-side.

# ---------- GET /birthdays ----------
@router.get("/birthdays", response_model=list[FamilyBirthdayResponse])
async def list_birthdays(db: AsyncSession = Depends(get_db)):
    """Public: every tracked birthday."""
    result = await db.execute(select(FamilyBirthday).order_by(FamilyBirthday.name))
    return result.scalars().all()


# ---------- POST /birthdays ----------
@router.post("/birthdays", response_model=FamilyBirthdayResponse, status_code=201)
async def create_birthday(
    body: FamilyBirthdayCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Public: add a birthday to track."""
    client_ip = request.client.host if request.client else "unknown"
    rate_limiter.check(f"family-zone-birthdays:{client_ip}", 30, 900)

    birthday = FamilyBirthday(name=body.name, date=body.date)
    db.add(birthday)
    await db.commit()
    await db.refresh(birthday)
    return birthday


# ---------- DELETE /birthdays/{id} ----------
@router.delete("/birthdays/{birthday_id}", status_code=204)
async def delete_birthday(
    birthday_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Public: remove a tracked birthday."""
    result = await db.execute(select(FamilyBirthday).where(FamilyBirthday.id == birthday_id))
    birthday = result.scalar_one_or_none()
    if birthday is None:
        raise HTTPException(status_code=404, detail="Birthday not found")
    await db.delete(birthday)
    await db.commit()
    return None


# ---------- GET /menu ----------
@router.get("/menu", response_model=list[WeeklyMenuResponse])
async def get_weekly_menu(
    week_start: date | None = Query(None, description="ISO date for the Monday of the desired week -- fetches that 7-day week"),
    start: date | None = Query(None, description="Range start, used together with `end` instead of `week_start` (e.g. for a month-view calendar)"),
    end: date | None = Query(None, description="Range end (inclusive), used together with `start`"),
    db: AsyncSession = Depends(get_db),
):
    """Public: planned dinners, either for one Monday-start week (`week_start`)
    or an arbitrary range (`start`/`end`) -- the latter powers the Family Zone
    calendar's month/week view, which can span more than a single week.
    """
    if week_start is not None:
        if week_start.weekday() != 0:
            raise HTTPException(status_code=400, detail="week_start must be a Monday")
        range_start = week_start
        range_end = week_start + timedelta(days=6)
    elif start is not None and end is not None:
        if end < start:
            raise HTTPException(status_code=400, detail="end must be on or after start")
        if (end - start).days > 62:
            raise HTTPException(status_code=400, detail="Date range too large")
        range_start, range_end = start, end
    else:
        raise HTTPException(status_code=400, detail="Provide week_start, or both start and end")

    result = await db.execute(
        select(WeeklyMenuEntry).where(
            WeeklyMenuEntry.date >= range_start,
            WeeklyMenuEntry.date <= range_end,
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
# To-do list
# ---------------------------------------------------------------------------
# A shared, generic to-do list on the Family Zone screen -- unrelated to
# chores/points (shopping list, reminders, etc.). Public read/write, same
# trust model as the rest of the Family Zone screen.

# ---------- GET /todos ----------
@router.get("/todos", response_model=list[FamilyTodoResponse])
async def list_family_todos(db: AsyncSession = Depends(get_db)):
    """Public: the shared to-do list, pending items first."""
    result = await db.execute(
        select(FamilyTodo).order_by(FamilyTodo.is_done, FamilyTodo.created_at)
    )
    return result.scalars().all()


# ---------- POST /todos ----------
@router.post("/todos", response_model=FamilyTodoResponse, status_code=201)
async def create_family_todo(
    body: FamilyTodoCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Public: add an item to the shared to-do list, optionally assigned to
    a family member."""
    client_ip = request.client.host if request.client else "unknown"
    rate_limiter.check(f"family-zone-todos:{client_ip}", 40, 900)

    if body.assignee_id is not None:
        member_result = await db.execute(
            select(User).where(User.id == body.assignee_id, User.is_active == True)
        )
        if member_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Assignee not found")

    todo = FamilyTodo(text=body.text, assignee_id=body.assignee_id)
    db.add(todo)
    await db.commit()
    await db.refresh(todo)
    return todo


# ---------- PUT /todos/{id} ----------
@router.put("/todos/{todo_id}", response_model=FamilyTodoResponse)
async def update_family_todo(
    todo_id: int,
    body: FamilyTodoUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Public: mark a to-do item done or not done."""
    result = await db.execute(select(FamilyTodo).where(FamilyTodo.id == todo_id))
    todo = result.scalar_one_or_none()
    if todo is None:
        raise HTTPException(status_code=404, detail="To-do item not found")
    todo.is_done = body.is_done
    await db.commit()
    await db.refresh(todo)
    return todo


# ---------- DELETE /todos/{id} ----------
@router.delete("/todos/{todo_id}", status_code=204)
async def delete_family_todo(
    todo_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Public: remove a to-do item."""
    result = await db.execute(select(FamilyTodo).where(FamilyTodo.id == todo_id))
    todo = result.scalar_one_or_none()
    if todo is None:
        raise HTTPException(status_code=404, detail="To-do item not found")
    await db.delete(todo)
    await db.commit()
    return None


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
