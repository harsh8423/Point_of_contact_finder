"""Admin router — user management, plan control, usage reset."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func
from typing import Literal, Optional

from database import get_db
from models import User, DailyUsage, PLAN_LIMITS
from dependencies import require_admin, get_usage_today

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ─────────────────────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────────────────────

class UpdatePlanRequest(BaseModel):
    plan: Literal["free_trial", "pro", "max"]


class UpdateUserRequest(BaseModel):
    plan: Optional[Literal["free_trial", "pro", "max"]] = None
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

async def _user_with_usage(user: User, db: AsyncSession) -> dict:
    usage = await get_usage_today(user, db)
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "plan": user.plan,
        "is_admin": user.is_admin,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat(),
        "limits": user.limits,
        "usage_today": usage,
    }


# ─────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────

@router.get("/users")
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """List all users with their today's usage."""
    result = await db.execute(select(User).order_by(User.created_at))
    users = result.scalars().all()
    return {
        "users": [await _user_with_usage(u, db) for u in users],
        "plan_limits": PLAN_LIMITS,
    }


@router.get("/users/{user_id}")
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return await _user_with_usage(user, db)


@router.patch("/users/{user_id}")
async def update_user(
    user_id: int,
    req: UpdateUserRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Update plan, active status, or admin flag."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent admin from removing their own admin status
    if req.is_admin is False and user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot remove your own admin privileges")

    if req.plan is not None:
        user.plan = req.plan
    if req.is_active is not None:
        user.is_active = req.is_active
    if req.is_admin is not None:
        user.is_admin = req.is_admin

    await db.commit()
    return await _user_with_usage(user, db)


@router.post("/users/{user_id}/reset-usage")
async def reset_usage(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Reset today's usage counters for a user."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    today = date.today()
    await db.execute(
        delete(DailyUsage).where(
            DailyUsage.user_id == user_id,
            DailyUsage.date == today,
        )
    )
    await db.commit()
    return {"message": f"Daily usage reset for {user.username}", "date": str(today)}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Hard delete a user (cannot delete yourself)."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    await db.delete(user)
    await db.commit()
    return {"message": f"User {user.username} deleted"}


@router.get("/stats")
async def admin_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """High-level stats for the admin dashboard."""
    today = date.today()

    total_users = (await db.execute(select(func.count(User.id)))).scalar()
    plan_counts = {}
    for plan in ("free_trial", "pro", "max"):
        cnt = (await db.execute(
            select(func.count(User.id)).where(User.plan == plan)
        )).scalar()
        plan_counts[plan] = cnt

    # Today's aggregate usage across all users
    usage_res = await db.execute(
        select(
            func.sum(DailyUsage.searches),
            func.sum(DailyUsage.poc),
            func.sum(DailyUsage.qualify),
        ).where(DailyUsage.date == today)
    )
    row = usage_res.one()
    today_usage = {
        "searches": row[0] or 0,
        "poc": row[1] or 0,
        "qualify": row[2] or 0,
    }

    return {
        "total_users": total_users,
        "plan_counts": plan_counts,
        "today_usage": today_usage,
        "plan_limits": PLAN_LIMITS,
    }
