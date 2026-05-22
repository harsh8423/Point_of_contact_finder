from datetime import datetime, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from sqlalchemy.orm import selectinload

from database import get_db
from models import Lead, Contact, Qualification, User
from services.apify_service import run_maps_scrape, parse_maps_result
from dependencies import get_current_user, RateLimiter

router = APIRouter()


class BulkDeleteRequest(BaseModel):
    lead_ids: List[int]


class ScrapeRequest(BaseModel):
    query: str
    max_results: int = 50


# ─────────────────────────────────────────────────────────────
# Scrape
# ─────────────────────────────────────────────────────────────

@router.post("/scrape")
async def scrape_maps(
    req: ScrapeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _rate: None = Depends(RateLimiter("searches")),
):
    try:
        raw_items = await run_maps_scrape(req.query, req.max_results, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Apify scrape failed: {str(e)}")

    saved = []
    for item in raw_items:
        parsed = parse_maps_result(item)
        lead = Lead(user_id=current_user.id, search_query=req.query, **parsed)
        db.add(lead)
        await db.flush()
        saved.append({
            "id": lead.id,
            "business_name": lead.business_name,
            "address": lead.address,
            "phone": lead.phone,
            "website": lead.website,
            "rating": lead.rating,
            "review_count": lead.review_count,
            "category": lead.category,
            "maps_url": lead.maps_url,
            "status": lead.status,
            "search_query": lead.search_query,
            "created_at": lead.created_at.isoformat() if lead.created_at else None,
        })

    await db.commit()
    return {"count": len(saved), "leads": saved}


# ─────────────────────────────────────────────────────────────
# List leads  (scoped to current user)
# ─────────────────────────────────────────────────────────────

@router.get("/leads")
async def list_leads(
    search_query: Optional[str] = None,
    status: Optional[str] = None,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    uid = current_user.id

    stmt = select(Lead).options(
        selectinload(Lead.contacts),
        selectinload(Lead.qualifications),
    ).where(Lead.user_id == uid)

    count_stmt = select(func.count()).select_from(Lead).where(Lead.user_id == uid)

    if search_query:
        stmt = stmt.where(Lead.search_query == search_query)
        count_stmt = count_stmt.where(Lead.search_query == search_query)
    if status:
        stmt = stmt.where(Lead.status == status)
        count_stmt = count_stmt.where(Lead.status == status)

    total = (await db.execute(count_stmt)).scalar()
    stmt = stmt.order_by(Lead.created_at.desc()).offset((page - 1) * limit).limit(limit)
    leads = (await db.execute(stmt)).scalars().all()

    leads_out = []
    for lead in leads:
        leads_out.append({
            "id": lead.id,
            "business_name": lead.business_name,
            "address": lead.address,
            "phone": lead.phone,
            "website": lead.website,
            "rating": lead.rating,
            "review_count": lead.review_count,
            "category": lead.category,
            "maps_url": lead.maps_url,
            "status": lead.status,
            "search_query": lead.search_query,
            "created_at": lead.created_at.isoformat() if lead.created_at else None,
            "contact_count": len(lead.contacts),
            "qualified": len(lead.qualifications) > 0,
        })

    return {"total": total, "leads": leads_out, "page": page, "limit": limit}


# ─────────────────────────────────────────────────────────────
# Distinct queries for this user
# ─────────────────────────────────────────────────────────────

@router.get("/leads/queries")
async def list_queries(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = (
        select(Lead.search_query, func.count(Lead.id).label("count"))
        .where(Lead.user_id == current_user.id)
        .group_by(Lead.search_query)
    )
    rows = (await db.execute(stmt)).all()
    return [{"query": r[0], "count": r[1]} for r in rows]


# ─────────────────────────────────────────────────────────────
# Stats  (scoped to current user)
# ─────────────────────────────────────────────────────────────

@router.get("/leads/stats")
async def get_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    uid = current_user.id
    total = (await db.execute(
        select(func.count()).select_from(Lead).where(Lead.user_id == uid)
    )).scalar()
    poc_found = (await db.execute(
        select(func.count()).select_from(Lead).where(Lead.user_id == uid, Lead.status == "poc_found")
    )).scalar()
    qualified = (await db.execute(
        select(func.count()).select_from(Lead).where(Lead.user_id == uid, Lead.status == "qualified")
    )).scalar()
    week_ago = datetime.utcnow() - timedelta(days=7)
    this_week = (await db.execute(
        select(func.count()).select_from(Lead).where(Lead.user_id == uid, Lead.created_at >= week_ago)
    )).scalar()
    return {"total": total, "poc_found": poc_found, "qualified": qualified, "this_week": this_week}


# ─────────────────────────────────────────────────────────────
# Single lead  (must belong to current user)
# ─────────────────────────────────────────────────────────────

@router.get("/leads/{lead_id}")
async def get_lead(
    lead_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(Lead).where(Lead.id == lead_id, Lead.user_id == current_user.id).options(
        selectinload(Lead.contacts),
        selectinload(Lead.qualifications),
    )
    lead = (await db.execute(stmt)).scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    return {
        "id": lead.id,
        "business_name": lead.business_name,
        "address": lead.address,
        "phone": lead.phone,
        "website": lead.website,
        "rating": lead.rating,
        "review_count": lead.review_count,
        "category": lead.category,
        "maps_url": lead.maps_url,
        "status": lead.status,
        "search_query": lead.search_query,
        "created_at": lead.created_at.isoformat() if lead.created_at else None,
        "contacts": [
            {
                "id": c.id,
                "name": c.name,
                "title": c.title,
                "email": c.email,
                "linkedin_url": c.linkedin_url,
                "phone": c.phone,
                "source": c.source,
            }
            for c in lead.contacts
        ],
        "qualifications": [
            {
                "id": q.id,
                "summary": q.summary,
                "score": q.score,
                "reasoning": q.reasoning,
                "size": q.size,
                "recent_news": q.recent_news,
            }
            for q in lead.qualifications
        ],
    }


# ─────────────────────────────────────────────────────────────
# Delete  (must own the lead)
# ─────────────────────────────────────────────────────────────

@router.delete("/leads/{lead_id}")
async def delete_lead(
    lead_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lead = (await db.execute(
        select(Lead).where(Lead.id == lead_id, Lead.user_id == current_user.id)
    )).scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    await db.delete(lead)
    await db.commit()
    return {"deleted": True}


@router.delete("/leads")
async def bulk_delete_leads(
    req: BulkDeleteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Only delete leads owned by the current user
    await db.execute(
        delete(Lead).where(Lead.id.in_(req.lead_ids), Lead.user_id == current_user.id)
    )
    await db.commit()
    return {"deleted": len(req.lead_ids)}
