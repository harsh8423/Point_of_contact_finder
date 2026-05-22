"""
Shared helper to resolve API keys.
Priority: .env / environment variables → Settings DB table.

Environment variables are the source of truth. The DB settings table
is only used as a fallback for keys entered via the Settings UI that
are NOT already defined in the environment.
"""
import os
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select


async def get_api_key(db: AsyncSession, key_name: str, env_fallback: str) -> str:
    """
    1. Check environment variable (set via .env / Render env vars) — safest.
    2. Fall back to the Settings DB table (entered via Settings UI).
    Returns empty string if neither is set.
    """
    # 1. Environment variable takes priority — never touches DB for this
    env_val = os.getenv(env_fallback, "") or os.getenv(key_name, "")
    if env_val and not env_val.startswith("your_"):
        return env_val

    # 2. Fallback: DB settings table (for keys added via the UI)
    try:
        from models import Settings
        result = await db.execute(select(Settings).where(Settings.key == key_name))
        row = result.scalar_one_or_none()
        if row and row.value and not row.value.startswith("your_"):
            return row.value
    except Exception:
        pass

    return ""
