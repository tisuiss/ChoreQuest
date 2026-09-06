"""Auto-purchase: redeem flagged rewards the moment a kid can afford them.

Any active reward with ``auto_purchase = True`` is redeemed automatically for
a kid whenever their star balance reaches the reward's ``point_cost`` (checked
after every balance increase). Cheapest rewards are cleared first.
"""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import (
    Reward,
    RewardRedemption,
    RedemptionStatus,
    User,
    UserRole,
    PointTransaction,
    PointType,
    Notification,
    NotificationType,
)
from backend.achievements import check_achievements
from backend.websocket_manager import ws_manager


async def process_auto_purchases(db: AsyncSession, user: User) -> None:
    """Redeem every affordable auto-purchase reward for ``user``.

    Commits its own changes and emits notifications / WebSocket events. Safe to
    call after any operation that raised a kid's ``points_balance``; a no-op for
    non-kids and when nothing is affordable.
    """
    if user.role != UserRole.kid:
        return

    result = await db.execute(
        select(Reward)
        .where(Reward.is_active == True, Reward.auto_purchase == True)
        .order_by(Reward.point_cost.asc())
    )
    rewards = result.scalars().all()

    parent_ids: list[int] | None = None
    redeemed: list[tuple[Reward, RewardRedemption]] = []

    for reward in rewards:
        if user.points_balance < reward.point_cost:
            continue
        if reward.stock is not None:
            if reward.stock <= 0:
                continue
            reward.stock -= 1

        user.points_balance -= reward.point_cost
        db.add(PointTransaction(
            user_id=user.id,
            amount=-reward.point_cost,
            type=PointType.reward_redeem,
            description=f"Auto-purchased reward: {reward.title}",
            reference_id=reward.id,
        ))
        redemption = RewardRedemption(
            reward_id=reward.id,
            user_id=user.id,
            points_spent=reward.point_cost,
            status=RedemptionStatus.approved,
            approved_at=datetime.now(timezone.utc),
        )
        db.add(redemption)
        await db.flush()

        db.add(Notification(
            user_id=user.id,
            type=NotificationType.reward_approved,
            title="Reward Auto-Purchased!",
            message=(
                f"You had enough stars — '{reward.title}' was bought for you "
                f"automatically!"
            ),
            params={
                "key": "reward_auto_purchased",
                "title": reward.title,
                "points": reward.point_cost,
            },
            reference_type="redemption",
            reference_id=redemption.id,
        ))

        if parent_ids is None:
            pr = await db.execute(
                select(User.id).where(
                    User.role.in_([UserRole.parent, UserRole.admin]),
                    User.is_active == True,
                )
            )
            parent_ids = [pid for (pid,) in pr.all()]
        for pid in parent_ids:
            db.add(Notification(
                user_id=pid,
                type=NotificationType.reward_approved,
                title="Reward Auto-Purchased!",
                message=(
                    f"{user.display_name} reached {reward.point_cost} stars — "
                    f"'{reward.title}' was auto-purchased"
                ),
                params={
                    "key": "reward_auto_purchased_by_kid",
                    "kidName": user.display_name,
                    "title": reward.title,
                    "points": reward.point_cost,
                },
                reference_type="redemption",
                reference_id=redemption.id,
            ))

        redeemed.append((reward, redemption))

    if not redeemed:
        return

    await db.commit()

    for reward, redemption in redeemed:
        await ws_manager.send_to_user(user.id, {
            "type": "reward_redeemed",
            "data": {
                "redemption_id": redemption.id,
                "reward_title": reward.title,
                "points_spent": reward.point_cost,
                "status": "approved",
                "auto": True,
            },
        })
    await ws_manager.broadcast(
        {"type": "data_changed", "data": {"entity": "redemption"}},
        exclude_user=user.id,
    )

    await check_achievements(db, user)
