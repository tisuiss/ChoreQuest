from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models import (
    User,
    UserRole,
    VacationPeriod,
    ChoreVacationPeriod,
    KidVacationPeriod,
)
from backend.schemas import (
    VacationCreate,
    VacationResponse,
    KidVacationCreate,
    KidVacationResponse,
)
from backend.dependencies import require_parent

router = APIRouter(prefix="/api/vacation", tags=["vacation"])


@router.get("", response_model=list[VacationResponse])
async def list_vacations(
    parent: User = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
):
    """List all vacation periods."""
    result = await db.execute(
        select(VacationPeriod)
        .where(VacationPeriod.is_active == True)
        .order_by(VacationPeriod.start_date.desc())
    )
    return result.scalars().all()


@router.post("", response_model=VacationResponse, status_code=201)
async def create_vacation(
    body: VacationCreate,
    parent: User = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
):
    """Create a vacation/blackout period. Parent+ only."""
    if body.end_date < body.start_date:
        raise HTTPException(status_code=400, detail="End date must be after start date")
    if body.end_date < date.today():
        raise HTTPException(status_code=400, detail="Cannot create vacation in the past")

    vacation = VacationPeriod(
        start_date=body.start_date,
        end_date=body.end_date,
        created_by=parent.id,
    )
    db.add(vacation)
    await db.commit()
    await db.refresh(vacation)
    return vacation


@router.delete("/{vacation_id}", status_code=204)
async def cancel_vacation(
    vacation_id: int,
    parent: User = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
):
    """Cancel a vacation period."""
    result = await db.execute(
        select(VacationPeriod).where(VacationPeriod.id == vacation_id)
    )
    vacation = result.scalar_one_or_none()
    if not vacation:
        raise HTTPException(status_code=404, detail="Vacation not found")

    vacation.is_active = False
    await db.commit()


# ---------------------------------------------------------------------------
# Per-child vacation periods
# ---------------------------------------------------------------------------


@router.get("/kids", response_model=list[KidVacationResponse])
async def list_kid_vacations(
    parent: User = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
):
    """List every active per-child vacation period."""
    result = await db.execute(
        select(KidVacationPeriod, User.display_name)
        .join(User, KidVacationPeriod.user_id == User.id)
        .where(KidVacationPeriod.is_active == True)
        .order_by(KidVacationPeriod.start_date.desc())
    )
    return [
        KidVacationResponse(
            id=v.id,
            user_id=v.user_id,
            user_display_name=name,
            start_date=v.start_date,
            end_date=v.end_date,
            created_by=v.created_by,
            is_active=v.is_active,
            created_at=v.created_at,
        )
        for v, name in result.all()
    ]


@router.post("/kids", response_model=KidVacationResponse, status_code=201)
async def create_kid_vacation(
    body: KidVacationCreate,
    parent: User = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
):
    """Schedule a vacation period for a single child. Parent+ only.

    While the child is away, chores that rotate between kids skip them
    (handing the turn to the next available sibling) and chores assigned
    only to that child are paused.
    """
    if body.end_date < body.start_date:
        raise HTTPException(status_code=400, detail="End date must be after start date")
    if body.end_date < date.today():
        raise HTTPException(status_code=400, detail="Cannot create vacation in the past")

    kid = (
        await db.execute(
            select(User).where(
                User.id == body.user_id,
                User.role == UserRole.kid,
                User.is_active == True,
            )
        )
    ).scalar_one_or_none()
    if kid is None:
        raise HTTPException(status_code=404, detail="Child not found")

    vacation = KidVacationPeriod(
        user_id=body.user_id,
        start_date=body.start_date,
        end_date=body.end_date,
        created_by=parent.id,
    )
    db.add(vacation)
    await db.commit()
    await db.refresh(vacation)
    return KidVacationResponse(
        id=vacation.id,
        user_id=vacation.user_id,
        user_display_name=kid.display_name,
        start_date=vacation.start_date,
        end_date=vacation.end_date,
        created_by=vacation.created_by,
        is_active=vacation.is_active,
        created_at=vacation.created_at,
    )


@router.delete("/kids/{vacation_id}", status_code=204)
async def cancel_kid_vacation(
    vacation_id: int,
    parent: User = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
):
    """Cancel a per-child vacation period."""
    vacation = (
        await db.execute(
            select(KidVacationPeriod).where(KidVacationPeriod.id == vacation_id)
        )
    ).scalar_one_or_none()
    if not vacation:
        raise HTTPException(status_code=404, detail="Vacation not found")

    vacation.is_active = False
    await db.commit()


async def is_vacation_day(db: AsyncSession, check_date: date) -> bool:
    """Check if a given date falls within any active vacation period."""
    result = await db.execute(
        select(VacationPeriod).where(
            VacationPeriod.is_active == True,
            VacationPeriod.start_date <= check_date,
            VacationPeriod.end_date >= check_date,
        )
    )
    return result.scalar_one_or_none() is not None


async def load_chore_vacation_dates(
    db: AsyncSession, chore_id: int, start: date, end: date
) -> set[date]:
    """Expand a chore's own blackout periods (on top of any family-wide
    vacation) into the set of individual dates they cover within [start, end]."""
    result = await db.execute(
        select(ChoreVacationPeriod).where(
            ChoreVacationPeriod.chore_id == chore_id,
            ChoreVacationPeriod.is_active == True,
            ChoreVacationPeriod.start_date <= end,
            ChoreVacationPeriod.end_date >= start,
        )
    )
    dates: set[date] = set()
    for period in result.scalars().all():
        d = max(period.start_date, start)
        period_end = min(period.end_date, end)
        while d <= period_end:
            dates.add(d)
            d += timedelta(days=1)
    return dates


async def is_chore_vacation_day(db: AsyncSession, chore_id: int, day: date) -> bool:
    """Check if a given date falls within this chore's own blackout period."""
    result = await db.execute(
        select(ChoreVacationPeriod).where(
            ChoreVacationPeriod.chore_id == chore_id,
            ChoreVacationPeriod.is_active == True,
            ChoreVacationPeriod.start_date <= day,
            ChoreVacationPeriod.end_date >= day,
        )
    )
    return result.scalar_one_or_none() is not None


async def load_kid_vacation_map(
    db: AsyncSession, start: date, end: date
) -> dict[int, set[date]]:
    """Map every child to the set of their vacation dates within [start, end]."""
    result = await db.execute(
        select(KidVacationPeriod).where(
            KidVacationPeriod.is_active == True,
            KidVacationPeriod.start_date <= end,
            KidVacationPeriod.end_date >= start,
        )
    )
    out: dict[int, set[date]] = {}
    for period in result.scalars().all():
        d = max(period.start_date, start)
        period_end = min(period.end_date, end)
        while d <= period_end:
            out.setdefault(period.user_id, set()).add(d)
            d += timedelta(days=1)
    return out


async def is_kid_on_vacation(db: AsyncSession, user_id: int, day: date) -> bool:
    """Check whether a given child is on vacation on ``day``."""
    result = await db.execute(
        select(KidVacationPeriod).where(
            KidVacationPeriod.user_id == user_id,
            KidVacationPeriod.is_active == True,
            KidVacationPeriod.start_date <= day,
            KidVacationPeriod.end_date >= day,
        )
    )
    return result.scalar_one_or_none() is not None
