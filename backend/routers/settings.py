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
    data = {row.key: row.value for row in rows}
    masked = {}
    for k in SETTING_KEYS:
        v = data.get(k, "")
        if k in ("APIFY_API_TOKEN", "APOLLO_API_KEY", "OPENAI_API_KEY"):
            masked[k] = _mask(k, v) if v else ""
        else:
            masked[k] = v
    missing = [k for k in ("APIFY_API_TOKEN", "ANYMAILFINDER_API_KEY", "OPENAI_API_KEY")
               if not data.get(k) or data[k].startswith("your_")]
    return {"settings": masked, "missing_keys": missing}


@router.post("/settings")
async def save_settings(payload: SettingsPayload, db: AsyncSession = Depends(get_db)):
    payload_dict = payload.model_dump()
    for key, value in payload_dict.items():
        if not value:
            continue  # Don't save/overwrite with empty string
        # Upsert into settings table
        result = await db.execute(select(Settings).where(Settings.key == key))
        row = result.scalar_one_or_none()
        if row:
            row.value = value
            row.updated_at = datetime.utcnow()
        else:
            db.add(Settings(key=key, value=value))
        # Also set in current process environment so os.getenv() picks it up
        os.environ[key] = value

    await db.commit()
    return {"saved": True}
