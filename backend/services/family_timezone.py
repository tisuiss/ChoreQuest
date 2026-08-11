"""Applies the family's configured timezone to the running process.

Rather than threading a timezone through every ``date.today()`` /
``datetime.now()`` call in the codebase, we set the process-wide ``TZ``
environment variable and call ``time.tzset()`` (POSIX-only — fine here,
the app only ever runs single-process under Linux/glibc in Docker). Every
naive date/time call in the backend then automatically reflects the
family's chosen timezone.
"""

import logging
import os
import time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import AppSetting

logger = logging.getLogger(__name__)

DEFAULT_TIMEZONE = "Europe/Paris"


async def apply_family_timezone(db: AsyncSession) -> str:
    """Read the family's timezone setting and apply it to this process.

    Falls back to DEFAULT_TIMEZONE if unset or invalid, logging a warning
    rather than crashing the app over a bad setting value.
    """
    result = await db.execute(select(AppSetting).where(AppSetting.key == "timezone"))
    setting = result.scalar_one_or_none()
    tz_name = setting.value if setting and setting.value else DEFAULT_TIMEZONE

    try:
        ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        logger.warning("Unknown timezone %r in settings, falling back to %s", tz_name, DEFAULT_TIMEZONE)
        tz_name = DEFAULT_TIMEZONE

    os.environ["TZ"] = tz_name
    time.tzset()
    return tz_name
