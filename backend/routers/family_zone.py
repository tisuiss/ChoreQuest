import calendar as calendar_module
import os
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models import User, UserRole, FamilyEvent, WeeklyMenuEntry, FamilyPhoto, FamilyTodo, FamilyBirthday
from backend.schemas import (
    FamilyEventCreate,
    FamilyEventUpdate,
    FamilyEventResponse,
    WeeklyMenuUpsert,
    WeeklyMenuResponse,
    FamilyStarsResponse,
    FamilyPhotoCreate,
    FamilyPhotoResponse,
    FamilyMemberResponse,
    FamilyBirthdayCreate,
    FamilyBirthdayUpdate,
    FamilyBirthdayResponse,
    FamilyTodoCreate,
    FamilyTodoUpdate,
    FamilyTodoResponse,
)
from backend.rate_limit import rate_limiter
from backend.dependencies import require_parent, require_family_access
from backend.routers.uploads import UPLOAD_DIR

router = APIRouter(prefix="/api/family-zone", tags=["family-zone"])

REPEAT_FREQUENCIES = ("daily", "weekly", "monthly", "yearly")
REPEAT_MAX_OCCURRENCES = 104  # ~2 years of weekly, safety cap either way


def _add_interval(d: date, frequency: str) -> date:
    if frequency == "daily":
        return d + timedelta(days=1)
    if frequency == "weekly":
        return d + timedelta(days=7)
    if frequency == "monthly":
        month = d.month + 1
        year = d.year + (month - 1) // 12
        month = ((month - 1) % 12) + 1
        day = min(d.day, calendar_module.monthrange(year, month)[1])
        return date(year, month, day)
    # yearly -- Feb 29 on a non-leap target year falls back to Feb 28
    try:
        return d.replace(year=d.year + 1)
    except ValueError:
        return d.replace(year=d.year + 1, day=28)


def _repeat_occurrence_dates(start: date, frequency: str, until: date) -> list[date]:
    """Every additional occurrence date after `start`, stepping by
    `frequency`, up to and including `until` -- capped so a mistyped "until"
    (e.g. decades out) can't generate an unbounded number of rows."""
    dates = []
    current = start
    while len(dates) < REPEAT_MAX_OCCURRENCES:
        current = _add_interval(current, frequency)
        if current > until:
            break
        dates.append(current)
    return dates


def _validate_birthday_day(month: int, day: int) -> None:
    """Reject an impossible day/month combo (e.g. Feb 30) -- 2000 is a leap
    year so Feb 29 is accepted for a birthday with no year on file."""
    try:
        date(2000, month, day)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid day for that month")


# ---------- GET /events ----------
@router.get("/events", response_model=list[FamilyEventResponse])
async def list_family_events(
    start: date = Query(...),
    end: date = Query(...),
    db: AsyncSession = Depends(get_db),
    _access: User | None = Depends(require_family_access),
):
    """Roster of family events in [start, end], for the Family Zone
    calendar screen -- paired kiosk device or logged-in user.
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


async def _resolve_event_target(db: AsyncSession, body) -> int | None:
    """Validate target_group/member_id and return the effective member_id.

    A generic group target (parents/kids) and a specific member are
    mutually exclusive -- the group wins if both were somehow sent.
    """
    if body.target_group is not None and body.target_group not in ("parents", "kids"):
        raise HTTPException(status_code=400, detail="target_group must be 'parents' or 'kids'")

    member_id = None if body.target_group else body.member_id
    if member_id is not None:
        member_result = await db.execute(
            select(User).where(User.id == member_id, User.is_active == True)
        )
        if member_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Member not found")
    return member_id


async def _create_repeat_occurrences(db: AsyncSession, base: FamilyEvent, repeat) -> None:
    """Add one FamilyEvent row per additional occurrence of `repeat`, each a
    copy of `base` on a later date. `base` itself is left untouched -- it's
    already the first occurrence."""
    if repeat is None:
        return
    if repeat.frequency not in REPEAT_FREQUENCIES:
        raise HTTPException(status_code=400, detail="Invalid repeat frequency")

    for occ_date in _repeat_occurrence_dates(base.date, repeat.frequency, repeat.until):
        db.add(FamilyEvent(
            title=base.title,
            date=occ_date,
            time=base.time,
            duration_minutes=base.duration_minutes,
            all_day=base.all_day,
            member_id=base.member_id,
            target_group=base.target_group,
        ))


# ---------- POST /events ----------
@router.post("/events", response_model=FamilyEventResponse, status_code=201)
async def create_family_event(
    body: FamilyEventCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _access: User | None = Depends(require_family_access),
):
    """Add an event from the Family Zone screen -- optionally repeated, in
    which case one row per occurrence is created.

    Paired kiosk device or logged-in user -- the paired screen keeps the old
    frictionless "physically secured device" trust model; anyone else must
    log in first.
    """
    client_ip = request.client.host if request.client else "unknown"
    rate_limiter.check(f"family-zone-events:{client_ip}", 30, 900)

    member_id = await _resolve_event_target(db, body)

    # An all-day event has no meaningful start time/duration -- normalize
    # server-side regardless of what the client happened to send.
    event = FamilyEvent(
        title=body.title,
        date=body.date,
        time=None if body.all_day else body.time,
        duration_minutes=None if body.all_day else body.duration_minutes,
        all_day=body.all_day,
        member_id=member_id,
        target_group=body.target_group,
    )
    db.add(event)
    await _create_repeat_occurrences(db, event, body.repeat)
    await db.commit()
    await db.refresh(event)
    return event


# ---------- PUT /events/{id} ----------
@router.put("/events/{event_id}", response_model=FamilyEventResponse)
async def update_family_event(
    event_id: int,
    body: FamilyEventUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _access: User | None = Depends(require_family_access),
):
    """Edit an event -- same trust model as creating one. A repeat option
    here only adds new future occurrences; it never touches other rows from
    a previous repeat batch."""
    client_ip = request.client.host if request.client else "unknown"
    rate_limiter.check(f"family-zone-events:{client_ip}", 30, 900)

    result = await db.execute(select(FamilyEvent).where(FamilyEvent.id == event_id))
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")

    member_id = await _resolve_event_target(db, body)

    event.title = body.title
    event.date = body.date
    event.time = None if body.all_day else body.time
    event.duration_minutes = None if body.all_day else body.duration_minutes
    event.all_day = body.all_day
    event.member_id = member_id
    event.target_group = body.target_group

    await _create_repeat_occurrences(db, event, body.repeat)
    await db.commit()
    await db.refresh(event)
    return event


# ---------- DELETE /events/{id} ----------
@router.delete("/events/{event_id}", status_code=204)
async def delete_family_event(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    _access: User | None = Depends(require_family_access),
):
    """Remove a single event occurrence."""
    result = await db.execute(select(FamilyEvent).where(FamilyEvent.id == event_id))
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    await db.delete(event)
    await db.commit()
    return None


# ---------- GET /members ----------
@router.get("/members", response_model=list[FamilyMemberResponse])
async def list_family_members(
    db: AsyncSession = Depends(get_db),
    _access: User | None = Depends(require_family_access),
):
    """Every active family member (kid, parent, admin) -- just id, display
    name and role -- so the Family Zone calendar can assign an event to a
    parent as well as a kid."""
    result = await db.execute(
        select(User).where(User.is_active == True).order_by(User.display_name)
    )
    return result.scalars().all()


# ---------------------------------------------------------------------------
# Birthdays
# ---------------------------------------------------------------------------
# A free-form birthday book on the Family Zone screen -- any loved one, not
# just people with a KidTasks account (grandparents, friends, etc.). Same
# trust model as the rest of the screen (paired device or logged-in user).
# Sorting by next occurrence (rather than the raw stored date) is done
# client-side.

# ---------- GET /birthdays ----------
@router.get("/birthdays", response_model=list[FamilyBirthdayResponse])
async def list_birthdays(
    db: AsyncSession = Depends(get_db),
    _access: User | None = Depends(require_family_access),
):
    """Every tracked birthday."""
    result = await db.execute(select(FamilyBirthday).order_by(FamilyBirthday.name))
    return result.scalars().all()


# ---------- POST /birthdays ----------
@router.post("/birthdays", response_model=FamilyBirthdayResponse, status_code=201)
async def create_birthday(
    body: FamilyBirthdayCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _access: User | None = Depends(require_family_access),
):
    """Add a birthday to track."""
    client_ip = request.client.host if request.client else "unknown"
    rate_limiter.check(f"family-zone-birthdays:{client_ip}", 30, 900)

    _validate_birthday_day(body.month, body.day)

    birthday = FamilyBirthday(name=body.name, month=body.month, day=body.day, year=body.year)
    db.add(birthday)
    await db.commit()
    await db.refresh(birthday)
    return birthday


# ---------- PUT /birthdays/{id} ----------
@router.put("/birthdays/{birthday_id}", response_model=FamilyBirthdayResponse)
async def update_birthday(
    birthday_id: int,
    body: FamilyBirthdayUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _access: User | None = Depends(require_family_access),
):
    """Edit a tracked birthday. Does not touch any calendar events created
    from it before the edit -- use "Add to calendar" again to (re)generate
    occurrences from the updated date."""
    client_ip = request.client.host if request.client else "unknown"
    rate_limiter.check(f"family-zone-birthdays:{client_ip}", 30, 900)

    result = await db.execute(select(FamilyBirthday).where(FamilyBirthday.id == birthday_id))
    birthday = result.scalar_one_or_none()
    if birthday is None:
        raise HTTPException(status_code=404, detail="Birthday not found")

    _validate_birthday_day(body.month, body.day)

    birthday.name = body.name
    birthday.month = body.month
    birthday.day = body.day
    birthday.year = body.year
    await db.commit()
    await db.refresh(birthday)
    return birthday


# ---------- DELETE /birthdays/{id} ----------
@router.delete("/birthdays/{birthday_id}", status_code=204)
async def delete_birthday(
    birthday_id: int,
    db: AsyncSession = Depends(get_db),
    _access: User | None = Depends(require_family_access),
):
    """Remove a tracked birthday."""
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
    _access: User | None = Depends(require_family_access),
):
    """Planned dinners, either for one Monday-start week (`week_start`) or an
    arbitrary range (`start`/`end`) -- the latter powers the Family Zone
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
    _access: User | None = Depends(require_family_access),
):
    """Set (or clear, with an empty dish) one day's planned dinner."""
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
async def get_family_stars(
    db: AsyncSession = Depends(get_db),
    _access: User | None = Depends(require_family_access),
):
    """Kids ranked by current star balance, for the Family Zone."""
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
# chores/points (shopping list, reminders, etc.). Same trust model as the
# rest of the Family Zone screen (paired device or logged-in user).

# ---------- GET /todos ----------
@router.get("/todos", response_model=list[FamilyTodoResponse])
async def list_family_todos(
    db: AsyncSession = Depends(get_db),
    _access: User | None = Depends(require_family_access),
):
    """The shared to-do list, pending items first."""
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
    _access: User | None = Depends(require_family_access),
):
    """Add an item to the shared to-do list, optionally assigned to a family
    member."""
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
    _access: User | None = Depends(require_family_access),
):
    """Mark a to-do item done or not done."""
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
    _access: User | None = Depends(require_family_access),
):
    """Remove a to-do item."""
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
# registered here; GET follows the same trust model as the rest of the
# Family Zone screen (paired device or logged-in user), while adding/
# removing photos is parent-only and done from Settings.

# ---------- GET /photos ----------
@router.get("/photos", response_model=list[FamilyPhotoResponse])
async def list_family_photos(
    db: AsyncSession = Depends(get_db),
    _access: User | None = Depends(require_family_access),
):
    """Photos available for the Family Zone photo-frame slideshow."""
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
