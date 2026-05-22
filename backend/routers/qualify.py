import asyncio
from typing import List, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import Lead, Contact, Qualification
from services.openai_service import qualify_lead
from routers.poc import _save_contacts
from dependencies import get_current_user, RateLimiter
from models import User

router = APIRouter()


class BulkQualifyRequest(BaseModel):
    lead_ids: List[int]
    depth: Literal["normal", "deep"] = "normal"


class QualifyRequest(BaseModel):
    depth: Literal["normal", "deep"] = "normal"


@router.post("/leads/bulk-qualify")
async def bulk_qualify(
    req: BulkQualifyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _rate: None = Depends(RateLimiter("qualify")),
):
    results = []
    for lead_id in req.lead_ids:
        try:
            res = await db.execute(
                select(Lead).where(Lead.id == lead_id, Lead.user_id == current_user.id)
            )
            lead = res.scalar_one_or_none()
            if not lead:
                results.append({"lead_id": lead_id, "status": "not_found"})
                continue

            qual_data = await qualify_lead(lead, db, depth=req.depth)
            qual = Qualification(
                lead_id=lead_id,
                summary=qual_data.get("summary") or "",
                score=qual_data.get("score"),
                reasoning=qual_data.get("reasoning"),
                raw_response=qual_data.get("raw_response") or "",
                size=qual_data.get("size"),
                recent_news=qual_data.get("recent_news"),
            )
            db.add(qual)
            await db.flush()

            for c in qual_data.get("contacts_found") or []:
                c["source"] = "openai"
            await _save_contacts(db, lead_id, qual_data.get("contacts_found") or [])

            lead.status = "qualified"
            await db.commit()
            results.append({"lead_id": lead_id, "status": "ok", "score": qual.score})
        except Exception as e:
            results.append({"lead_id": lead_id, "status": "error", "detail": str(e)})

        await asyncio.sleep(2)

    return {"processed": sum(1 for r in results if r["status"] == "ok"), "results": results}


@router.post("/leads/{lead_id}/qualify")
async def qualify_lead_endpoint(
    lead_id: int,
    req: QualifyRequest = QualifyRequest(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _rate: None = Depends(RateLimiter("qualify")),
):
    result = await db.execute(
        select(Lead).where(Lead.id == lead_id, Lead.user_id == current_user.id)
    )
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    try:
        qual_data = await qualify_lead(lead, db, depth=req.depth)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OpenAI qualification failed: {str(e)}")

    qual = Qualification(
        lead_id=lead_id,
        summary=qual_data.get("summary") or "",
        score=qual_data.get("score"),
        reasoning=qual_data.get("reasoning"),
        raw_response=qual_data.get("raw_response") or "",
        size=qual_data.get("size"),
        recent_news=qual_data.get("recent_news"),
    )
    db.add(qual)
    await db.flush()

    saved_contacts = []
    for c in qual_data.get("contacts_found") or []:
        c["source"] = "openai"
    saved_contacts = await _save_contacts(db, lead_id, qual_data.get("contacts_found") or [])

    lead.status = "qualified"
    await db.commit()

    return {
        "qualification": {
            "id": qual.id,
            "summary": qual.summary,
            "score": qual.score,
            "reasoning": qual.reasoning,
            "size": qual.size,
            "recent_news": qual.recent_news,
            "source": qual_data.get("qualification_source", "unknown"),
        },
        "contacts": [{"name": c["name"], "email": c["email"]} for c in saved_contacts],
    }

