"""
Lead qualification service.

Architecture:
  Path A — lead has a website:
    Crawl with Apify fast-website-content-crawler → pass content to OpenAI
    (gpt-4o, NO web_search tool → standard token charges only)

  Path B — no website OR crawl returned nothing:
    OpenAI analyses the lead purely from its stored fields
    (name, address, category, phone) — still NO web_search tool.

The web_search_preview tool is NEVER used. Only standard OpenAI
token charges apply regardless of path taken.
"""
import json
import httpx
from urllib.parse import urlparse
from sqlalchemy.ext.asyncio import AsyncSession

from services.key_resolver import get_api_key


# ─────────────────────────────────────────────────────────────
# HELPERS — website validation
# ─────────────────────────────────────────────────────────────

_SOCIAL_HOSTS = {
    "linkedin.com", "facebook.com", "instagram.com",
    "twitter.com", "x.com", "youtube.com",
}


def _is_social_url(url: str) -> bool:
    """Return True if the URL points to a social media platform (skip crawling)."""
    try:
        host = urlparse(url).netloc.lower().removeprefix("www.")
        return any(host == s or host.endswith("." + s) for s in _SOCIAL_HOSTS)
    except Exception:
        return False


# ─────────────────────────────────────────────────────────────
# PROMPT BUILDERS
# ─────────────────────────────────────────────────────────────

def _base_lead_context(lead) -> str:
    parts = [
        f"Business name: {lead.business_name}",
        f"Address:  {lead.address or 'not available'}",
        f"Phone:    {getattr(lead, 'phone', None) or 'not available'}",
        f"Website:  {lead.website or 'not available'}",
        f"Category: {lead.category or 'unknown'}",
        f"Rating:   {getattr(lead, 'rating', None) or 'unknown'}",
        f"Reviews:  {getattr(lead, 'review_count', None) or 'unknown'}",
    ]
    return "\n".join(parts)


RESPONSE_FORMAT_INSTRUCTION = """
Return your response as raw JSON (no markdown fences) with EXACTLY these fields:
{
  "summary": "2-3 sentence description of what this business does",
  "size": "estimated size e.g. '10-50 employees' or 'single location'",
  "score": 7,
  "reasoning": "why this score based on the available information",
  "contacts_found": [
    { "name": "...", "title": "...", "email": "...", "source": "website" }
  ],
  "recent_news": "any notable info found, or null"
}
Score from 1-10: 1-3 = low potential, 4-6 = moderate, 7-10 = high potential.
"""


def _prompt_with_content(lead, website_content: str) -> str:
    return f"""Qualify this business lead using the website content provided below.

{_base_lead_context(lead)}

--- WEBSITE CONTENT ---
{website_content}
--- END CONTENT ---

Based on the above content, analyse the business and provide a lead qualification report.
{RESPONSE_FORMAT_INSTRUCTION}"""


def _prompt_from_data_only(lead) -> str:
    """
    Used when no website content is available.
    Instructs OpenAI to reason from known fields only — NO web search needed.
    """
    return f"""Qualify this business lead based solely on the information provided below.
Do NOT search the web. Use only the data given to estimate quality and potential.

{_base_lead_context(lead)}

Based only on the above details, provide your best assessment:
- What type of business this likely is
- Estimated size and market potential
- Lead quality score
{RESPONSE_FORMAT_INSTRUCTION}"""


def _prompt_with_web_search(lead) -> str:
    """
    Used for depth="deep" — paired with web_search_preview tool.
    Asks OpenAI to actively research the company online.
    """
    return f"""Research this business online and provide a detailed lead qualification report.

{_base_lead_context(lead)}

Search the web to find:
- What this business does and its market position
- Estimated company size, headcount, and revenue range
- Decision maker or owner names, titles, and emails if publicly available
- Recent news, funding, expansions, or notable activity
- Any LinkedIn or social media presence
{RESPONSE_FORMAT_INSTRUCTION}"""



# ─────────────────────────────────────────────────────────────
# OPENAI CALLER
# ─────────────────────────────────────────────────────────────

async def _call_openai(
    prompt: str,
    api_key: str,
    use_web_search: bool = False,
) -> str:
    """Call OpenAI Responses API.
    use_web_search=True attaches web_search_preview (charged); False = tokens only.
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload: dict = {
        "model": "gpt-4o",
        "input": prompt,
        # No "tools" key — web_search_preview is intentionally omitted
    }
    if use_web_search:
        payload["tools"] = [{"type": "web_search_preview"}]

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            "https://api.openai.com/v1/responses",
            headers=headers,
            json=payload,
        )
        if not resp.is_success:
            raise RuntimeError(
                f"OpenAI API error {resp.status_code}: {resp.text[:300]}"
            )
        data = resp.json()

    # Extract text from Responses API output blocks
    for block in data.get("output", []):
        if block.get("type") == "message":
            for content in block.get("content", []):
                if content.get("type") == "output_text":
                    return content.get("text", "")
    return ""


# ─────────────────────────────────────────────────────────────
# JSON PARSER
# ─────────────────────────────────────────────────────────────

def _parse_json_response(raw_text: str) -> dict:
    """Parse JSON from OpenAI output, stripping markdown fences if present."""
    try:
        clean = raw_text.strip()
        if "```" in clean:
            for part in clean.split("```"):
                part = part.strip()
                if part.startswith("json"):
                    part = part[4:].strip()
                if part.startswith("{"):
                    clean = part
                    break
        return json.loads(clean)
    except (json.JSONDecodeError, IndexError):
        return {
            "summary": raw_text or "Could not parse qualification response.",
            "size": None,
            "score": None,
            "reasoning": None,
            "contacts_found": [],
            "recent_news": None,
        }


# ─────────────────────────────────────────────────────────────
# MAIN ENTRY POINT
# ─────────────────────────────────────────────────────────────

async def qualify_lead(lead, db: AsyncSession, depth: str = "normal") -> dict:
    """
    Qualify a lead.

    depth="normal" (default — no extra charges):
      Path A: lead has website → Apify crawls it → content fed to GPT-4o
      Path B: no website / crawl fails → GPT-4o reasons from stored fields only

    depth="deep" (web_search charges apply):
      Uses OpenAI web_search_preview tool to research the company live online.
      Falls back gracefully to normal if the tool call fails.
    """
    openai_key = await get_api_key(db, "OPENAI_API_KEY", "OPENAI_API_KEY")
    if not openai_key:
        raise ValueError("OpenAI API key is not configured. Please add it in Settings.")

    # ── DEEP path: live web search ────────────────────────────
    if depth == "deep":
        prompt = _prompt_with_web_search(lead)   # reintroduced for deep mode
        raw_text = await _call_openai(prompt, openai_key, use_web_search=True)
        result = _parse_json_response(raw_text)
        result["raw_response"] = raw_text
        result["qualification_source"] = "web_search_deep"
        return result

    # ── NORMAL path ───────────────────────────────────────────
    website_content: str | None = None
    qualification_source = "data_only"

    # Skip crawling social media profile URLs (linkedin.com, facebook.com, etc.)
    # — they return the platform's content, not the company's own website
    if lead.website and not _is_social_url(lead.website):
        try:
            from services.apify_service import crawl_website_content
            apify_token = await get_api_key(db, "APIFY_API_TOKEN", "APIFY_API_TOKEN")
            if apify_token:
                website_content = await crawl_website_content(lead.website, apify_token)
                if website_content:
                    qualification_source = "website_crawl"
        except Exception:
            website_content = None

    prompt = _prompt_with_content(lead, website_content) if website_content else _prompt_from_data_only(lead)
    raw_text = await _call_openai(prompt, openai_key, use_web_search=False)

    result = _parse_json_response(raw_text)
    result["raw_response"] = raw_text
    result["qualification_source"] = qualification_source
    return result
