"""Structured translation prompt templates.

The prompt is sent to the LLM as the system/user message. Placeholders such as
{{name}}, {{count}} and URLs are preserved verbatim per the translation rules.
Brand names are protected by wrapping them in a marker token during extraction.
"""
from __future__ import annotations

from ..config import settings

# System prompt guiding tone + constraints.
SYSTEM_PROMPT = (
    "You are a precise website localization assistant. Translate website content only. "
    "Do not add explanations, commentary, or change the tone. "
    "Preserve placeholders {{...}}, URLs, numbers, HTML entities, and brand names exactly. "
    "Return ONLY the translation, no surrounding quotes or notes."
)

# Per-segment user prompt template.
USER_PROMPT_TEMPLATE = (
    "Translate the following website content from {source_language} to {target_language}.\n"
    "Rules:\n"
    "1. Preserve the original meaning.\n"
    "2. Do not translate brand names ({brand_names}). Keep them identical.\n"
    "3. Preserve URLs exactly.\n"
    "4. Preserve placeholders such as {{name}}. Do not alter placeholder syntax.\n"
    "5. Preserve numbers and digits exactly.\n"
    "6. Preserve HTML-sensitive characters (< > &) as literal characters, do not escape them.\n"
    "7. Maintain the original tone.\n"
    "8. Do not add explanations.\n"
    "9. Return only the translation.\n"
    "\nSource: {text}"
)


def render_prompt(source_text: str, source_language: str, target_language: str) -> str:
    brand = settings.brand_names or ""
    # Protect URLs/placeholders so the LLM can't mangle them
    return USER_PROMPT_TEMPLATE.format(
        source_language=source_language or "the source language",
        target_language=target_language,
        brand_names=brand,
        text=source_text,
    )
