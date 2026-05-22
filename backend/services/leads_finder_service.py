"""
Apify Leads Finder + Email Verifier pipeline for POC discovery.

Flow:
  1. code_crafter~leads-finder  → fetch up to 5 leads from company domain
     - email_status: validated
     - seniority_level: founder, owner, c_suite, director, vp, head, manager, senior
       (excludes: entry, trainee, partner)
  2. account56~email-verifier   → verify all emails collected in step 1
     - keep only where result == "ok" OR subresult == "ok"

Extracted fields per contact:
  linkedin, full_name, job_title, industry, headline, seniority_level, personal_email, email
"""
import asyncio
import re
from urllib.parse import urlparse

from services.apify_service import _run_actor_and_fetch

# Actor IDs (~ separator for Apify REST API)
LEADS_FINDER_ACTOR   = "code_crafter~leads-finder"
EMAIL_VERIFIER_ACTOR = "account56~email-verifier"

# Seniority levels to INCLUDE (entry and trainee are excluded per user spec)
ALLOWED_SENIORITY = {
    "founder", "owner", "c_suite", "c-suite", "csuite",
    "director", "vp", "head", "manager", "senior",
}

# Exact exclusions to double-check (actor may return these strings)
EXCLUDED_SENIORITY = {"entry", "trainee", "partner"}


# Social / shared domains — querying these returns random people, not company employees
_SOCIAL_DOMAINS = {
    "linkedin.com", "facebook.com", "instagram.com", "twitter.com", "x.com",
    "youtube.com", "wa.me", "whatsapp.com", "t.me", "linktr.ee",
}


def _extract_domain(website: str) -> str:
    """Strip protocol/path — actor wants bare domain like 'acme.com'.
    Returns empty string for social/shared domains so callers fall back to company_name.
    """
    if not website:
        return ""
    try:
        parsed = urlparse(website if "://" in website else f"https://{website}")
        domain = parsed.netloc or parsed.path
        bare = domain.removeprefix("www.").split("/")[0].lower()
        # Reject social/shared domains — they return employees of the platform, not the company
        if bare in _SOCIAL_DOMAINS:
            return ""
        return bare
    except Exception:
        return ""


def _seniority_ok(level: str | None) -> bool:
    """Return True if the seniority level should be KEPT."""
    if not level:
        return True   # unknown = don't filter
    norm = level.lower().replace("-", "_").replace(" ", "_")
    if norm in EXCLUDED_SENIORITY:
        return False
    return True


async def _find_leads(domain: str, company_name: str, api_token: str) -> list[dict]:
    """Run code_crafter~leads-finder for the company domain."""
    payload: dict = {
        "fetch_count": 5,
        "email_status": ["validated"],
        # Exact enum keys required by the actor (confirmed via API error message)
        # Excluded: entry, trainee, partner
        "seniority_level": [
            "founder", "owner", "c_suite",
            "director", "vp", "head", "manager", "senior",
        ],
    }
    if domain:
        payload["company_domain"] = [domain]
        # Also pass company_name for extra specificity when domain is available
        if company_name:
            payload["company_name"] = [company_name]
    elif company_name:
        # No valid domain (or social domain) — search purely by company name
        payload["company_name"] = [company_name]
    else:
        # Absolute fallback: job title filter only (very broad — last resort)
        payload["contact_job_title"] = ["CEO", "Founder", "Owner", "Director", "Manager"]

    try:
        items = await _run_actor_and_fetch(
            LEADS_FINDER_ACTOR,
            payload,
            api_token,
            timeout_seconds=300,
        )
        return items or []
    except Exception as e:
        raise RuntimeError(f"Leads Finder actor failed: {e}")



async def _verify_emails(emails: list[str], api_token: str) -> set[str]:
    """
    Run account56~email-verifier on the given email list.
    Returns a set of email addresses where result == 'ok' OR subresult == 'ok'.
    """
    if not emails:
        return set()

    payload = {"emails": emails}
    try:
        results = await _run_actor_and_fetch(
            EMAIL_VERIFIER_ACTOR,
            payload,
            api_token,
            timeout_seconds=180,
        )
    except Exception:
        # If verifier fails, be conservative — return empty set
        return set()

    verified: set[str] = set()
    for item in results:
        email    = (item.get("email") or "").strip().lower()
        result   = (item.get("result") or "").strip().lower()
        subresult = (item.get("subresult") or "").strip().lower()
        if email and (result == "ok" or subresult == "ok"):
            verified.add(email)
    return verified


def _parse_contact(item: dict) -> dict:
    """Map leads-finder output fields to our internal contact schema."""
    return {
        "full_name":       item.get("full_name"),
        "name":            item.get("full_name"),
        "job_title":       item.get("job_title"),
        "title":           item.get("job_title"),
        "headline":        item.get("headline"),
        "seniority_level": item.get("seniority_level"),
        "industry":        item.get("industry"),
        "linkedin_url":    item.get("linkedin"),
        "email":           item.get("email"),
        "personal_email":  item.get("personal_email"),
        "phone":           item.get("mobile_number"),
        "source":          "apify_leads",
    }


async def find_poc_apify(lead, api_token: str) -> list[dict]:
    """
    Full pipeline:
      1. Find leads via code_crafter~leads-finder
      2. Filter by allowed seniority
      3. Verify emails via account56~email-verifier
      4. Return only contacts with at least one verified email
    """
    domain = _extract_domain(lead.website or "")
    raw_items = await _find_leads(domain, lead.business_name, api_token)

    # Filter by seniority
    filtered = [
        item for item in raw_items
        if _seniority_ok(item.get("seniority_level"))
    ]

    # Collect all emails to verify
    emails_to_verify: list[str] = []
    for item in filtered:
        for field in ("email", "personal_email"):
            val = (item.get(field) or "").strip()
            if val and "@" in val:
                emails_to_verify.append(val)

    # Verify emails
    verified_emails = await _verify_emails(list(set(emails_to_verify)), api_token)

    # Build contact list — only keep contacts that have ≥1 verified email
    contacts: list[dict] = []
    for item in filtered:
        work_email     = (item.get("email") or "").strip().lower()
        personal_email = (item.get("personal_email") or "").strip().lower()

        has_verified_work     = work_email     in verified_emails if work_email     else False
        has_verified_personal = personal_email in verified_emails if personal_email else False

        if not (has_verified_work or has_verified_personal):
            continue   # skip contacts with no verified email

        contact = _parse_contact(item)
        # Only expose verified emails
        if not has_verified_work:
            contact["email"] = None
        if not has_verified_personal:
            contact["personal_email"] = None
        contacts.append(contact)

    return contacts
