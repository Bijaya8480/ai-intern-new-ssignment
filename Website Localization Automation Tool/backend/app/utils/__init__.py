"""Utility helpers: hashing, URL normalization, language detection, word count."""
from __future__ import annotations

import re
from typing import Optional
from urllib.parse import urljoin, urlparse, urldefrag, urlunparse

from langdetect import DetectorFactory, detect
from langdetect.lang_detect_exception import LangDetectException

DetectorFactory.seed = 0  # deterministic language detection


def _normalize_for_hash(text: str) -> str:
    """Lowercase + collapse internal whitespace + trim. Shared normalization
    with the JavaScript runtime so hashes are cross-language identical."""
    return " ".join((text or "").lower().split())


def hash_text(text: str) -> str:
    """Stable djb2 hash of normalized text (lowercased + whitespace-collapsed).

    This algorithm is replicated identically in publisher/loc.js (function
    ``hashCode``) so the browser runtime can verify that a DOM node still
    contains the expected source text before replacing it.
    """
    normalized = _normalize_for_hash(text)
    h = 0
    for ch in normalized:
        h = ((h << 5) - h + ord(ch)) & 0xFFFFFFFF
    # Convert to signed 32-bit (JavaScript ``| 0`` semantics)
    if h >= 0x80000000:
        h -= 0x100000000
    return f"{h}_{len(normalized)}"


def normalize_url(url: str, base: Optional[str] = None) -> str:
    """Normalize a URL: resolve against base, strip fragment, lowercase host.

    Returns an empty string if the URL cannot be parsed.
    """
    if not url:
        return ""
    try:
        joined = urljoin(base or url, url) if base else url
        parsed = urlparse(joined)
        # Lowercase scheme + host, drop fragment, drop default ports
        scheme = parsed.scheme.lower()
        netloc = parsed.netloc.lower()
        # strip default port
        if ":" in netloc:
            host, port = netloc.rsplit(":", 1)
            if (scheme == "http" and port == "80") or (scheme == "https" and port == "443"):
                netloc = host
        path = parsed.path or "/"
        if not path.startswith("/"):
            path = "/" + path
        # collapse duplicate slashes (keep protocol-relative off)
        path = re.sub(r"/+", "/", path)
        query = parsed.query
        return urlunparse((scheme, netloc, path, "", query, ""))
    except Exception:
        return ""


def is_internal_url(url: str, base_url: str) -> bool:
    """True if `url` (resolved against base_url) is on the same domain."""
    norm = normalize_url(url, base_url)
    if not norm:
        return False
    base_norm = normalize_url(base_url)
    try:
        u = urlparse(norm)
        b = urlparse(base_norm)
    except Exception:
        return False
    return u.scheme in ("http", "https") and u.netloc == b.netloc


def detect_language(text: str) -> Optional[str]:
    """Best-effort language detection. Returns ISO code or None."""
    if not text or not text.strip():
        return None
    sample = text.strip()[:5000]
    try:
        return detect(sample)
    except LangDetectException:
        return None
    except Exception:
        return None


def word_count(text: str) -> int:
    if not text:
        return 0
    return len(re.findall(r"\S+", text))


def strip_fragment(url: str) -> str:
    return urldefrag(url).url
