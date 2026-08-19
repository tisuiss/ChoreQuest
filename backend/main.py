import asyncio
import logging
logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s: %(message)s")
from contextlib import asynccontextmanager
from datetime import datetime, date, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import delete, select

from backend.config import settings
from backend.database import init_db, async_session
from backend.seed import seed_database
from backend.auth import decode_access_token
from backend.websocket_manager import ws_manager
from backend.models import (
    RefreshToken,
    User,
    UserRole,
    AppSetting,
    PointTransaction,
    PointType,
    ChoreAssignment,
    AssignmentStatus,
)
from sqlalchemy.orm import selectinload
from backend.services.assignment_generator import generate_daily_assignments
from backend.services.family_timezone import apply_family_timezone
from backend.services.push_hook import install_push_hooks
from backend.services.malus import should_apply_malus

logger = logging.getLogger(__name__)

STATIC_DIR = Path(__file__).parent.parent / "static"


async def reset_stale_streaks(db, today: date):
    """Reset streaks for kids who didn't complete any quest yesterday.

    Accounts for vacation days — if yesterday was a vacation day, the
    streak is preserved.  Streak freezes are NOT consumed here because
    they are consumed at completion-time (see chores.py verify logic).
    """
    from backend.routers.vacation import is_vacation_day

    yesterday = today - timedelta(days=1)
    result = await db.execute(
        select(User).where(
            User.role == UserRole.kid,
            User.is_active == True,
            User.current_streak > 0,
        )
    )
    kids = result.scalars().all()

    for kid in kids:
        if kid.last_streak_date is None:
            kid.current_streak = 0
            continue

        # If they already completed something today, skip
        if kid.last_streak_date >= today:
            continue

        # If last completion was yesterday, streak is still valid
        if kid.last_streak_date >= yesterday:
            continue

        # Gap is > 1 day. Check if all gap days were vacation days.
        gap = (today - kid.last_streak_date).days
        all_vacation = True
        for offset in range(1, gap):
            gap_day = kid.last_streak_date + timedelta(days=offset)
            if not await is_vacation_day(db, gap_day):
                all_vacation = False
                break

        if not all_vacation:
            logger.info(
                "Resetting streak for user %s (was %d, last_streak_date=%s)",
                kid.username, kid.current_streak, kid.last_streak_date,
            )
            kid.current_streak = 0


def _most_recent_points_reset_boundary(cadence: str, weekday: int, today: date) -> date:
    """Most recent calendar date (<= today) on which this cadence is due.

    weekly: the most recent occurrence of the chosen weekday (0=Mon..6=Sun).
    monthly: the 1st of the current month.
    quarterly: the 1st day of the current quarter (Jan/Apr/Jul/Oct 1st).
    """
    if cadence == "weekly":
        delta = (today.weekday() - weekday) % 7
        return today - timedelta(days=delta)
    if cadence == "quarterly":
        quarter_start_month = ((today.month - 1) // 3) * 3 + 1
        return date(today.year, quarter_start_month, 1)
    return date(today.year, today.month, 1)  # monthly


async def maybe_reset_points(db, today: date):
    """Periodically zero out kids' star balances if the family has enabled it.

    Lifetime `total_points_earned` is left untouched -- only the spendable
    `points_balance` resets, like a recurring allowance. Each reset is
    logged as a PointTransaction so it shows up in the points history.
    """
    result = await db.execute(
        select(AppSetting).where(
            AppSetting.key.in_([
                "points_reset_enabled",
                "points_reset_cadence",
                "points_reset_weekday",
                "points_reset_last_run",
            ])
        )
    )
    settings_map = {s.key: s for s in result.scalars().all()}

    enabled = settings_map.get("points_reset_enabled")
    if enabled is None or enabled.value != "true":
        return

    cadence_setting = settings_map.get("points_reset_cadence")
    cadence = cadence_setting.value if cadence_setting else "monthly"
    if cadence not in ("weekly", "monthly", "quarterly"):
        cadence = "monthly"

    try:
        weekday = int(settings_map["points_reset_weekday"].value)
    except (KeyError, ValueError):
        weekday = 0
    weekday = max(0, min(6, weekday))

    last_run_setting = settings_map.get("points_reset_last_run")
    if last_run_setting is None:
        # Feature just got turned on -- start counting from today instead
        # of resetting immediately, even if today is already past this
        # period's boundary.
        db.add(AppSetting(key="points_reset_last_run", value=today.isoformat()))
        return

    try:
        last_run = date.fromisoformat(last_run_setting.value)
    except ValueError:
        last_run = today

    boundary = _most_recent_points_reset_boundary(cadence, weekday, today)
    if last_run >= boundary:
        return

    result = await db.execute(
        select(User).where(
            User.role == UserRole.kid,
            User.is_active == True,
            User.points_balance != 0,
        )
    )
    kids = result.scalars().all()
    for kid in kids:
        db.add(PointTransaction(
            user_id=kid.id,
            amount=-kid.points_balance,
            type=PointType.reset,
            description="Periodic stars reset",
        ))
        kid.points_balance = 0

    last_run_setting.value = today.isoformat()
    logger.info("Periodic points reset applied to %d kid(s)", len(kids))


async def mark_yesterdays_leftovers_as_not_done(db, today: date):
    """Auto-close out any quest still pending from yesterday as "not done".

    Only looks at yesterday (not an unbounded backlog) so a pre-existing
    pile of old stale assignments never gets swept up and mass-penalized
    the first time this runs -- it only ever catches the one day that just
    ended. Applies each chore's effective malus policy (its own override, or
    else the family's decline-malus setting), the same way the kid's own
    "No" button and a parent's manual status change do.
    """
    yesterday = today - timedelta(days=1)

    malus_setting_result = await db.execute(
        select(AppSetting).where(AppSetting.key == "decline_malus_mode")
    )
    malus_setting = malus_setting_result.scalar_one_or_none()
    family_malus_enabled = malus_setting is not None and malus_setting.value == "malus"

    result = await db.execute(
        select(ChoreAssignment)
        .where(
            ChoreAssignment.status == AssignmentStatus.pending,
            ChoreAssignment.date == yesterday,
        )
        .options(selectinload(ChoreAssignment.chore))
    )
    assignments = result.scalars().all()
    if not assignments:
        return

    now = datetime.now(timezone.utc)
    for assignment in assignments:
        assignment.status = AssignmentStatus.skipped
        assignment.updated_at = now

        chore = assignment.chore
        if chore is not None and should_apply_malus(chore, family_malus_enabled) and chore.points > 0:
            kid_result = await db.execute(select(User).where(User.id == assignment.user_id))
            kid = kid_result.scalar_one_or_none()
            if kid is not None:
                malus_amount = min(chore.points, kid.points_balance)
                if malus_amount > 0:
                    kid.points_balance -= malus_amount
                    db.add(PointTransaction(
                        user_id=assignment.user_id,
                        amount=-malus_amount,
                        type=PointType.bonus,
                        description=f"Not done: {chore.title}",
                        reference_id=assignment.id,
                    ))

    logger.info("Marked %d leftover assignment(s) from %s as not done", len(assignments), yesterday)


async def daily_reset_task():
    """Background task that runs once per day at the configured hour.

    Responsibilities:
    - Generate today's recurring chore assignments (with rotation advancement)
    - Clean up expired refresh tokens
    """
    while True:
        target_hour = settings.DAILY_RESET_HOUR
        async with async_session() as db:
            await apply_family_timezone(db)
            hour_result = await db.execute(
                select(AppSetting).where(AppSetting.key == "daily_reset_hour")
            )
            hour_setting = hour_result.scalar_one_or_none()
            if hour_setting is not None:
                try:
                    target_hour = max(0, min(23, int(hour_setting.value)))
                except ValueError:
                    pass

        # Naive "now" — reflects the family's timezone applied above, so
        # target_hour means that hour in the family's local time, not UTC.
        now = datetime.now()
        next_run = now.replace(hour=target_hour, minute=0, second=0, microsecond=0)
        if now >= next_run:
            next_run += timedelta(days=1)
        wait_seconds = (next_run - now).total_seconds()
        await asyncio.sleep(wait_seconds)

        try:
            async with async_session() as db:
                today = date.today()

                # Auto-close out yesterday's still-pending quests as "not done"
                await mark_yesterdays_leftovers_as_not_done(db, today)

                await generate_daily_assignments(db, today)

                # Reset streaks for kids who missed yesterday
                await reset_stale_streaks(db, today)

                # Periodic stars reset, if enabled in family settings
                await maybe_reset_points(db, today)

                # Clean up expired refresh tokens
                await db.execute(
                    delete(RefreshToken).where(
                        RefreshToken.expires_at < datetime.now(timezone.utc)
                    )
                )

                await db.commit()
        except Exception:
            logger.exception("Daily reset error")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    install_push_hooks()
    async with async_session() as db:
        await seed_database(db)
        await apply_family_timezone(db)
    task = asyncio.create_task(daily_reset_task())
    yield
    task.cancel()


app = FastAPI(title="ChoreQuest", lifespan=lifespan)

# CORS - configurable via CORS_ORIGINS env var (comma-separated), empty = no cross-origin
_cors_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(self), microphone=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data: blob:; "
        "connect-src 'self' wss: ws:; "
        "worker-src 'self'; "
        "frame-ancestors 'none'"
    )
    if settings.COOKIE_SECURE:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    # Prevent browser caching of sw.js so updates are always detected
    if request.url.path == "/sw.js":
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
    return response


# Import and register routers
from backend.routers import (  # noqa: E402
    auth, chores, rewards, points, stats, calendar,
    notifications, admin, avatar, wishlist, rotations, uploads, push,
    shoutouts, vacation, progress, emotes, announcements, kiosk,
)

app.include_router(auth.router)
app.include_router(chores.router)
app.include_router(rewards.router)
app.include_router(points.router)
app.include_router(stats.router)
app.include_router(calendar.router)
app.include_router(notifications.router)
app.include_router(admin.router)
app.include_router(avatar.router)
app.include_router(wishlist.router)
app.include_router(rotations.router)
app.include_router(uploads.router)
app.include_router(push.router)
app.include_router(shoutouts.router)
app.include_router(vacation.router)
app.include_router(progress.router)
app.include_router(emotes.router)
app.include_router(announcements.router)
app.include_router(kiosk.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: int):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001)
        return

    payload = decode_access_token(token)
    if payload is None or int(payload["sub"]) != user_id:
        await websocket.close(code=4001)
        return

    await ws_manager.connect(websocket, user_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, user_id)


# Serve frontend static files
if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse({"detail": "Not found"}, status_code=404)
        file_path = STATIC_DIR / full_path
        if file_path.resolve().is_relative_to(STATIC_DIR.resolve()) and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(STATIC_DIR / "index.html"))
