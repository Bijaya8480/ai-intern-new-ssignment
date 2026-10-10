"""
Centralized configuration via environment variables.

Uses pydantic-settings. Defaults are chosen so the prototype runs out of the
box; production values should be provided through the environment.
"""
from __future__ import annotations

import os
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- Application ---
    app_env: str = "development"
    host: str = "0.0.0.0"
    port: int = 8000
    frontend_url: str = "http://localhost:5173"

    # --- Database ---
    database_url: str = "sqlite:///./loc_tool.db"

    # --- Crawler ---
    max_crawl_pages: int = 50
    max_crawl_depth: int = 5
    crawl_timeout: int = 30000
    crawl_user_agent: str = "WebsiteLocalizationBot/1.0 (+https://example.com/bot)"
    use_playwright: bool = True

    # --- AI / Translation ---
    llm_provider: str = "openrouter"
    openai_api_key: Optional[str] = None
    openrouter_api_key: Optional[str] = None
    openrouter_model: str = "google/gemini-2.0-flash-exp"
    openai_model: str = "gpt-4o-mini"
    llm_max_tokens: int = 1024
    llm_temperature: float = 0.3
    # Free local AI translation support. When available, Ai4Bharat IndicTrans2
    # provides a self-hosted translation engine for verified Indian language pairs.
    # Requires: pip install torch transformers sentencepiece (see README for details)
    translation_enable_local_ai: bool = True
    local_translation_model: str = "ai4bharat/indictrans2-en-indic"
    indictrans2_url: str = "http://127.0.0.1:8020"
    indictrans2_enabled: bool = True
    translation_model_version: str = "indictrans2-v1"
    translation_batch_size: int = 25
    translation_request_timeout: float = 30.0
    translation_retry_attempts: int = 3
    # Use Google Translate (free, via deep-translator) as a fallback translation
    # engine when the official Google Cloud Translation API key is not set.
    use_google_translate: bool = True
    # Bing Translator (free, via translators library) — supports all 33 languages.
    use_bing_translator: bool = True
    # Google Cloud Translation API — the official Google Cloud AI translation
    # service. Requires a server API key (``GOOGLE_CLOUD_TRANSLATE_KEY``).
    # When set it takes priority over the free deep-translator Google engine.
    google_cloud_translate_key: Optional[str] = None
    # Brand names that must never be translated.
    brand_names: str = "AcmeCorp,Acme,ExampleCorp"

    # --- Publishing ---
    publisher_base_url: str = os.getenv("PUBLISHER_BASE_URL", "http://localhost:8000")
    snippet_default_lang: str = "en"

    # --- Security ---
    secret_key: str = "change-me-in-production"


settings = Settings()
