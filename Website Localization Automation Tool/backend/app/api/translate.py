"""Single-text and batch translation endpoints.

Exposes the legacy /api/translate endpoint as well as the multilingual
translation API expected by the frontend and integration tests.
"""
from __future__ import annotations

from typing import List

from pydantic import BaseModel, ConfigDict, Field
from fastapi import APIRouter, HTTPException, status

from ..config import settings
from ..constants.languages import LANGUAGES, LANGUAGE_PAIRS
from ..services.translation import TranslationService, _bing_translator

router = APIRouter()
ts = TranslationService()


def _bing_available() -> bool:
    """Check if the Bing translator is available."""
    return _bing_translator is not None


def _normalize_language(code: str | None, default: str = "en") -> str:
    if not code:
        return default
    normalized = code.strip().lower().replace("_", "-")
    if normalized == "zh":
        return "zh-cn"
    if normalized in {"zh-cn", "zh_cn"}:
        return "zh-cn"
    if normalized in {"zh-tw", "zh_tw"}:
        return "zh-tw"
    return normalized


class TranslateRequest(BaseModel):
    text: str = Field(..., min_length=1)
    source_language: str = Field(default="auto")
    target_language: str = Field(..., min_length=2)


class TranslateResponse(BaseModel):
    translated_text: str
    source: str  # google-cloud | google | mymemory | ai | memory | error


class EngineInfo(BaseModel):
    name: str
    label: str
    available: bool
    priority: int


class EngineStatusResponse(BaseModel):
    primary: str
    engines: List[EngineInfo]


class BatchTranslateItem(BaseModel):
    text: str = Field(..., min_length=1)
    source_language: str = Field(default="auto")
    target_language: str = Field(..., min_length=2)


class BatchTranslateRequest(BaseModel):
    texts: List[str] = Field(default_factory=list)
    items: List[BatchTranslateItem] = Field(default_factory=list)
    source_language: str = Field(default="auto")
    target_language: str = Field(..., min_length=2)


class BatchTranslationResult(BaseModel):
    source_text: str
    translated_text: str
    source_language: str
    target_language: str
    provider: str


class TranslationBatchResponse(BaseModel):
    translations: List[BatchTranslationResult]
    count: int
    model_version: str

    model_config = ConfigDict(protected_namespaces=())


def _engine_status() -> EngineStatusResponse:
    engines = [
        EngineInfo(
            name="google-cloud",
            label="Google Cloud Translation API",
            available=bool(settings.google_cloud_translate_key),
            priority=1,
        ),
        EngineInfo(
            name="indictrans2",
            label="IndicTrans2 (self-hosted)",
            available=ts._indic_available(),
            priority=2,
        ),
        EngineInfo(
            name="bing",
            label="Bing Translator (free, all languages)",
            available=_bing_available(),
            priority=3,
        ),
        EngineInfo(
            name="google",
            label="Google Translate (free, deep-translator)",
            available=settings.use_google_translate,
            priority=4,
        ),
        EngineInfo(
            name="mymemory",
            label="MyMemory API",
            available=True,
            priority=5,
        ),
        EngineInfo(
            name="llm",
            label="OpenRouter / OpenAI LLM",
            available=ts._has_llm_key(),
            priority=6,
        ),
    ]
    primary = next((e.name for e in engines if e.available), "none")
    return EngineStatusResponse(primary=primary, engines=engines)


@router.get("/translate/engine", response_model=EngineStatusResponse)
def engine_status():
    """Return the configured translation engines and which is primary."""
    return _engine_status()


@router.post("/translate", response_model=TranslateResponse)
def translate_text(payload: TranslateRequest):
    """Translate a single piece of text using the configured translation engine."""
    if not payload.target_language:
        raise HTTPException(status_code=400, detail="target_language is required")

    translated, source = ts.translate_text(
        payload.text,
        _normalize_language(payload.source_language, "auto"),
        _normalize_language(payload.target_language, "en"),
    )

    if not translated:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Translation failed: could not translate text to '{payload.target_language}'. "
            f"Please check language support or API configuration.",
        )

    return TranslateResponse(translated_text=translated, source=source)


@router.get("/translation/languages")
def get_supported_languages():
    """Return the language list and supported translation directions."""
    payload = {
        "languages": ts.get_supported_languages(),
        "translation_directions": ts.get_supported_directions(),
        "model_version": settings.translation_model_version,
    }
    return payload


@router.get("/translation/health")
def translation_health():
    """Return model/provider health information for the translation stack."""
    return {
        "status": "ok",
        **ts.health(),
    }


@router.post("/translation/translate", response_model=TranslationBatchResponse)
def translate_batch(payload: BatchTranslateRequest):
    """Translate a batch of text values while validating size and language support."""
    source_lang = _normalize_language(payload.source_language, "auto")
    target_lang = _normalize_language(payload.target_language, "en")

    if source_lang != "auto" and source_lang not in LANGUAGES:
        raise HTTPException(status_code=400, detail=f"Unsupported source language: {source_lang}")
    if target_lang not in LANGUAGES:
        raise HTTPException(status_code=400, detail=f"Unsupported target language: {target_lang}")

    items = list(payload.items)
    if payload.texts:
        for text in payload.texts:
            items.append(BatchTranslateItem(text=text, source_language=source_lang, target_language=target_lang))

    if not items:
        raise HTTPException(status_code=400, detail="At least one text item is required")

    if len(items) > settings.translation_batch_size:
        raise HTTPException(
            status_code=400,
            detail=f"Batch size exceeds the maximum of {settings.translation_batch_size} items",
        )

    deduped: dict[tuple[str, str, str], BatchTranslateItem] = {}
    for item in items:
        text = item.text.strip()
        if not text:
            continue
        item_lang = _normalize_language(item.source_language, source_lang)
        item_target = _normalize_language(item.target_language, target_lang)
        deduped[(item_lang, item_target, text)] = BatchTranslateItem(
            text=text,
            source_language=item_lang,
            target_language=item_target,
        )

    translations: List[BatchTranslationResult] = []
    for item in deduped.values():
        translated, provider = ts.translate_text(item.text, item.source_language, item.target_language)
        if translated is None:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Translation failed for text '{item.text[:80]}' to '{item.target_language}'",
            )
        translations.append(
            BatchTranslationResult(
                source_text=item.text,
                translated_text=translated,
                source_language=item.source_language,
                target_language=item.target_language,
                provider=provider,
            )
        )

    return TranslationBatchResponse(
        translations=translations,
        count=len(translations),
        model_version=settings.translation_model_version,
    )
