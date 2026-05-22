import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from services.key_resolver import get_api_key

APOLLO_BASE = "https://api.apollo.io/v1"

DECISION_MAKER_TITLES = [
    "CEO", "Founder", "Co-Founder", "Director",
    "Owner", "Manager", "Head", "President", "MD",
    "Managing Director", "Partner",
]


def _extract_domain(website: str) -> str:
    from urllib.parse import urlparse
    parsed = urlparse(website if "://" in website else f"https://{website}")
    domain = parsed.netloc or parsed.path
    return domain.removeprefix("www.")


def _parse_person(person: dict) -> dict:
    phones = person.get("phone_numbers") or []
    phone_num = phones[0].get("sanitized_number") if phones else None
    return {
        "name": person.get("name"),
        "title": person.get("title"),
        "email": person.get("email"),
        "linkedin_url": person.get("linkedin_url"),
        "phone": phone_num,
    }


async def _search_people(payload: dict, api_key: str) -> list[dict]:
    """
    Try /people/search first (free plan compatible).
    Falls back to /mixed_people/search for paid plans.
    """
    headers = {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": api_key,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Try free-tier endpoint first
        resp = await client.post(
            f"{APOLLO_BASE}/people/search",
            headers=headers,
            json=payload,
        )
        if resp.status_code == 200:
            data = resp.json()
            people = data.get("people") or []
            if people:
                return [_parse_person(p) for p in people[:5]]

        # Fall back to mixed_people/search (paid plans)
        resp2 = await client.post(
            f"{APOLLO_BASE}/mixed_people/search",
            headers=headers,
            json=payload,
        )
        if resp2.status_code == 200:
            data2 = resp2.json()
            people2 = data2.get("people") or []
            return [_parse_person(p) for p in people2[:5]]

        # Both failed — provide clear error
        if resp.status_code == 403:
            err = resp.json().get("error", "403 Forbidden")
            if "free plan" in err.lower():
                raise ValueError(
                    "Apollo free plan does not support people search. "
                    "Please upgrade at https://app.apollo.io/ or use the Qualify Lead (AI) feature instead."
                )
        resp.raise_for_status()
    return []


async def find_poc_by_domain(domain: str, api_key: str) -> list[dict]:
    return await _search_people({
        "q_organization_domains": [domain],
        "person_titles": DECISION_MAKER_TITLES,
        "page": 1,
        "per_page": 5,
    }, api_key)


async def find_poc_by_company_name(company_name: str, api_key: str) -> list[dict]:
    return await _search_people({
        "q_organization_name": company_name,
        "person_titles": DECISION_MAKER_TITLES,
        "page": 1,
        "per_page": 5,
    }, api_key)


async def find_poc(lead, db: AsyncSession) -> list[dict]:
    """Main entry: resolve key from DB/env, prefer domain search, fall back to name."""
    api_key = await get_api_key(db, "APOLLO_API_KEY", "APOLLO_API_KEY")
    if not api_key:
        raise ValueError("Apollo API key is not configured. Please add it in Settings.")

    if lead.website:
        domain = _extract_domain(lead.website)
        try:
            results = await find_poc_by_domain(domain, api_key)
            if results:
                return results
        except ValueError:
            raise
        except Exception:
            pass  # fall through to name search

    return await find_poc_by_company_name(lead.business_name, api_key)
