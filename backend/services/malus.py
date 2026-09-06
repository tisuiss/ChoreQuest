"""Shared decline-malus policy resolution.

A chore's ``malus_override`` (None/"none"/"malus") takes priority over the
family-wide "decline_malus_mode" AppSetting, letting a parent turn the malus
on or off for one or a few specific chores regardless of the family default.
"""

from sqlalchemy import select

from backend.models import AppSetting


def should_apply_malus(chore, family_malus_enabled: bool) -> bool:
    if chore.malus_override == "malus":
        return True
    if chore.malus_override == "none":
        return False
    return family_malus_enabled


async def get_family_malus_settings(db) -> tuple[bool, int]:
    """Fetch the family's decline-malus settings: whether it's enabled by
    default, and the flat extra penalty added on top of the chore's own
    points whenever a malus applies.
    """
    result = await db.execute(
        select(AppSetting).where(
            AppSetting.key.in_(["decline_malus_mode", "decline_malus_extra"])
        )
    )
    settings_map = {s.key: s.value for s in result.scalars().all()}
    enabled = settings_map.get("decline_malus_mode") == "malus"
    try:
        extra = max(0, int(settings_map.get("decline_malus_extra", "0")))
    except (TypeError, ValueError):
        extra = 0
    return enabled, extra
