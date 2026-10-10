"""IndicTrans2 self-hosted translation backend.

This module provides a thin client around the AI4Bharat IndicTrans2 model
family.  It is designed to be **lazy-loaded**: the heavy ML dependencies
(torch / transformers) are only imported when the service is first used, so
the rest of the application starts instantly even when IndicTrans2 is not
installed.

Two operating modes are supported:

1. **Self-hosted HTTP API** – Run the optional ``indictrans2_server.py``
   script (or any compatible server) on ``INDICTRANS2_URL``.  This module
   delegates to it via ``httpx``.

2. **In-process model** – When the server is unavailable but ``torch`` and
   ``transformers`` are installed, the model is loaded directly into memory.
   This is the fallback for single-machine deployments.

If neither mode is available the client reports ``available == False`` so the
calling ``TranslationService`` can fall through to dictionary / Google /
MyMemory providers.
"""
from __future__ import annotations

import threading
from typing import List, Optional, Tuple

from ..config import settings

log = None  # set lazily


def _get_logger():
    global log
    if log is None:
        import logging
        log = logging.getLogger("loc_tool.indictrans2")
    return log


class IndicTrans2Client:
    """Client for the IndicTrans2 translation engine.

    The client is a singleton (one per process) and initialises its model
    lazily on first use.
    """

    _instance: Optional["IndicTrans2Client"] = None
    _lock = threading.Lock()

    # Language codes IndicTrans2 actually understands.
    SUPPORTED_LANGUAGES = {
        "en", "hi", "or", "bn", "ta", "te", "mr", "gu",
        "pa", "as", "kn", "ml", "ur", "ne", "sa", "fr", "es", "de",
    }

    # IndicTrans2 uses its own script-specific tokenisers, but the public
    # language codes are ISO-639-1 two-letter codes.
    LANG_CODE_MAP = {
        "en": "eng", "hi": "hin", "or": "ori", "bn": "ben",
        "ta": "tam", "te": "tel", "mr": "mar", "gu": "guj",
        "pa": "pan", "as": "asm", "kn": "kan", "ml": "mal",
        "ur": "urd", "ne": "nep", "sa": "san", "fr": "fra",
        "es": "spa", "de": "deu", "ar": "ara", "zh-cn": "zho",
        "zh-tw": "zho", "ja": "jpn", "ko": "kor",
    }

    def __init__(self) -> None:
        self._model: Optional[object] = None
        self._tokenizer: Optional[object] = None
        self._model_lock = threading.Lock()
        self._use_server: bool = False
        self._available: Optional[bool] = None
        self._test_model_loaded: Optional[bool] = None

    # ------------------------------------------------------------------ #
    # Singleton
    # ------------------------------------------------------------------ #
    @classmethod
    def instance(cls) -> "IndicTrans2Client":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    # ------------------------------------------------------------------ #
    # Availability detection
    # ------------------------------------------------------------------ #
    def is_available(self) -> bool:
        """Return True if a usable IndicTrans2 backend is present."""
        if self._available is not None:
            return self._available

        if not settings.indictrans2_enabled:
            self._available = False
            return False

        # Check HTTP server first.
        if self._check_server():
            self._available = True
            self._use_server = True
            return True

        # Check in-process model.
        if self._can_load_model():
            self._available = True
            self._use_server = False
            return True

        self._available = False
        return False

    def _check_server(self) -> bool:
        import httpx
        try:
            resp = httpx.get(f"{settings.indictrans2_url}/health", timeout=3)
            return resp.status_code == 200
        except Exception:
            return False

    def _can_load_model(self) -> bool:
        """Check whether torch/transformers are available AND the model can be loaded."""
        try:
            import torch  # noqa: F401
            import transformers  # noqa: F401
        except ImportError:
            return False
        # Verify the model itself is actually loadable (not just dependencies).
        if self._model is not None:
            return True
        if self._test_model_loaded is None:
            self._test_model_loaded = self._try_load_model()
        return self._test_model_loaded

    def _try_load_model(self) -> bool:
        """Attempt to load the model; return True on success, False on any error."""
        try:
            from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
            self._tokenizer = AutoTokenizer.from_pretrained(
                settings.local_translation_model, trust_remote_code=True,
            )
            self._model = AutoModelForSeq2SeqLM.from_pretrained(
                settings.local_translation_model, trust_remote_code=True,
            )
            return self._model is not None
        except Exception as e:
            _get_logger().warning(
                "Could not load IndicTrans2 model '%s': %s",
                settings.local_translation_model, e,
            )
            self._model = None
            self._tokenizer = None
            return False

    # ------------------------------------------------------------------ #
    # Translation
    # ------------------------------------------------------------------ #
    def translate(self, text: str, source: str, target: str) -> Optional[str]:
        """Translate a single text string.

        Returns the translated text or ``None`` if the engine cannot handle
        the request.
        """
        if not text or not text.strip():
            return text

        source = self._normalize(source)
        target = self._normalize(target)

        if source == target:
            return text

        if source not in self.SUPPORTED_LANGUAGES:
            return None
        if target not in self.SUPPORTED_LANGUAGES:
            return None

        if self._use_server:
            return self._translate_via_server(text, source, target)
        else:
            return self._translate_via_model(text, source, target)

    def translate_batch(
        self, texts: List[str], source: str, target: str
    ) -> List[Optional[str]]:
        """Translate a batch of texts, preserving order."""
        source = self._normalize(source)
        target = self._normalize(target)

        if source not in self.SUPPORTED_LANGUAGES or target not in self.SUPPORTED_LANGUAGES:
            return [None] * len(texts)

        if self._use_server:
            return self._translate_batch_via_server(texts, source, target)

        results: List[Optional[str]] = []
        for t in texts:
            results.append(self._translate_via_model(t, source, target))
        return results

    # ------------------------------------------------------------------ #
    # Server mode
    # ------------------------------------------------------------------ #
    def _translate_via_server(
        self, text: str, source: str, target: str
    ) -> Optional[str]:
        import httpx
        payload = {"text": text, "source": source, "target": target}
        try:
            resp = httpx.post(
                f"{settings.indictrans2_url}/translate",
                json=payload,
                timeout=settings.translation_request_timeout,
            )
            if resp.status_code == 200:
                return resp.json().get("translated_text")
            return None
        except Exception as e:
            _get_logger().warning("IndicTrans2 server error: %s", e)
            return None

    def _translate_batch_via_server(
        self, texts: List[str], source: str, target: str
    ) -> List[Optional[str]]:
        import httpx
        payload = {"texts": texts, "source": source, "target": target}
        try:
            resp = httpx.post(
                f"{settings.indictrans2_url}/translate_batch",
                json=payload,
                timeout=settings.translation_request_timeout,
            )
            if resp.status_code == 200:
                return resp.json().get("translations", [])
            return [None] * len(texts)
        except Exception as e:
            _get_logger().warning("IndicTrans2 server batch error: %s", e)
            return [None] * len(texts)

    # ------------------------------------------------------------------ #
    # In-process model mode
    # ------------------------------------------------------------------ #
    def _translate_via_model(
        self, text: str, source: str, target: str
    ) -> Optional[str]:
        if self._model is None:
            with self._model_lock:
                if self._model is None:
                    self._load_model()
        if self._model is None:
            return None

        src_code = self.LANG_CODE_MAP.get(source, source)
        tgt_code = self.LANG_CODE_MAP.get(target, target)

        try:
            # IndicTrans2 inference — the tokenizer/model accept language
            # codes via special tokens.
            tokenizer = self._tokenizer
            model = self._model

            # Build the source-target language prefix for the tokenizer
            inputs = tokenizer(
                text,
                src_lang=src_code,
                return_tensors="pt",
            )
            with _torch_no_grad():
                generated = model.generate(
                    **inputs,
                    num_beams=5,
                    early_stopping=True,
                    max_length=256,
                )
            decoded = tokenizer.batch_decode(generated, skip_special_tokens=True)
            return decoded[0].strip() if decoded else None
        except Exception as e:
            _get_logger().warning("IndicTrans2 model inference error: %s", e)
            return None

    def _load_model(self) -> None:
        """Load the IndicTrans2 model into memory (lazy, thread-safe)."""
        try:
            from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
            _get_logger().info(
                "Loading IndicTrans2 model: %s", settings.local_translation_model
            )
            self._tokenizer = AutoTokenizer.from_pretrained(
                settings.local_translation_model,
                trust_remote_code=True,
            )
            self._model = AutoModelForSeq2SeqLM.from_pretrained(
                settings.local_translation_model,
                trust_remote_code=True,
            )
        except Exception as e:
            _get_logger().warning(
                "Could not load IndicTrans2 model '%s': %s",
                settings.local_translation_model,
                e,
            )
            self._model = None
            self._tokenizer = None

    # ------------------------------------------------------------------ #
    # Helpers
    # ------------------------------------------------------------------ #
    @staticmethod
    def _normalize(code: str) -> str:
        if not code:
            return "en"
        normalized = code.strip().lower().replace("_", "-")
        if normalized == "zh":
            return "zh-cn"
        return normalized


def _torch_no_grad():
    """Return torch.no_grad() context manager, or a dummy if torch is missing."""
    try:
        import torch
        return torch.no_grad()
    except ImportError:
        import contextlib
        return contextlib.nullcontext()


def get_indic_client() -> IndicTrans2Client:
    """Module-level accessor for the singleton client."""
    return IndicTrans2Client.instance()


def is_indic_available() -> bool:
    """Quick check whether IndicTrans2 is usable without side effects."""
    return IndicTrans2Client.instance().is_available()
