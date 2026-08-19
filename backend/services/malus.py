"""Shared decline-malus policy resolution.

A chore's ``malus_override`` (None/"none"/"malus") takes priority over the
family-wide "decline_malus_mode" AppSetting, letting a parent turn the malus
on or off for one or a few specific chores regardless of the family default.
"""


def should_apply_malus(chore, family_malus_enabled: bool) -> bool:
    if chore.malus_override == "malus":
        return True
    if chore.malus_override == "none":
        return False
    return family_malus_enabled
