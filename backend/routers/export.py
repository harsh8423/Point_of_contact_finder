import io
import csv
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from database import get_db
from models import Lead, User
from dependencies import get_current_user

router = APIRouter()


@router.get("/export/csv")
async def export_csv(
    lead_ids: Optional[str] = Query(default=None, description="Comma-separated lead IDs"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(Lead).options(
        selectinload(Lead.contacts),
        selectinload(Lead.qualifications),
    ).where(Lead.user_id == current_user.id)   # ← scoped to current user

    if lead_ids:
        ids = [int(x.strip()) for x in lead_ids.split(",") if x.strip().isdigit()]
        stmt = stmt.where(Lead.id.in_(ids))

    result = await db.execute(stmt)
    leads = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Business Name", "Category", "Address", "Phone", "Website",
        "Rating", "Reviews", "Status", "Contact Name", "Contact Title",
        "Contact Email", "Contact LinkedIn", "Qualification Score",
        "Summary", "Search Query", "Created At",
    ])

    for lead in leads:
        qual = lead.qualifications[0] if lead.qualifications else None
        if lead.contacts:
            for contact in lead.contacts:
                writer.writerow([
                    lead.business_name, lead.category, lead.address, lead.phone,
                    lead.website, lead.rating, lead.review_count, lead.status,
                    contact.name, contact.title, contact.email, contact.linkedin_url,
                    qual.score if qual else "", qual.summary if qual else "",
                    lead.search_query,
                    lead.created_at.isoformat() if lead.created_at else "",
                ])
        else:
            writer.writerow([
                lead.business_name, lead.category, lead.address, lead.phone,
                lead.website, lead.rating, lead.review_count, lead.status,
                "", "", "", "",
                qual.score if qual else "", qual.summary if qual else "",
                lead.search_query,
                lead.created_at.isoformat() if lead.created_at else "",
            ])

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="poc_export.csv"'},
    )
