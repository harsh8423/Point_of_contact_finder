"""
Shared helper to resolve API keys.
Priority: SQLite settings table → .env / environment variables.
This lets users configure keys via the Settings UI without restarting the server.
"""
import os
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select


async def get_api_key(db: AsyncSession, key_name: str, env_fallback: str) -> str:
    """
    Look up key_name in the settings table first.
    Falls back to the environment variable named env_fallback.
    Returns empty string if neither is set.
    """
    try:
        from models import Settings
        result = await db.execute(select(Settings).where(Settings.key == key_name))
        row = result.scalar_one_or_none()
        if row and row.value and not row.value.startswith("your_"):
            return row.value
    except Exception:
        pass
    return os.getenv(env_fallback, "")
