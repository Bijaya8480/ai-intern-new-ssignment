"""Website crawler.

Hybrid strategy:
  1. Lightweight HTTP fetch (requests + BeautifulSoup).
  2. If the rendered text is insufficient (suggesting a JS single-page app)
     AND Playwright is available, re-fetch with a headless browser.
  3. Gracefully degrades when Playwright/browser is unavailable.

Crawling runs in a background daemon thread so the HTTP request that starts it
returns immediately; progress is persisted to the CrawlJob row and polled by the
frontend. The same approach scales to Redis/Celery workers (see docs).
"""
from __future__ import annotations

import threading
import time
import logging
from collections import deque
from datetime import datetime
from html.parser import HTMLParser
from typing import List, Optional, Set, Deque, Dict, Any
from urllib.parse import urljoin, urlparse, urlsplit, urlunsplit
from urllib import robotparser

import requests
from bs4 import BeautifulSoup
from sqlalchemy.exc import IntegrityError

from ..config import settings
from ..utils import normalize_url, strip_fragment
from ..utils.crawler import UrlValidator, ValidationResult, BLOCKED_SCHEMES, ALLOWED_SCHEMES, NON_HTML_EXTENSIONS
from ..models import CrawlJob, Page, Project
from ..services.analysis import classify_content_type
from ..utils import detect_language, word_count, hash_text

log = logging.getLogger("loc_tool.crawler")

# Content types we consider "crawlable pages"
_HTML_CT = ("text/html",)

# Minimum visible text (words) expected from a page; below this we try Playwright
_JS_RENDER_TEXT_THRESHOLD = 30

# File extensions we never crawl as pages
_EXT_SKIP = NON_HTML_EXTENSIONS


def _has_js_bundle(soup: BeautifulSoup) -> bool:
    """Heuristic: page has script src referencing a .js bundle (possible SPA)."""
    for script in soup.find_all("script"):
        src = script.get("src") or ""
        if src and src.lower().endswith(".js"):
            return True
    return False


def _visible_text(soup: BeautifulSoup) -> str:
    """Extract visible text (script/style excluded)."""
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()
    return soup.get_text(separator=" ", strip=True)


class CrawlerService:
    """Crawl a project's website within domain + robots constraints."""

    def __init__(self):
        self._validator = UrlValidator(timeout=10, user_agent=settings.crawl_user_agent)
        self._playwright_available: Optional[bool] = None

    # ---- public API ------------------------------------------------------
    def validate_target(self, url: str) -> ValidationResult:
        res = self._validator.validate(url)
        if not res.valid:
            return res
        return self._validator.reachable(res.normalized)

    def start_crawl(self, project_id: str, db_session) -> CrawlJob:
        """Enqueue a crawl in a background thread. Returns the crawl job.

        If a crawl is already running/pending for this project, return the most
        recent active job instead of starting a duplicate (prevents concurrent
        crawls that race on page persistence).
        """
        from ..database import get_db_session

        project = db_session.get(Project, project_id)
        if not project:
            raise ValueError("Project not found")

        active = (
            db_session.query(CrawlJob)
            .filter(CrawlJob.project_id == project_id, CrawlJob.status.in_(["pending", "running"]))
            .order_by(CrawlJob.created_at.desc())
            .first()
        )
        if active:
            return active

        job = CrawlJob(project_id=project_id, status="running", started_at=datetime.utcnow())
        db_session.add(job)
        db_session.commit()
        db_session.refresh(job)
        job_id = job.id

        # Each background thread gets its own session.
        thread = threading.Thread(
            target=self._run_crawl, args=(job_id, project_id), daemon=True, name=f"crawl-{job_id[:8]}"
        )
        thread.start()
        log.info("Started crawl job %s for project %s", job_id, project_id)
        return job

    # ---- robots ----------------------------------------------------------
    def _fetch_robots(self, base_url: str):
        rp = robotparser.RobotFileParser()
        rp.set_url(urljoin(base_url, "/robots.txt"))
        rp.crawl_delay = settings.crawl_timeout / 1000.0
        try:
            rp.read()
        except Exception as exc:  # network error reading robots.txt => allow
            log.warning("Could not read robots.txt for %s: %s", base_url, exc)
            rp = None
        return rp

    def _robots_allowed(self, rp, url: str, user_agent: Optional[str] = None) -> bool:
        if rp is None:
            return True
        ua = user_agent or settings.crawl_user_agent
        return rp.can_fetch(ua, url)

    # ---- main crawl loop -------------------------------------------------
    def _run_crawl(self, job_id: str, project_id: str) -> None:
        from ..database import get_db_session

        db = get_db_session()
        try:
            job = db.get(CrawlJob, job_id)
            if not job:
                return
            project = db.get(Project, project_id)
            if not project:
                job.status = "failed"
                job.error = "Project not found"
                db.commit()
                return

            base_url = normalize_url(project.source_url)
            parsed = urlparse(base_url)
            base_host = parsed.netloc
            base_scheme = parsed.scheme or "https"

            rp = self._fetch_robots(base_url)

            queue: Deque = deque([(base_url, 0)])
            visited: Set[str] = set()
            discovered = 0
            crawled = 0
            failed = 0
            limit = settings.max_crawl_pages
            max_depth = settings.max_crawl_depth

            while queue:
                if len(visited) >= limit:
                    break
                url, depth = queue.popleft()
                norm = normalize_url(url, base_url)
                if not norm or norm in visited:
                    continue
                if depth > max_depth:
                    continue
                if len(visited) >= limit:
                    break

                visited.add(norm)
                discovered = max(discovered, len(visited))

                job.pages_discovered = discovered
                job.current_url = norm
                db.add(job)
                db.commit()

                # robots check
                if not self._robots_allowed(rp, norm):
                    self._record_page(db, project_id, norm, depth, http_status=0,
                                      crawl_status="failed", crawl_error="Blocked by robots.txt")
                    failed += 1
                    job.pages_failed = failed
                    continue

                page_data = self._crawl_page(norm, base_url)
                if page_data is None:
                    failed += 1
                    job.pages_failed = failed
                    continue

                if not page_data.get("ok"):
                    # Failed page (404/timeout/malformed): record as a Page with an issue.
                    self._save_page(db, project, norm, page_data)
                    failed += 1
                    job.pages_failed = failed
                    continue

                self._save_page(db, project, norm, page_data)
                crawled += 1
                job.pages_crawled = crawled
                job.total_pages = max(job.total_pages, crawled + failed)

                # extract internal links
                for link in page_data.get("links", []):
                    link_norm = normalize_url(link, base_url)
                    if link_norm and link_norm not in visited:
                        if self._is_internal(link_norm, base_host):
                            discovered = max(discovered, len(visited) + len(queue))
                            queue.append((link, depth + 1))

                # be polite
                time.sleep(0.2)

            job.pages_discovered = discovered
            job.total_pages = max(discovered, crawled + failed)
            job.status = "completed"
            job.finished_at = datetime.utcnow()
            if failed and crawled == 0:
                job.status = "failed"
                job.error = "All pages failed to crawl"
            db.add(job)
            db.commit()
        except Exception as exc:
            log.exception("Crawl failed for job %s", job_id)
            job = db.get(CrawlJob, job_id)
            if job:
                job.status = "failed"
                job.error = str(exc)[:500]
                job.finished_at = datetime.utcnow()
                db.add(job)
                db.commit()
        finally:
            db.close()

    # ---- single page crawl ----------------------------------------------
    def _crawl_page(self, url: str, base_url: str) -> Optional[Dict[str, Any]]:
        # 1) Lightweight fetch
        status, html, content_type = self._fetch_html(url)
        if html is None:
            return self._fail_record("Network error or timeout")
        # Record HTTP errors (404/5xx) as failed pages so broken internal links
        # are visible, even when the server returns non-HTML (e.g. JSON) errors.
        if status >= 400:
            return self._fail_record(f"HTTP {status}", http_status=status)
        if content_type and not _is_html(content_type):
            # non-HTML asset (PDF/image/etc): skip, do not record as a page
            return None

        soup = self._safe_soup(html)
        if soup is None:
            return self._fail_record("Malformed HTML")

        visible = _visible_text(soup)
        needs_browser = (word_count(visible) < _JS_RENDER_TEXT_THRESHOLD) and _has_js_bundle(soup)

        if needs_browser:
            browser_html = self._fetch_playwright(url)
            if browser_html:
                browser_soup = self._safe_soup(browser_html)
                if browser_soup:
                    browser_visible = _visible_text(browser_soup)
                    if word_count(browser_visible) >= word_count(visible):
                        soup = browser_soup
                        visible = browser_visible

        title = self._extract_title(soup) or ""
        headings = self._extract_headings(soup)
        links = self._extract_links(soup, base_url)
        lang = detect_language(visible) or None
        content_type_cat = classify_content_type(url, title, headings)

        return {
            "ok": True,
            "html": soup,
            "title": title,
            "text": visible,
            "word_count": word_count(visible),
            "detected_language": lang,
            "content_type": content_type_cat,
            "http_status": status,
            "links": links,
            "crawl_status": "crawled",
            "crawl_error": None,
        }

    def _fail_record(self, error: str, http_status: int = 0) -> Dict[str, Any]:
        return {
            "ok": False,
            "html": None,
            "title": "",
            "text": "",
            "word_count": 0,
            "detected_language": None,
            "content_type": "Other",
            "http_status": http_status,
            "links": [],
            "crawl_status": "failed",
            "crawl_error": error,
        }

    def _fetch_html(self, url: str):
        sess = requests.Session()
        sess.headers.update({"User-Agent": settings.crawl_user_agent, "Accept": "text/html"})
        try:
            resp = sess.get(url, timeout=settings.crawl_timeout / 1000.0, allow_redirects=True)
        except requests.RequestException as exc:
            log.warning("Fetch failed for %s: %s", url, exc)
            return 0, None, None
        ct = resp.headers.get("Content-Type", "")
        return resp.status_code, resp.text, ct

    def _fetch_playwright(self, url: str) -> Optional[str]:
        if self._playwright_available is False:
            return None
        try:
            from playwright.sync_api import sync_playwright
        except Exception:
            self._playwright_available = False
            return None
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(url, timeout=settings.crawl_timeout)
                page.wait_for_timeout(1500)
                html = page.content()
                browser.close()
                self._playwright_available = True
                return html
        except Exception as exc:
            log.warning("Playwright render failed for %s: %s", url, exc)
            self._playwright_available = False
            return None

    # ---- parsing helpers -------------------------------------------------
    def _safe_soup(self, html: str) -> Optional[BeautifulSoup]:
        try:
            return BeautifulSoup(html, "html.parser")
        except Exception as exc:
            log.warning("Soup parse error: %s", exc)
            return None

    def _extract_title(self, soup: BeautifulSoup) -> Optional[str]:
        t = soup.find("title")
        if t:
            return t.get_text(strip=True)
        h1 = soup.find("h1")
        if h1:
            return h1.get_text(strip=True)
        return None

    def _extract_headings(self, soup: BeautifulSoup) -> List[str]:
        return [h.get_text(strip=True) for h in soup.find_all(["h1", "h2", "h3"])]

    def _extract_links(self, soup: BeautifulSoup, base_url: str) -> List[str]:
        out: List[str] = []
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            if not href or href.startswith("#"):
                continue
            if any(href.lower().startswith(s) for s in ("javascript:", "mailto:", "tel:", "data:")):
                continue
            # skip fragment-only and non-http
            parsed = urlsplit(href)
            if parsed.scheme and parsed.scheme.lower() not in ALLOWED_SCHEMES:
                continue
            try:
                resolved = urljoin(base_url, href)
                out.append(resolved)
            except Exception:
                continue
        return out

    def _is_internal(self, norm_url: str, base_host: str) -> bool:
        try:
            host = urlparse(norm_url).netloc.lower()
        except Exception:
            return False
        return bool(host) and host == base_host.lower()

    # ---- persistence -----------------------------------------------------
    def _save_page(self, db, project: Project, url: str, page_data: Dict[str, Any]) -> None:
        normalized = normalize_url(url, project.source_url)
        # Deduplicate within project by normalized url
        existing = db.query(Page).filter(Page.project_id == project.id, Page.normalized_url == normalized).first()
        values = dict(
            project_id=project.id,
            url=url,
            normalized_url=normalized,
            title=page_data.get("title") or None,
            http_status=page_data.get("http_status"),
            word_count=page_data.get("word_count") or 0,
            detected_language=page_data.get("detected_language"),
            content_type=page_data.get("content_type") or "Other",
            crawl_status=page_data.get("crawl_status") or ("crawled" if page_data.get("ok") else "failed"),
            crawl_error=page_data.get("crawl_error"),
            last_crawled_at=datetime.utcnow(),
        )
        if existing:
            for k, v in values.items():
                setattr(existing, k, v)
            page = existing
            db.commit()
        else:
            page = Page(**values)
            db.add(page)
            try:
                db.commit()
                db.refresh(page)
            except IntegrityError:
                db.rollback()
                page = db.query(Page).filter(
                    Page.project_id == project.id, Page.normalized_url == normalized
                ).first()
                if page is None:
                    raise
                for k, v in values.items():
                    setattr(page, k, v)
        # persist raw html text for segment extraction (successful pages only)
        if page_data.get("html") is not None:
            page.raw_html = str(page_data["html"])
        db.commit()

    def _record_page(self, db, project_id: str, url: str, depth: int,
                     http_status: int, crawl_status: str, crawl_error: Optional[str]) -> None:
        normalized = normalize_url(url, "")
        existing = db.query(Page).filter(Page.project_id == project_id, Page.normalized_url == normalized).first()
        if existing:
            existing.crawl_status = crawl_status
            existing.crawl_error = crawl_error
            existing.http_status = http_status
            db.commit()
        else:
            page = Page(
                project_id=project_id,
                url=url,
                normalized_url=normalized,
                crawl_status=crawl_status,
                crawl_error=crawl_error,
                http_status=http_status,
            )
            db.add(page)
            db.commit()


def _is_html(content_type: str) -> bool:
    if not content_type:
        return True
    return "text/html" in content_type.lower()
