"""
FastAPI dependencies:
  - get_current_user  : validates JWT from Authorization header or cookie
  - require_admin     : same + asserts is_admin
  - RateLimiter       : checks + increments DailyUsage for a given action
"""
from datetime import date

from fastapi import Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError

from database import get_db
from models import User, DailyUsage
import auth_utils


# ─────────────────────────────────────────────────────────────
# Token extraction (cookie OR Authorization: Bearer …)
# ─────────────────────────────────────────────────────────────

def _extract_token(request: Request) -> str | None:
    # 1. Check HTTP-only cookie first
    token = request.cookies.get("poc_token")
    if token:
        return token
    # 2. Fall back to Authorization header
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return None


# ─────────────────────────────────────────────────────────────
# get_current_user
# ─────────────────────────────────────────────────────────────

async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    token = _extract_token(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    try:
        payload = auth_utils.decode_token(token)
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated",
        )
    return user


async def require_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


# ─────────────────────────────────────────────────────────────
# Rate limiter dependency factory
# ─────────────────────────────────────────────────────────────

class RateLimiter:
    """
    Usage:
        @router.post("/scrape")
        async def scrape(
            ...,
            _: None = Depends(RateLimiter("searches")),
        ):
    """
    def __init__(self, action: str):
        # action must be one of: searches | poc | qualify
        self.action = action

    async def __call__(
        self,
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user),
    ) -> None:
        today = date.today()
        limit = current_user.limits[self.action]

        result = await db.execute(
            select(DailyUsage).where(
                DailyUsage.user_id == current_user.id,
                DailyUsage.date == today,
            )
        )
        usage = result.scalar_one_or_none()

        current_count = getattr(usage, self.action, 0) if usage else 0

        if current_count >= limit:
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "rate_limit_exceeded",
                    "action": self.action,
                    "used": current_count,
                    "limit": limit,
                    "plan": current_user.plan,
                    "message": (
                        f"Daily {self.action} limit reached ({current_count}/{limit}). "
                        f"Upgrade your plan or wait until tomorrow."
                    ),
                },
            )

        # Increment the counter
        if usage is None:
            usage = DailyUsage(user_id=current_user.id, date=today)
            db.add(usage)
            await db.flush()

        setattr(usage, self.action, current_count + 1)
        await db.commit()


# ─────────────────────────────────────────────────────────────
# Usage helper (read-only, no increment)
# ─────────────────────────────────────────────────────────────

async def get_usage_today(user: User, db: AsyncSession) -> dict:
    today = date.today()
    result = await db.execute(
        select(DailyUsage).where(
            DailyUsage.user_id == user.id,
            DailyUsage.date == today,
        )
    )
    usage = result.scalar_one_or_none()
    limits = user.limits
    return {
        "searches": {"used": usage.searches if usage else 0, "limit": limits["searches"]},
        "poc":      {"used": usage.poc      if usage else 0, "limit": limits["poc"]},
        "qualify":  {"used": usage.qualify  if usage else 0, "limit": limits["qualify"]},
    }
