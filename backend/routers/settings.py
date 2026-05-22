import os
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import Settings

router = APIRouter()

SETTING_KEYS = ["APIFY_API_TOKEN", "ANYMAILFINDER_API_KEY", "OPENAI_API_KEY", "DEFAULT_MAX_RESULTS"]


class SettingsPayload(BaseModel):
    APIFY_API_TOKEN: str = ""
    ANYMAILFINDER_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    DEFAULT_MAX_RESULTS: str = "50"


def _mask(key: str, value: str) -> str:
    if not value:
        return ""
    if len(value) > 10:
        return value[:6] + "***" + value[-4:]
    return "***"


@router.get("/settings")
async def get_settings(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Settings))
    rows = result.scalars().all()
    db_data = {row.key: row.value for row in rows}

    # Merge: env var takes priority over DB
    data = {}
    for k in SETTING_KEYS:
        env_val = os.getenv(k, "")
        data[k] = env_val if env_val else db_data.get(k, "")

    masked = {}
    for k in SETTING_KEYS:
        v = data.get(k, "")
        if k in ("APIFY_API_TOKEN", "APOLLO_API_KEY", "OPENAI_API_KEY", "ANYMAILFINDER_API_KEY"):
            masked[k] = _mask(k, v) if v else ""
        else:
            masked[k] = v

    # A key is "missing" only if it's absent from BOTH env AND DB
    missing = [
        k for k in ("APIFY_API_TOKEN", "ANYMAILFINDER_API_KEY", "OPENAI_API_KEY")
        if not data.get(k) or data[k].startswith("your_")
    ]
    return {"settings": masked, "missing_keys": missing}


@router.post("/settings")
async def save_settings(payload: SettingsPayload, db: AsyncSession = Depends(get_db)):
    payload_dict = payload.model_dump()
    for key, value in payload_dict.items():
        if not value:
            continue
        # If this key is already set via environment variable, don't store in DB
        # (env var is the secure source of truth)
        if os.getenv(key):
            continue
        # Upsert into settings table only for keys NOT in env
        result = await db.execute(select(Settings).where(Settings.key == key))
        row = result.scalar_one_or_none()
        if row:
            row.value = value
            row.updated_at = datetime.utcnow()
        else:
            db.add(Settings(key=key, value=value))
        # Also set in current process environment
        os.environ[key] = value

    await db.commit()
    return {"saved": True}
