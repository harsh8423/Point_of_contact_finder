"""
AnyMailFinder service — replaces Apollo.io for POC/contact discovery.

Two modes:
  1. decision_maker  → POST /v5.1/find-email/decision-maker
     Finds ONE key contact (CEO/owner/etc.) with name + verified email + LinkedIn.
     2 credits, only charged on valid find.

  2. company         → POST /v5.1/find-email/company
     Finds up to 20 emails at the company domain.
     1 credit, only charged on valid finds.
"""
import httpx
from urllib.parse import urlparse
from sqlalchemy.ext.asyncio import AsyncSession

from services.key_resolver import get_api_key

BASE = "https://api.anymailfinder.com/v5.1"

# Decision-maker categories ordered by priority for a B2B outreach context
DM_CATEGORIES = ["ceo", "operations", "marketing", "sales", "finance"]


def _extract_domain(website: str) -> str:
    parsed = urlparse(website if "://" in website else f"https://{website}")
    domain = parsed.netloc or parsed.path
    return domain.removeprefix("www.")


def _amf_headers(api_key: str) -> dict:
    return {
        "Authorization": api_key,
        "Content-Type": "application/json",
    }


async def find_decision_maker(lead, api_key: str) -> list[dict]:
    """
    Try each DM category in order and return the first valid result.
    Endpoint: POST /v5.1/find-email/decision-maker
    """
    payload: dict = {}
    if lead.website:
        payload["domain"] = _extract_domain(lead.website)
    else:
        payload["company_name"] = lead.business_name

    contacts = []
    async with httpx.AsyncClient(timeout=180.0) as client:
        for category in DM_CATEGORIES:
            body = {**payload, "decision_maker_category": [category]}
            resp = await client.post(
                f"{BASE}/find-email/decision-maker",
                headers=_amf_headers(api_key),
                json=body,
            )
            if resp.status_code == 402:
                raise ValueError("AnyMailFinder: insufficient credits. Buy more at https://app.anymailfinder.com/purchase")
            if resp.status_code == 401:
                raise ValueError("AnyMailFinder: invalid API key. Check your key in Settings.")
            if not resp.is_success:
                continue  # skip failed category, try next

            data = resp.json()
            email_status = data.get("email_status", "not_found")
            valid_email = data.get("valid_email")

            if valid_email and email_status in ("valid", "risky"):
                contacts.append({
                    "name": data.get("person_full_name"),
                    "title": data.get("person_job_title") or category.title(),
                    "email": valid_email,
                    "linkedin_url": data.get("person_linkedin_url"),
                    "phone": None,
                    "source": "anymailfinder",
                })
                break  # found a good one, stop searching

    return contacts


async def find_company_emails(lead, api_key: str) -> list[dict]:
    """
    Fetch up to 20 company emails (no names/titles, just addresses).
    Endpoint: POST /v5.1/find-email/company
    """
    payload: dict = {"email_type": "personal"}
    if lead.website:
        payload["domain"] = _extract_domain(lead.website)
    else:
        payload["company_name"] = lead.business_name

    async with httpx.AsyncClient(timeout=180.0) as client:
        resp = await client.post(
            f"{BASE}/find-email/company",
            headers=_amf_headers(api_key),
            json=payload,
        )
        if resp.status_code == 402:
            raise ValueError("AnyMailFinder: insufficient credits. Buy more at https://app.anymailfinder.com/purchase")
        if resp.status_code == 401:
            raise ValueError("AnyMailFinder: invalid API key. Check your key in Settings.")
        if not resp.is_success:
            data = resp.json()
            raise RuntimeError(f"AnyMailFinder error: {data.get('message', resp.text[:200])}")

        data = resp.json()

    valid_emails: list[str] = data.get("valid_emails") or data.get("emails") or []
    contacts = []
    for email in valid_emails[:10]:  # cap at 10
        contacts.append({
            "name": None,
            "title": None,
            "email": email,
            "linkedin_url": None,
            "phone": None,
            "source": "anymailfinder",
        })
    return contacts


async def find_poc(lead, db: AsyncSession, mode: str = "decision_maker") -> list[dict]:
    """
    Main entry point called by routers.
    mode: "decision_maker" | "company"
    """
    api_key = await get_api_key(db, "ANYMAILFINDER_API_KEY", "ANYMAILFINDER_API_KEY")
    if not api_key:
        raise ValueError(
            "AnyMailFinder API key is not configured. "
            "Get your key at https://newapp.anymailfinder.com/settings/api and add it in Settings."
        )

    if mode == "company":
        return await find_company_emails(lead, api_key)
    else:
        return await find_decision_maker(lead, api_key)
