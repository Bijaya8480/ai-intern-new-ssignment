"""Tests for the translation service and IndicTrans2 client integration."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from app.main import app
from app.services.translation import TranslationService
from app.services.indic_translator import IndicTrans2Client, get_indic_client, is_indic_available

client = TestClient(app)


def test_health_endpoint_reports_providers():
    resp = client.get("/api/translation/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "providers" in data
    assert "google" in data["providers"]
    assert "indictrans2" in data["providers"]
    assert "mymemory" in data["providers"]
    assert "llm" in data["providers"]
    assert data["model_version"] is not None


def test_engine_status_endpoint():
    resp = client.get("/api/translate/engine")
    assert resp.status_code == 200
    data = resp.json()
    assert "primary" in data
    assert "engines" in data
    engine_names = [e["name"] for e in data["engines"]]
    assert "indictrans2" in engine_names
    assert "google" in engine_names


def test_translate_single_endpoint():
    resp = client.post("/api/translate", json={
        "text": "hello world",
        "source_language": "en",
        "target_language": "hi",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "translated_text" in data
    assert "source" in data
    assert data["translated_text"] is not None


def test_translate_batch_unsupported_language():
    """The batch endpoint validates target language and returns 400."""
    resp = client.post("/api/translation/translate", json={
        "texts": ["hello"],
        "source_language": "en",
        "target_language": "xyz",
    })
    assert resp.status_code == 400


def test_translate_single_bn():
    """Test English to Bengali translation."""
    resp = client.post("/api/translate", json={
        "text": "hello",
        "source_language": "en",
        "target_language": "bn",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["translated_text"] is not None


def test_translate_single_fr():
    """Test English to French translation."""
    resp = client.post("/api/translate", json={
        "text": "hello world",
        "source_language": "en",
        "target_language": "fr",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["translated_text"] == "bonjour le monde"
    assert data["source"] == "local-fallback"


def test_translate_batch_endpoint():
    resp = client.post("/api/translation/translate", json={
        "texts": ["hello world", "welcome"],
        "source_language": "en",
        "target_language": "hi",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 2
    assert len(data["translations"]) == 2
    for t in data["translations"]:
        assert t["translated_text"] is not None
        assert t["source_language"] == "en"
        assert t["target_language"] == "hi"


def test_translate_batch_dedup():
    """Batch with duplicate texts should be deduplicated."""
    resp = client.post("/api/translation/translate", json={
        "texts": ["hello world", "hello world", "hello world"],
        "source_language": "en",
        "target_language": "ta",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 1


def test_translate_unsupported_language():
    """The legacy /api/translate endpoint returns 502 when translation fails."""
    resp = client.post("/api/translate", json={
        "text": "hello",
        "source_language": "en",
        "target_language": "xyz",
    })
    assert resp.status_code == 502


def test_translate_missing_target():
    resp = client.post("/api/translate", json={
        "text": "hello",
        "source_language": "en",
        "target_language": "",
    })
    assert resp.status_code == 422


def test_languages_endpoint_has_native_names():
    resp = client.get("/api/translation/languages")
    assert resp.status_code == 200
    data = resp.json()
    hi = next(l for l in data["languages"] if l["code"] == "hi")
    assert hi["nativeName"] is not None
    assert hi["nativeName"] != hi["name"]


def test_translation_service_cache():
    ts = TranslationService()
    t1, p1 = ts.translate_text("hello world", "en", "hi")
    t2, p2 = ts.translate_text("hello world", "en", "hi")
    assert t1 == t2
    assert p1 == p2 == "local-fallback"


def test_translation_service_identity():
    ts = TranslationService()
    result, provider = ts.translate_text("hello", "en", "en")
    assert result == "hello"


def test_indic_translator_client_singleton():
    c1 = IndicTrans2Client.instance()
    c2 = IndicTrans2Client.instance()
    assert c1 is c2


def test_indic_translator_get_indic_client():
    client_obj = get_indic_client()
    assert client_obj is not None
    assert isinstance(client_obj, IndicTrans2Client)


def test_indic_translator_is_available():
    """Without the model downloaded, is_available should return False."""
    result = is_indic_available()
    assert isinstance(result, bool)


def test_indic_translator_supported_languages():
    assert "en" in IndicTrans2Client.SUPPORTED_LANGUAGES
    assert "hi" in IndicTrans2Client.SUPPORTED_LANGUAGES
    assert "or" in IndicTrans2Client.SUPPORTED_LANGUAGES
    assert "bn" in IndicTrans2Client.SUPPORTED_LANGUAGES


def test_indic_translator_lang_code_map():
    m = IndicTrans2Client.LANG_CODE_MAP
    assert m["en"] == "eng"
    assert m["hi"] == "hin"
    assert m["or"] == "ori"
    assert m["bn"] == "ben"
    assert m["ta"] == "tam"


def test_indic_translator_translate_unsupported_pair():
    c = IndicTrans2Client.instance()
    assert c.is_available() is False or c.translate("test", "en", "xyz") is None


def test_translation_service_indic_available_method():
    """TranslationService should expose _indic_available()."""
    ts = TranslationService()
    result = ts._indic_available()
    assert isinstance(result, bool)


def test_translation_service_health_includes_indic():
    ts = TranslationService()
    h = ts.health()
    assert "indictrans2" in h["providers"]
    assert isinstance(h["providers"]["indictrans2"], bool)
