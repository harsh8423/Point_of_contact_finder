"""
Web-crawl POC finder — third contact discovery option.

Crawls the company's own website using aiohttp (fast path) with an
optional Playwright fallback for JS-heavy sites.  No external APIs
needed — cheapest option.

Entry point:
    contacts = await find_poc_web_crawl(lead)

Returns a list of dicts matching the platform Contact schema:
    { name, title, email, linkedin_url, phone, source }
"""

import asyncio
import random
import re
import logging
from urllib.parse import urlparse, urljoin

import aiohttp
from bs4 import BeautifulSoup

# ── re-use the heavy extraction logic from crawl_contacts ──────────────────
from services.crawl_contacts import (
    extract_contacts,
    extract_internal_links,
    strip_head,
    score_url,
    LINKEDIN_RE,
    REQUEST_HEADERS,
    USER_AGENTS,
)

log = logging.getLogger(__name__)

# ── tunables ───────────────────────────────────────────────────────────────
CONNECT_TIMEOUT   = 10
READ_TIMEOUT      = 20
MAX_BODY_BYTES    = 1_500_000
MAX_REDIRECTS     = 3
MAX_PAGES         = 5          # homepage + up to 4 sub-pages
PW_CONTENT_FLOOR  = 1_500      # chars — below this triggers Playwright
SOURCE_TAG        = "web_crawl"

# ── low-level HTTP fetch ───────────────────────────────────────────────────

async def _fetch(session: aiohttp.ClientSession, url: str) -> str | None:
    headers = {**REQUEST_HEADERS, "User-Agent": random.choice(USER_AGENTS)}
    try:
        async with session.get(
            url, headers=headers, allow_redirects=True,
            max_redirects=MAX_REDIRECTS, ssl=False,
        ) as resp:
            ct = resp.headers.get("Content-Type", "")
            if resp.status == 200 and "html" in ct.lower():
                raw = b""
                async for chunk in resp.content.iter_chunked(8192):
                    raw += chunk
                    if len(raw) >= MAX_BODY_BYTES:
                        break
                return strip_head(raw.decode("utf-8", errors="ignore"))
    except asyncio.TimeoutError:
        pass
    except aiohttp.ClientSSLError:
        # retry over plain HTTP
        try:
            http_url = url.replace("https://", "http://", 1)
            async with session.get(
                http_url, headers=headers, allow_redirects=True,
                max_redirects=MAX_REDIRECTS, ssl=False,
            ) as resp:
                ct = resp.headers.get("Content-Type", "")
                if resp.status == 200 and "html" in ct.lower():
                    raw = b""
                    async for chunk in resp.content.iter_chunked(8192):
                        raw += chunk
                        if len(raw) >= MAX_BODY_BYTES:
                            break
                    return strip_head(raw.decode("utf-8", errors="ignore"))
        except Exception:
            pass
    except Exception:
        pass
    return None


# ── optional Playwright fallback ───────────────────────────────────────────

async def _fetch_playwright(url: str) -> str | None:
    """Render JS-heavy page with Playwright. Returns None if not installed."""
    try:
        from playwright.async_api import async_playwright  # type: ignore
    except ImportError:
        return None
    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            page = await browser.new_page()
            await page.set_extra_http_headers(
                {"User-Agent": random.choice(USER_AGENTS)}
            )
            await page.goto(url, timeout=25_000, wait_until="domcontentloaded")
            await page.wait_for_timeout(2000)
            html = await page.content()
            await browser.close()
            return strip_head(html)
    except Exception as exc:
        log.debug("Playwright fetch failed for %s: %s", url, exc)
        return None


# ── normalise URL ──────────────────────────────────────────────────────────

def _normalise_url(raw: str) -> str:
    raw = raw.strip()
    if not raw.startswith("http"):
        raw = "https://" + raw
    return raw.rstrip("/")


# ── map extraction output → platform Contact schema ───────────────────────

def _to_contacts(
    raw_contacts: list[dict],
    raw_employees: list[dict],
    domain: str,
) -> list[dict]:
    results: list[dict] = []
    seen: set[str] = set()

    def _dedup_key(d: dict) -> str:
        return (d.get("email") or d.get("phone") or d.get("name") or "").lower()

    # employees first — they have name + title
    for emp in raw_employees:
        linkedin = emp.get("linkedin") or ""
        # prefer personal linkedin profile over company page
        if linkedin and "/company/" in linkedin:
            linkedin = ""
        entry = {
            "name":         emp.get("name"),
            "title":        emp.get("title"),
            "email":        emp.get("email"),
            "linkedin_url": linkedin or None,
            "phone":        emp.get("phone"),
            "source":       SOURCE_TAG,
        }
        k = _dedup_key(entry)
        if k and k not in seen:
            seen.add(k)
            results.append(entry)

    # generic contacts (emails / phones / social found on page)
    email_map:    dict[str, str] = {}
    phone_map:    dict[str, str] = {}
    linkedin_map: dict[str, str] = {}

    for c in raw_contacts:
        etype = c.get("entity_type", "")
        val   = c.get("value", "")
        if etype == "email":
            email_map.setdefault(val.lower(), val)
        elif etype == "phone":
            phone_map.setdefault(val, val)
        elif etype in ("linkedin_profile", "linkedin_company"):
            linkedin_map.setdefault(val, val)

    # create a single generic contact per unique email
    for email in email_map.values():
        k = email.lower()
        if k not in seen:
            seen.add(k)
            results.append({
                "name":         None,
                "title":        None,
                "email":        email,
                "linkedin_url": None,
                "phone":        None,
                "source":       SOURCE_TAG,
            })

    # standalone phones not already on an employee
    for phone in list(phone_map.values())[:3]:
        k = phone
        if k not in seen:
            seen.add(k)
            results.append({
                "name":         None,
                "title":        None,
                "email":        None,
                "linkedin_url": None,
                "phone":        phone,
                "source":       SOURCE_TAG,
            })

    # standalone LinkedIn profiles
    for lnk in list(linkedin_map.values())[:2]:
        k = lnk.lower()
        if k not in seen:
            seen.add(k)
            results.append({
                "name":         None,
                "title":        None,
                "email":        None,
                "linkedin_url": lnk,
                "phone":        None,
                "source":       SOURCE_TAG,
            })

    return results


# ── main entry point ───────────────────────────────────────────────────────

async def find_poc_web_crawl(lead) -> list[dict]:
    """
    Crawl the lead's website and return POC contacts.

    Strategy:
      1. Fetch homepage with aiohttp
      2. If content is too thin (JS-rendered), retry with Playwright
      3. Crawl up to MAX_PAGES-1 high-scoring sub-pages (contact/team/about)
      4. Follow individual profile pages for missing employee contacts
    """
    if not lead.website:
        return []

    homepage_url = _normalise_url(lead.website)
    domain       = urlparse(homepage_url).netloc

    timeout = aiohttp.ClientTimeout(
        connect=CONNECT_TIMEOUT, sock_read=READ_TIMEOUT,
        total=CONNECT_TIMEOUT + READ_TIMEOUT + 10,
    )
    connector = aiohttp.TCPConnector(limit=8, ssl=False)

    # accumulated state
    all_raw_contacts: list[dict] = []
    employee_map:     dict[str, dict] = {}
    seen_contact_keys: set[tuple]     = set()
    seen_page_urls:    set[str]       = set()
    all_profile_links: list[tuple]    = []

    def _merge_contacts(raw_c: list[dict]) -> None:
        for c in raw_c:
            k = (c.get("entity_type", ""), (c.get("value") or "").lower())
            if k[1] and k not in seen_contact_keys:
                seen_contact_keys.add(k)
                all_raw_contacts.append(c)

    def _merge_employees(raw_e: list[dict]) -> None:
        for e in raw_e:
            key = (e.get("name") or "").lower()
            if not key:
                continue
            if key not in employee_map:
                employee_map[key] = dict(e)
            else:
                ex = employee_map[key]
                for field in ("email", "phone", "linkedin", "title"):
                    if not ex.get(field) and e.get(field):
                        ex[field] = e[field]

    def _collect_profiles(links: list[tuple]) -> None:
        for item in links:
            url = item[3]
            if url not in seen_page_urls:
                seen_page_urls.add(url)
                all_profile_links.append(item)

    loop = asyncio.get_running_loop()

    async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:

        # ── Step 1: homepage ────────────────────────────────────────────
        html = await _fetch(session, homepage_url)

        # Playwright fallback for JS-heavy pages
        if html is None or len(html) < PW_CONTENT_FLOOR:
            pw_html = await _fetch_playwright(homepage_url)
            if pw_html and len(pw_html) > len(html or ""):
                html = pw_html
                log.info("web_crawl: used Playwright for %s", homepage_url)

        if not html:
            log.warning("web_crawl: could not fetch %s", homepage_url)
            return []

        seen_page_urls.add(homepage_url)
        raw_c, raw_e, _addr, p_links = await loop.run_in_executor(
            None, extract_contacts, html, homepage_url, domain
        )
        _merge_contacts(raw_c)
        _merge_employees(raw_e)
        _collect_profiles(p_links)

        # ── Step 2: scored sub-pages ────────────────────────────────────
        scored_links = await loop.run_in_executor(
            None, extract_internal_links, html, homepage_url
        )
        for _score, sub_url in scored_links[: MAX_PAGES - 1]:
            if sub_url in seen_page_urls:
                continue
            seen_page_urls.add(sub_url)

            sub_html = await _fetch(session, sub_url)
            if not sub_html or len(sub_html) < PW_CONTENT_FLOOR:
                pw_html = await _fetch_playwright(sub_url)
                if pw_html and len(pw_html) > len(sub_html or ""):
                    sub_html = pw_html

            if not sub_html:
                continue

            raw_c, raw_e, _addr, p_links = await loop.run_in_executor(
                None, extract_contacts, sub_html, sub_url, domain
            )
            _merge_contacts(raw_c)
            _merge_employees(raw_e)
            _collect_profiles(p_links)

        # ── Step 3: profile pages for employees still missing email/phone
        from services.crawl_contacts import extract_profile_contacts
        for emp_name, _title, _linkedin, prof_url in all_profile_links[:8]:
            emp = employee_map.get(emp_name.lower())
            if emp and emp.get("email") and emp.get("phone"):
                continue
            if prof_url in seen_page_urls:
                continue
            seen_page_urls.add(prof_url)

            prof_html = await _fetch(session, prof_url)
            if not prof_html:
                continue

            found_email, found_phone = await loop.run_in_executor(
                None, extract_profile_contacts, prof_html
            )
            if emp:
                if not emp.get("email") and found_email:
                    emp["email"] = found_email
                if not emp.get("phone") and found_phone:
                    emp["phone"] = found_phone

    employees_list = list(employee_map.values())
    contacts = _to_contacts(all_raw_contacts, employees_list, domain)
    log.info(
        "web_crawl: %s → %d contacts from %d pages",
        domain, len(contacts), len(seen_page_urls),
    )
    return contacts
