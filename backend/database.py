from datetime import datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from backend.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},
)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db():
    async with engine.begin() as conn:
        # Enable WAL mode
        await conn.exec_driver_sql("PRAGMA journal_mode=WAL")
        from backend.models import (  # noqa: F401
            User, Chore, ChoreAssignment, ChoreCategory, ChoreRotation,
            ChoreExclusion, ChoreAssignmentRule, QuestTemplate,
            Reward, RewardRedemption, PointTransaction,
            Achievement, UserAchievement, WishlistItem,
            Notification, ApiKey, AuditLog, AppSetting,
            InviteCode, RefreshToken, PushSubscription,
            Shoutout, VacationPeriod, ChoreVacationPeriod, KidVacationPeriod,
            FamilyEvent, WeeklyMenuEntry, FamilyPhoto, FamilyTodo, FamilyBirthday,
            TrustedDevice,
        )
        await conn.run_sync(Base.metadata.create_all)

        # Lightweight column migrations for SQLite (create_all won't add
        # new columns to existing tables).
        _migrations = [
            ("reward_redemptions", "fulfilled_by", "INTEGER REFERENCES users(id)"),
            ("reward_redemptions", "fulfilled_at", "DATETIME"),
            # v2 feature columns
            ("users", "streak_freezes_used", "INTEGER DEFAULT 0"),
            ("users", "streak_freeze_month", "INTEGER"),
            ("chore_assignments", "feedback", "TEXT"),
            ("rewards", "category", "VARCHAR(50)"),
            ("achievements", "tier", "VARCHAR(10)"),
            ("achievements", "group_key", "VARCHAR(50)"),
            ("achievements", "sort_order", "INTEGER DEFAULT 0"),
            # i18n
            ("users", "language", "VARCHAR(5)"),
            ("notifications", "params", "TEXT"),
            ("users", "avatar_photo_url", "VARCHAR(255)"),
            ("chores", "photo_url", "VARCHAR(255)"),
            ("chores", "sort_order", "INTEGER DEFAULT 0"),
            ("chores", "pauses_during_vacation", "BOOLEAN DEFAULT 1"),
            ("chores", "window_start", "TIME"),
            ("chores", "window_end", "TIME"),
            ("chore_categories", "window_start", "TIME"),
            ("chore_categories", "window_end", "TIME"),
            ("chores", "malus_override", "VARCHAR(10)"),
            ("rewards", "photo_url", "VARCHAR(255)"),
            ("rewards", "auto_purchase", "BOOLEAN DEFAULT 0"),
            ("family_todos", "assignee_id", "INTEGER REFERENCES users(id)"),
            ("family_events", "duration_minutes", "INTEGER"),
            ("family_events", "all_day", "BOOLEAN DEFAULT 0"),
            ("family_events", "target_group", "VARCHAR(10)"),
            ("family_events", "icon", "VARCHAR(30)"),
            ("family_birthdays", "month", "INTEGER"),
            ("family_birthdays", "day", "INTEGER"),
            ("family_birthdays", "year", "INTEGER"),
        ]
        for table, col, typedef in _migrations:
            try:
                await conn.exec_driver_sql(
                    f"ALTER TABLE {table} ADD COLUMN {col} {typedef}"
                )
            except Exception:
                pass  # column already exists

        # family_birthdays used to store a single NOT NULL `date` column;
        # backfill month/day/year from it for any pre-existing rows, then
        # drop it so it stops requiring a value nothing sets anymore.
        try:
            await conn.exec_driver_sql(
                "UPDATE family_birthdays SET "
                "month = CAST(strftime('%m', date) AS INTEGER), "
                "day = CAST(strftime('%d', date) AS INTEGER), "
                "year = CAST(strftime('%Y', date) AS INTEGER) "
                "WHERE month IS NULL AND date IS NOT NULL"
            )
        except Exception:
            pass  # no `date` column left (already migrated) or table is empty
        try:
            await conn.exec_driver_sql("ALTER TABLE family_birthdays DROP COLUMN date")
        except Exception:
            pass  # already dropped, or SQLite too old to support DROP COLUMN

        # The trusted-device pairing feature used to store a single shared
        # token as an AppSetting ("kiosk_device_token"). Carry any
        # already-paired device over into the new multi-device table (as a
        # one-time migration) so an upgrade doesn't silently log it out.
        try:
            count_result = await conn.execute(text("SELECT COUNT(*) FROM trusted_devices"))
            if count_result.scalar() == 0:
                token_result = await conn.execute(
                    text("SELECT value FROM app_settings WHERE key = 'kiosk_device_token'")
                )
                old_token = token_result.scalar()
                if old_token:
                    await conn.execute(
                        text(
                            "INSERT INTO trusted_devices (name, token, created_at) "
                            "VALUES (:name, :token, :now)"
                        ),
                        {"name": "Appareil existant", "token": old_token, "now": datetime.utcnow()},
                    )
        except Exception:
            pass


async def get_db():
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
