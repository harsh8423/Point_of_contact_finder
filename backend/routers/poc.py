import asyncio
from typing import List, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import Lead, Contact
from services.anymailfinder_service import find_poc as anymailfinder_find_poc
from services.leads_finder_service import find_poc_apify
from services.web_crawl_service import find_poc_web_crawl
from services.key_resolver import get_api_key
from dependencies import get_current_user, RateLimiter
from models import User

router = APIRouter()

# ─────────────────────────────────────────────────────────────
# Request models
# ─────────────────────────────────────────────────────────────

class FindPOCRequest(BaseModel):
    # apify_leads is default; web_crawl = free website scrape; decision_maker/company = AnyMailFinder
    mode: Literal["apify_leads", "web_crawl", "decision_maker", "company"] = "apify_leads"


class BulkPOCRequest(BaseModel):
    lead_ids: List[int]
    mode: Literal["apify_leads", "web_crawl", "decision_maker", "company"] = "apify_leads"


# ─────────────────────────────────────────────────────────────
# Mode router — decides which service to call
# ─────────────────────────────────────────────────────────────

async def _dispatch_find_poc(lead, db: AsyncSession, mode: str) -> list[dict]:
    """Route to the right service based on mode."""
    if mode == "apify_leads":
        api_token = await get_api_key(db, "APIFY_API_TOKEN", "APIFY_API_TOKEN")
        if not api_token:
            raise ValueError("Apify API token is not configured. Please add it in Settings.")
        return await find_poc_apify(lead, api_token)
    if mode == "web_crawl":
        return await find_poc_web_crawl(lead)
    # decision_maker or company → AnyMailFinder
    return await anymailfinder_find_poc(lead, db, mode=mode)


# ─────────────────────────────────────────────────────────────
# DEDUPLICATION HELPER
# ─────────────────────────────────────────────────────────────

async def _get_existing_keys(db: AsyncSession, lead_id: int) -> tuple[set[str], set[str]]:
    """Return (existing_emails, existing_names) already stored for this lead."""
    result = await db.execute(
        select(Contact.email, Contact.name).where(Contact.lead_id == lead_id)
    )
    rows = result.all()
    existing_emails = {r[0].lower() for r in rows if r[0]}
    existing_names  = {r[1].lower() for r in rows if r[1]}
    return existing_emails, existing_names


def _is_duplicate(
    contact: dict,
    existing_emails: set[str],
    existing_names: set[str],
) -> bool:
    """
    A contact is a duplicate if:
      - its email already exists (case-insensitive), OR
      - its personal_email already exists, OR
      - its name already exists AND it has no email at all
    """
    email          = (contact.get("email") or "").strip().lower()
    personal_email = (contact.get("personal_email") or "").strip().lower()
    name           = (contact.get("name") or "").strip().lower()

    if email and email in existing_emails:
        return True
    if personal_email and personal_email in existing_emails:
        return True
    if name and not email and not personal_email and name in existing_names:
        return True
    return False


async def _save_contacts(
    db: AsyncSession,
    lead_id: int,
    contacts_data: list[dict],
) -> list[dict]:
    """
    Persist new contacts, skipping duplicates already on this lead.
    Returns list of saved contact dicts.
    """
    existing_emails, existing_names = await _get_existing_keys(db, lead_id)
    saved: list[dict] = []

    for c in contacts_data:
        if _is_duplicate(c, existing_emails, existing_names):
            continue

        contact = Contact(
            lead_id=lead_id,
            name=c.get("name") or c.get("full_name"),
            title=c.get("title") or c.get("job_title"),
            email=c.get("email"),
            linkedin_url=c.get("linkedin_url"),
            phone=c.get("phone"),
            source=c.get("source", "apify_leads"),
        )
        db.add(contact)
        await db.flush()

        # Track so same-batch dupes are also caught
        if contact.email:
            existing_emails.add(contact.email.lower())
        if c.get("personal_email"):
            existing_emails.add(c["personal_email"].lower())
        if contact.name:
            existing_names.add(contact.name.lower())

        saved.append({
            "id":              contact.id,
            "name":            contact.name,
            "title":           contact.title,
            "email":           contact.email,
            "personal_email":  c.get("personal_email"),
            "linkedin_url":    contact.linkedin_url,
            "phone":           contact.phone,
            "source":          contact.source,
            # Apify leads extra fields
            "headline":        c.get("headline"),
            "seniority_level": c.get("seniority_level"),
            "industry":        c.get("industry"),
        })

    return saved


# ─────────────────────────────────────────────────────────────
# BULK FIND-POC
# ─────────────────────────────────────────────────────────────

@router.post("/leads/bulk-find-poc")
async def bulk_find_poc(
    req: BulkPOCRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _rate: None = Depends(RateLimiter("poc")),
):
    results = []
    for lead_id in req.lead_ids:
        try:
            result = await db.execute(
                select(Lead).where(Lead.id == lead_id, Lead.user_id == current_user.id)
            )
            lead = result.scalar_one_or_none()
            if not lead:
                results.append({"lead_id": lead_id, "status": "not_found", "contacts": []})
                continue

            contacts_data = await _dispatch_find_poc(lead, db, mode=req.mode)
            saved = await _save_contacts(db, lead_id, contacts_data)

            lead.status = "poc_found"
            await db.commit()
            results.append({
                "lead_id":      lead_id,
                "status":       "ok",
                "contacts":     [{"name": c["name"], "email": c["email"]} for c in saved],
                "new_contacts": len(saved),
            })

        except ValueError as e:
            results.append({"lead_id": lead_id, "status": "error", "detail": str(e)})
            break   # key/credit error — stop batch to avoid waste
        except Exception as e:
            results.append({"lead_id": lead_id, "status": "error", "detail": str(e)})

        await asyncio.sleep(0.5)

    processed = sum(1 for r in results if r["status"] == "ok")
    return {"processed": processed, "results": results}


# ─────────────────────────────────────────────────────────────
# SINGLE FIND-POC
# ─────────────────────────────────────────────────────────────

@router.post("/leads/{lead_id}/find-poc")
async def find_poc_for_lead(
    lead_id: int,
    req: FindPOCRequest = FindPOCRequest(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _rate: None = Depends(RateLimiter("poc")),
):
    result = await db.execute(
        select(Lead).where(Lead.id == lead_id, Lead.user_id == current_user.id)
    )
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    try:
        contacts_data = await _dispatch_find_poc(lead, db, mode=req.mode)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"POC lookup failed: {str(e)}")

    saved_contacts = await _save_contacts(db, lead_id, contacts_data)
    lead.status = "poc_found"
    await db.commit()

    skipped = len(contacts_data) - len(saved_contacts)
    return {
        "contacts":          saved_contacts,
        "lead_id":           lead_id,
        "mode":              req.mode,
        "new_contacts":      len(saved_contacts),
        "duplicates_skipped": skipped,
    }
