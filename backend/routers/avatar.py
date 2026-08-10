from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models import User
from backend.dependencies import get_current_user
from backend.websocket_manager import ws_manager

router = APIRouter(prefix="/api/avatar", tags=["avatar"])

# Avatar parts catalogue — matches the frontend SvgAvatar renderer.
# Everything here is free and always available to every user.
AVATAR_PARTS = {
    "head": [
        {"id": "round", "name": "Round"}, {"id": "oval", "name": "Oval"},
        {"id": "square", "name": "Square"}, {"id": "diamond", "name": "Diamond"},
        {"id": "heart", "name": "Heart"}, {"id": "long", "name": "Long"},
        {"id": "triangle", "name": "Triangle"}, {"id": "pear", "name": "Pear"},
        {"id": "wide", "name": "Wide"},
    ],
    "hair": [
        {"id": "none", "name": "None"}, {"id": "short", "name": "Short"},
        {"id": "long", "name": "Long"}, {"id": "spiky", "name": "Spiky"},
        {"id": "curly", "name": "Curly"}, {"id": "mohawk", "name": "Mohawk"},
        {"id": "buzz", "name": "Buzz"}, {"id": "ponytail", "name": "Ponytail"},
        {"id": "bun", "name": "Bun"}, {"id": "pigtails", "name": "Pigtails"},
        {"id": "afro", "name": "Afro"}, {"id": "braids", "name": "Braids"},
        {"id": "wavy", "name": "Wavy"}, {"id": "side_part", "name": "Side Part"},
        {"id": "fade", "name": "Fade"}, {"id": "dreadlocks", "name": "Dreadlocks"},
        {"id": "bob", "name": "Bob"}, {"id": "shoulder", "name": "Shoulder"},
        {"id": "undercut", "name": "Undercut"}, {"id": "twin_buns", "name": "Twin Buns"},
    ],
    "eyes": [
        {"id": "normal", "name": "Normal"}, {"id": "happy", "name": "Happy"},
        {"id": "wide", "name": "Wide"}, {"id": "sleepy", "name": "Sleepy"},
        {"id": "wink", "name": "Wink"}, {"id": "angry", "name": "Angry"},
        {"id": "dot", "name": "Dot"}, {"id": "star", "name": "Star"},
        {"id": "glasses", "name": "Glasses"}, {"id": "sunglasses", "name": "Sunglasses"},
        {"id": "eye_patch", "name": "Eye Patch"}, {"id": "crying", "name": "Crying"},
        {"id": "heart_eyes", "name": "Heart Eyes"}, {"id": "dizzy", "name": "Dizzy"},
        {"id": "closed", "name": "Closed"},
    ],
    "mouth": [
        {"id": "smile", "name": "Smile"}, {"id": "grin", "name": "Grin"},
        {"id": "neutral", "name": "Neutral"}, {"id": "open", "name": "Open"},
        {"id": "tongue", "name": "Tongue"}, {"id": "frown", "name": "Frown"},
        {"id": "surprised", "name": "Surprised"}, {"id": "smirk", "name": "Smirk"},
        {"id": "braces", "name": "Braces"}, {"id": "vampire", "name": "Vampire"},
        {"id": "whistle", "name": "Whistle"}, {"id": "mask", "name": "Mask"},
        {"id": "beard", "name": "Beard"}, {"id": "moustache", "name": "Moustache"},
    ],
    "hat": [
        {"id": "none", "name": "None"}, {"id": "crown", "name": "Crown"},
        {"id": "wizard", "name": "Wizard"}, {"id": "beanie", "name": "Beanie"},
        {"id": "cap", "name": "Cap"}, {"id": "pirate", "name": "Pirate"},
        {"id": "headphones", "name": "Headphones"}, {"id": "tiara", "name": "Tiara"},
        {"id": "horns", "name": "Horns"}, {"id": "bunny_ears", "name": "Bunny Ears"},
        {"id": "cat_ears", "name": "Cat Ears"}, {"id": "halo", "name": "Halo"},
        {"id": "viking", "name": "Viking"},
    ],
    "accessory": [
        {"id": "none", "name": "None"}, {"id": "scarf", "name": "Scarf"},
        {"id": "necklace", "name": "Necklace"}, {"id": "bow_tie", "name": "Bow Tie"},
        {"id": "cape", "name": "Cape"}, {"id": "wings", "name": "Wings"},
        {"id": "shield", "name": "Shield"}, {"id": "sword", "name": "Sword"},
    ],
    "face_extra": [
        {"id": "none", "name": "None"}, {"id": "freckles", "name": "Freckles"},
        {"id": "blush", "name": "Blush"}, {"id": "face_paint", "name": "Face Paint"},
        {"id": "scar", "name": "Scar"}, {"id": "bandage", "name": "Bandage"},
        {"id": "stickers", "name": "Stickers"},
    ],
    "outfit_pattern": [
        {"id": "none", "name": "None"}, {"id": "stripes", "name": "Stripes"},
        {"id": "stars", "name": "Stars"}, {"id": "camo", "name": "Camo"},
        {"id": "tie_dye", "name": "Tie Dye"}, {"id": "plaid", "name": "Plaid"},
    ],
}

# Curated colour palettes
AVATAR_COLORS = {
    "head_color": [
        "#ffe0bd", "#ffcc99", "#f5d6b8", "#f8d9c0",
        "#e8b88a", "#d4a373", "#c68642", "#a67c52",
        "#8d5524", "#6b3a2a", "#4a2912", "#3b1f0e",
        "#f0c4a8", "#d4956a", "#b07848", "#8a6642",
    ],
    "hair_color": [
        "#4a3728", "#1a1a2e", "#8b4513", "#d4a017",
        "#c0392b", "#2e86c1", "#7d3c98", "#27ae60",
        "#e74c3c", "#f39c12", "#ecf0f1", "#ff6b9d",
    ],
    "eye_color": [
        "#333333", "#1a5276", "#27ae60", "#8b4513",
        "#7d3c98", "#c0392b", "#2e86c1", "#e74c3c",
    ],
    "mouth_color": [
        "#cc6666", "#e74c3c", "#d4a373", "#c0392b",
        "#ff6b9d", "#a93226", "#8b4513", "#333333",
    ],
    "body_color": [
        "#3b82f6", "#ef4444", "#10b981", "#f59e0b",
        "#a855f7", "#ec4899", "#06b6d4", "#84cc16",
        "#f97316", "#6366f1", "#1a1a2e", "#ecf0f1",
    ],
    "bg_color": [
        "#1a1a2e", "#0f0e17", "#16213e", "#1b4332",
        "#4a1942", "#2d1b69", "#1a3a3a", "#3d0c02",
        "#2e86c1", "#27ae60", "#f39c12", "#8e44ad",
    ],
    "hat_color": [
        "#f39c12", "#e74c3c", "#3b82f6", "#10b981",
        "#a855f7", "#ec4899", "#f59e0b", "#1a1a2e",
        "#c0c0c0", "#f9d71c", "#8b4513", "#ecf0f1",
    ],
    "accessory_color": [
        "#3b82f6", "#ef4444", "#10b981", "#f39c12",
        "#a855f7", "#ec4899", "#c0c0c0", "#f9d71c",
        "#8b4513", "#1a1a2e", "#ecf0f1", "#06b6d4",
    ],
}


class AvatarConfig(BaseModel):
    config: dict


class AvatarPhoto(BaseModel):
    photo_url: str | None = None


# ---------- GET /parts ----------
@router.get("/parts")
async def get_avatar_parts():
    """Return the avatar parts catalogue and colour palettes."""
    return {"parts": AVATAR_PARTS, "colors": AVATAR_COLORS}


# ---------- PUT / ----------
@router.put("")
async def save_avatar(
    body: AvatarConfig,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Save avatar configuration for the current user."""
    user.avatar_config = body.config
    user.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)
    await ws_manager.broadcast({"type": "data_changed", "data": {"entity": "user"}}, exclude_user=user.id)
    return {"detail": "Avatar updated", "avatar_config": user.avatar_config}


# ---------- PUT /photo ----------
@router.put("/photo")
async def save_avatar_photo(
    body: AvatarPhoto,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Set or clear the user's profile photo. photo_url=None reverts to the drawn avatar."""
    user.avatar_photo_url = body.photo_url
    user.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)
    await ws_manager.broadcast({"type": "data_changed", "data": {"entity": "user"}}, exclude_user=user.id)
    return {"detail": "Photo updated", "avatar_photo_url": user.avatar_photo_url}
