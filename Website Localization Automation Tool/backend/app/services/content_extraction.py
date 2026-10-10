"""Extract translatable content segments from a page's HTML.

Extracted element types: title, meta description, h1, h2, h3, p, button, a, li,
and image alt text. Excluded: script, style, code, pre, technical identifiers,
and (translated later) URLs/brand names are preserved at translation time.

Each segment carries a CSS selector + source-hash so the runtime can reliably
re-locate the element when localizing the page.
"""
from __future__ import annotations

from typing import List, Tuple, Optional
from bs4 import BeautifulSoup, NavigableString, Comment, Doctype
from ..utils import hash_text, word_count

# Tags whose visible text is translatable
TRANSLATABLE_TAGS = {"h1", "h2", "h3", "p", "button", "a", "li", "span", "div", "title"}
EXCLUDE_SUBTREE_TAGS = {"script", "style", "code", "pre", "textarea", "noscript", "svg", "head"}
# Anchor text that is purely a URL is skipped
from urllib.parse import urlparse


def extract_segments(html: str) -> List[dict]:
    """Return a list of segment dicts for a page.

    Each dict: {source_text, element_type, element_selector, source_hash}
    """
    if not html:
        return []
    try:
        soup = BeautifulSoup(html, "html.parser")
    except Exception:
        return []
    segments: List[dict] = []

    # Title
    title = soup.find("title")
    if title and title.get_text(strip=True):
        segments.append(_seg(str(title.get_text(strip=True)), "title", css_path(title)))

    # Meta description
    md = soup.find("meta", attrs={"name": _meta_name_eq})
    if not md:
        md = soup.find("meta", attrs={"name": lambda v: v and v.lower() == "description"})
    if md and md.get("content"):
        segments.append(_seg(str(md["content"].strip()), "meta_description", 'meta[name="description"]'))

    # img alt texts
    for img in soup.find_all("img"):
        alt = img.get("alt")
        if alt and alt.strip():
            segments.append(_seg(str(alt.strip()), "img-alt", css_path(img)))

    # body text nodes in translatable containers
    for tag in soup.find_all(TRANSLATABLE_TAGS):
        parent_excluded = any(tag.find_parent(p) is not None for p in soup.find_all(EXCLUDE_SUBTREE_TAGS))
        if parent_excluded:
            continue
        text = tag.get_text(separator=" ", strip=True)
        if not text:
            continue
        # skip pure-URL anchor text
        if tag.name == "a":
            if _is_pure_url(text):
                continue
            # skip nav-ish single-word links? keep them; translator handles short text.
        # skip very long paragraphs split across headings? keep simple
        sel = css_path(tag)
        # dedupe by (selector, text)
        segments.append(_seg(text, tag.name, sel))

    # dedupe identical segments by (source_hash, selector)
    seen = set()
    out = []
    for s in segments:
        key = (s["source_hash"], s["element_selector"])
        if key in seen:
            continue
        seen.add(key)
        out.append(s)
    return out


def _seg(text: str, element_type: str, selector: str) -> dict:
    return {
        "source_text": text,
        "element_type": element_type,
        "element_selector": selector,
        "source_hash": hash_text(text),
    }


def _is_pure_url(text: str) -> bool:
    try:
        p = urlparse(text.strip())
        return bool(p.scheme in ("http", "https") and p.netloc)
    except Exception:
        return False


def _meta_name_eq(v):
    return v and v.lower() == "description"


def css_path(tag) -> str:
    """Build a CSS selector path for a BeautifulSoup tag, stable within a page."""
    parts: List[str] = []
    cur = tag
    while cur and cur.name:
        if cur.name in ("html", "[document]"):
            parts.append(cur.name)
            break
        nth = _nth_of_type(cur)
        sel = cur.name if not cur.get("id") else f"{cur.name}#{cur['id']}"
        if nth and not cur.get("id"):
            sel = f"{cur.name}:nth-of-type({nth})"
        parts.append(sel)
        cur = cur.parent
    parts.reverse()
    return " > ".join(parts) if parts else tag.name or "*"


def _nth_of_type(tag) -> int:
    """Return 1-based position among siblings of the same tag name.

    Returns 0 when the element is the only one of its type under its parent
    (and has no ID), meaning the bare tag name already uniquely identifies it.
    Robust against NavigableString parents and non-Tag siblings.
    """
    parent = getattr(tag, "parent", None)
    if parent is None:
        return 0
    # Collect only child Tags with the same name
    same_type_children = [
        c for c in getattr(parent, "children", []) or []
        if getattr(c, "name", None) == tag.name
    ]
    if len(same_type_children) <= 1 and not tag.get("id"):
        return 0  # only child of this type; bare tag name suffices
    # Find the 1-based position of this tag among its same-type siblings
    idx = 0
    for c in getattr(parent, "children", []) or []:
        if getattr(c, "name", None) == tag.name:
            idx += 1
            if c is tag:
                return idx
    return 0
