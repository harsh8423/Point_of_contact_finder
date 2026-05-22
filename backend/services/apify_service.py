"""
Apify service — wraps two actors:

  1. santamaria-automations/google-maps-scraper  (Google Maps scraping)
  2. 6sigmag/fast-website-content-crawler        (website content crawling for AI qualification)
"""
import asyncio
import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from services.key_resolver import get_api_key

BASE_URL = "https://api.apify.com/v2"

# ─────────────────────────────────────────────────────────────
# INTERNAL HELPER — run any actor and return dataset items
# ─────────────────────────────────────────────────────────────

async def _run_actor_and_fetch(
    actor_id: str,
    payload: dict,
    api_token: str,
    timeout_seconds: int = 300,
) -> list[dict]:
    """Start an actor run, poll until done, return dataset items."""
    headers = {
        "Authorization": f"Bearer {api_token}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=timeout_seconds) as client:
        # Start
        resp = await client.post(
            f"{BASE_URL}/acts/{actor_id}/runs",
            headers=headers,
            json=payload,
        )
        resp.raise_for_status()
        run_id = resp.json()["data"]["id"]

        # Poll
        for _ in range(timeout_seconds // 3):
            status_resp = await client.get(
                f"{BASE_URL}/actor-runs/{run_id}",
                headers=headers,
            )
            status_resp.raise_for_status()
            status = status_resp.json()["data"]["status"]
            if status == "SUCCEEDED":
                break
            if status in ("FAILED", "ABORTED", "TIMED-OUT"):
                raise RuntimeError(f"Apify actor '{actor_id}' ended with status: {status}")
            await asyncio.sleep(3)
        else:
            raise RuntimeError(f"Apify actor '{actor_id}' timed out after {timeout_seconds}s")

        # Fetch dataset
        items_resp = await client.get(
            f"{BASE_URL}/actor-runs/{run_id}/dataset/items",
            headers=headers,
            params={"format": "json"},
        )
        items_resp.raise_for_status()
        return items_resp.json()


# ─────────────────────────────────────────────────────────────
# 1. GOOGLE MAPS SCRAPER
#    Actor: santamaria-automations/google-maps-scraper
# ─────────────────────────────────────────────────────────────

MAPS_ACTOR = "santamaria-automations~google-maps-scraper"


def parse_maps_result(item: dict) -> dict:
    """
    Map santamaria-automations/google-maps-scraper output fields
    to our internal Lead schema.

    Actor fields we care about:
      title, category, address, phone, website,
      review_rating, review_count, link
    """
    return {
        "business_name": item.get("title") or "Unknown",
        "address":       item.get("address"),
        "phone":         item.get("phone"),
        "website":       item.get("website"),
        "rating":        item.get("review_rating"),
        "review_count":  item.get("review_count"),
        "category":      item.get("category"),
        "maps_url":      item.get("link"),
    }


async def run_maps_scrape(
    query: str,
    max_results: int,
    db: AsyncSession,
) -> list[dict]:
    """Scrape Google Maps using santamaria-automations/google-maps-scraper."""
    api_token = await get_api_key(db, "APIFY_API_TOKEN", "APIFY_API_TOKEN")
    if not api_token:
        raise ValueError("Apify API token is not configured. Please add it in Settings.")

    payload = {
        "searchStrings": [query],
        "maxResults": max_results,
        "language": "en",
    }

    raw_items = await _run_actor_and_fetch(MAPS_ACTOR, payload, api_token)
    return raw_items


# ─────────────────────────────────────────────────────────────
# 2. WEBSITE CONTENT CRAWLER
#    Actor: 6sigmag/fast-website-content-crawler
# ─────────────────────────────────────────────────────────────

CRAWLER_ACTOR = "6sigmag~fast-website-content-crawler"


async def crawl_website_content(
    website_url: str,
    api_token: str,
    max_chars: int = 8000,
) -> str | None:
    """
    Crawl a business website and return its text content (truncated).
    Returns None on any failure so callers can gracefully fall back.

    Actor input schema (6sigmag/fast-website-content-crawler):
      {
        "urls": ["https://example.com"],
        "maxPagesPerDomain": 3,
        "maxConcurrency": 1
      }
    """
    # Normalise URL
    url = website_url.strip()
    if not url.startswith("http"):
        url = f"https://{url}"

    try:
        payload = {
            "urls": [url],
            "maxPagesPerDomain": 3,   # crawl home + about + contact pages
            "maxConcurrency": 1,
        }
        items = await _run_actor_and_fetch(
            CRAWLER_ACTOR,
            payload,
            api_token,
            timeout_seconds=120,   # website crawl is faster
        )
        if not items:
            return None

        # Concatenate text from all crawled pages
        parts = []
        for item in items:
            text = (
                item.get("text")
                or item.get("content")
                or item.get("markdown")
                or ""
            )
            if text:
                parts.append(text.strip())

        combined = "\n\n".join(parts)
        return combined[:max_chars] if combined else None

    except Exception:
        return None   # silent failure — caller will use web search fallback
