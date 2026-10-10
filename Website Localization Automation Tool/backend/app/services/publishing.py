"""Publishing helper: build the canonical JS snippet and inject it into the
sample-site so the one-click "test page" demonstration works.

The snippet uses the configured PUBLISHER_BASE_URL so production URLs are never
hardcoded. The sample site uses a relative ``/loc.js`` src (same-origin with the
backend) so it works regardless of the host.
"""
from __future__ import annotations

import os
import re

from ..config import settings
from ..models import Project

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SAMPLE_SITE_DIR = os.path.join(PROJECT_ROOT, "publisher", "sample-site")

_MARKER_START = "<!-- LOC_SNIPPET_START -->"
_MARKER_END = "<!-- LOC_SNIPPET_END -->"


def build_snippet(project_id: str, default_lang: str) -> str:
    return (
        f'<script src="{settings.publisher_base_url}/loc.js" '
        f'data-project="{project_id}" data-lang="{default_lang}"></script>'
    )


def sample_site_snippet(project_id: str, default_lang: str) -> str:
    # Relative src so the sample site (served by the same backend) resolves
    # loc.js from its own origin.
    return (
        f'<script src="/loc.js" data-project="{project_id}" data-lang="{default_lang}"></script>'
    )


def inject_into_sample_site(project_id: str, default_lang: str) -> None:
    """Inject the live snippet into every HTML file of the sample site.

    Idempotent: replaces anything between the LOC_SNIPPET markers. Files
    without the markers are left untouched.
    """
    if not os.path.isdir(SAMPLE_SITE_DIR):
        return
    snippet = sample_site_snippet(project_id, default_lang)
    pattern = re.compile(
        r"<!--\s*LOC_SNIPPET_START\s*-->.*?<!--\s*LOC_SNIPPET_END\s*-->",
        re.DOTALL,
    )
    replacement = f"{_MARKER_START}\n    {snippet}\n    {_MARKER_END}"
    for name in os.listdir(SAMPLE_SITE_DIR):
        if not name.lower().endswith((".html", ".htm")):
            continue
        path = os.path.join(SAMPLE_SITE_DIR, name)
        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
        except Exception:
            continue
        if not pattern.search(content):
            continue
        content = pattern.sub(replacement, content)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)

