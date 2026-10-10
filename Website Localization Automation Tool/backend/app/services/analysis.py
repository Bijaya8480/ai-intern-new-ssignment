"""Light heuristic classification of a page's content type.

Categories: Marketing, Product, Blog Post, Documentation, Pricing, Contact,
About, Legal, Other. Classification is intentionally simple (URL path + title +
first heading only, no ML), per the PRD.
"""
from __future__ import annotations

from typing import List
from urllib.parse import urlparse

# (path tokens) -> category, evaluated in order (first match wins).
PATTERNS = [
    (["about", "company", "our-story", "who-we-are", "mission"], "About"),
    (["contact", "support", "help", "reach-us", "get-in-touch"], "Contact"),
    (["pricing", "plans", "subscription", "subscribe", "pricing-plan"], "Pricing"),
    (["blog", "news", "articles", "posts", "insights", "story"], "Blog Post"),
    (["docs", "documentation", "wiki", "knowledge-base", "help-center"], "Documentation"),
    (["product", "products", "features", "feature", "solutions"], "Product Page"),
    (["legal", "terms", "privacy", "policy", "cookie", "gdpr", "license", "refund"], "Legal"),
    (["login", "signup", "register", "sign-up", "account", "cart", "checkout", "order"], "Marketing"),
]


def _match(text: str) -> str:
    t = text.lower()
    for keywords, category in PATTERNS:
        if any(kw in t for kw in keywords):
            return category
    return ""


def classify_content_type(url: str, title: str, headings: List[str]) -> str:
    path = urlparse(url).path.lower()
    # 1) URL path is the most authoritative signal
    if cat := _match(path):
        return cat
    # 2) Page title
    if title and (cat := _match(title)):
        return cat
    # 3) First (main) heading, as a weak tiebreaker only when it strongly indicates
    #    a category (starts with a keyword and is short), so a sentence like
    #    "Simple pricing for everyone" is not misclassified as a Pricing page.
    for h in headings or []:
        h = (h or "").strip()
        if not h:
            continue
        hl = h.lower()
        if len(h.split()) <= 4 and any(kw in hl and hl.startswith(kw) for kw in
                   ("about", "contact", "pricing", "blog", "docs", "documentation",
                    "legal", "terms", "privacy", "products", "login", "signup")):
            for keywords, category in PATTERNS:
                for kw in keywords:
                    if hl.startswith(kw):
                        return category
    return "Marketing Page"
