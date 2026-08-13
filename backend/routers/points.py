from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.database import get_db
from backend.models import (
    User,
    UserRole,
    PointTransaction,
    PointType,
    AuditLog,
    Notification,
    NotificationType,
)
from backend.schemas import (
    BonusRequest,
    AdjustRequest,
    PointTransactionResponse,
    UserResponse,
)
from backend.dependencies import get_current_user, require_parent, require_admin
from backend.achievements import check_achievements
from backend.websocket_manager import ws_manager

router = APIRouter(prefix="/api/points", tags=["points"])


@router.get("/{user_id}", response_model=dict)
async def get_user_points(
    user_id: int,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a user's point balance and transaction history.

    Kids can only view their own balance.
    """
    if current_user.role == UserRole.kid and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Kids can only view their own points")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    stmt = (
        select(PointTransaction)
        .where(PointTransaction.user_id == user_id)
        .order_by(PointTransaction.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    tx_result = await db.execute(stmt)
    transactions = tx_result.scalars().all()

    return {
        "user": UserResponse.model_validate(user),
        "balance": user.points_balance,
        "total_earned": user.total_points_earned,
        "transactions": [
            PointTransactionResponse.model_validate(tx) for tx in transactions
        ],
    }


@router.get("/family/history", response_model=list[dict])
async def get_family_points_history(
    user_id: int | None = Query(None, description="Filter to a single kid"),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _parent: User = Depends(require_parent),
):
    """All kids' point transaction history, optionally filtered to one kid.

    Parent+ only -- used by the family-wide Points History page.
    """
    stmt = (
        select(PointTransaction)
        .join(User, PointTransaction.user_id == User.id)
        .where(User.role == UserRole.kid)
        .options(selectinload(PointTransaction.user))
        .order_by(PointTransaction.created_at.desc())
    )
    if user_id is not None:
        stmt = stmt.where(PointTransaction.user_id == user_id)
    stmt = stmt.offset(offset).limit(limit)

    result = await db.execute(stmt)
    transactions = result.scalars().all()

    return [
        {
            "id": tx.id,
            "user_id": tx.user_id,
            "user_display_name": tx.user.display_name if tx.user else None,
            "amount": tx.amount,
            "type": tx.type.value,
            "description": tx.description,
            "created_at": tx.created_at.isoformat(),
        }
        for tx in transactions
    ]


@router.delete("/family/history/{transaction_id}", status_code=204)
async def delete_family_points_transaction(
    transaction_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parent),
):
    """Delete a point transaction and reverse its effect on the balance.

    Parent+ only. Lifetime total_points_earned is left untouched (mirrors
    _undo_assignment in chores.py) so achievement unlocks aren't revoked.
    """
    result = await db.execute(
        select(PointTransaction).where(PointTransaction.id == transaction_id)
    )
    tx = result.scalar_one_or_none()
    if tx is None:
        raise HTTPException(status_code=404, detail="Transaction not found")

    user_result = await db.execute(select(User).where(User.id == tx.user_id))
    target_user = user_result.scalar_one_or_none()
    if target_user is not None:
        target_user.points_balance = max(0, target_user.points_balance - tx.amount)

    client_ip = request.client.host if request.client else None
    audit = AuditLog(
        user_id=current_user.id,
        action="point_transaction_delete",
        details={
            "target_user_id": tx.user_id,
            "amount": tx.amount,
            "description": tx.description,
            "type": tx.type.value,
        },
        ip_address=client_ip,
    )
    db.add(audit)

    await db.delete(tx)
    await db.commit()

    if target_user is not None:
        await ws_manager.send_to_user(target_user.id, {
            "type": "data_changed",
            "data": {"entity": "points", "new_balance": target_user.points_balance},
        })


@router.post("/{user_id}/bonus", response_model=PointTransactionResponse)
async def award_bonus(
    user_id: int,
    body: BonusRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parent),
):
    """Award bonus or malus stars to a user (Parent+). Negative amounts are a malus."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent balance from going negative
    if user.points_balance + body.amount < 0:
        raise HTTPException(
            status_code=400,
            detail="This would result in a negative balance",
        )

    # Update the user's balance
    user.points_balance += body.amount
    if body.amount > 0:
        user.total_points_earned += body.amount

    # Create the point transaction
    tx = PointTransaction(
        user_id=user.id,
        amount=body.amount,
        type=PointType.bonus,
        description=body.description,
        created_by=current_user.id,
    )
    db.add(tx)

    # Notify the kid
    is_malus = body.amount < 0
    notif = Notification(
        user_id=user.id,
        type=NotificationType.bonus_points,
        title="Points Deducted" if is_malus else "Bonus Points!",
        message=(
            f"You lost {-body.amount} stars: {body.description}"
            if is_malus
            else f"You received {body.amount} bonus stars: {body.description}"
        ),
        params={
            "key": "bonus_points_debit" if is_malus else "bonus_points_credit",
            "amount": abs(body.amount),
            "description": body.description,
        },
        reference_type="point_transaction",
    )
    db.add(notif)

    # Audit log entry for accountability (mirrors admin point_adjustment)
    client_ip = request.client.host if request.client else None
    audit = AuditLog(
        user_id=current_user.id,
        action="point_bonus",
        details={
            "target_user_id": user.id,
            "amount": body.amount,
            "description": body.description,
            "new_balance": user.points_balance,
        },
        ip_address=client_ip,
    )
    db.add(audit)

    await db.commit()
    await db.refresh(tx)

    # Check achievements after bonus
    await check_achievements(db, user)

    # WebSocket notification
    await ws_manager.send_to_user(user.id, {
        "type": "bonus_points",
        "data": {
            "amount": body.amount,
            "description": body.description,
            "new_balance": user.points_balance,
        },
    })

    return tx


@router.post("/adjust/{user_id}", response_model=PointTransactionResponse)
async def adjust_points(
    user_id: int,
    body: AdjustRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Admin point adjustment (can be negative).

    Creates both a PointTransaction and an AuditLog entry for accountability.
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent balance from going negative
    if user.points_balance + body.amount < 0:
        raise HTTPException(
            status_code=400,
            detail="Adjustment would result in a negative balance",
        )

    # Update the user's balance
    user.points_balance += body.amount
    if body.amount > 0:
        user.total_points_earned += body.amount

    # Create the point transaction
    tx = PointTransaction(
        user_id=user.id,
        amount=body.amount,
        type=PointType.adjustment,
        description=body.description,
        created_by=current_user.id,
    )
    db.add(tx)

    # Create audit log entry
    client_ip = request.client.host if request.client else None
    audit = AuditLog(
        user_id=current_user.id,
        action="point_adjustment",
        details={
            "target_user_id": user.id,
            "amount": body.amount,
            "description": body.description,
            "new_balance": user.points_balance,
        },
        ip_address=client_ip,
    )
    db.add(audit)

    await db.commit()
    await db.refresh(tx)

    await ws_manager.send_to_user(user.id, {
        "type": "data_changed",
        "data": {"entity": "points", "new_balance": user.points_balance},
    })

    return tx
