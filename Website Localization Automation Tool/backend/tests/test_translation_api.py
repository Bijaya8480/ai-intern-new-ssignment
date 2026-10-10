import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_languages_endpoint_lists_verified_pairs():
    response = client.get("/api/translation/languages")
    assert response.status_code == 200

    payload = response.json()
    codes = {item["code"] for item in payload["languages"]}
    assert {"en", "hi", "or", "bn", "ta"}.issubset(codes)

    directions = payload["translation_directions"]
    assert "en" in directions
    assert "hi" in directions["en"]
    assert "or" in directions["en"]
    assert "en" in directions["hi"]
    assert "en" in directions["or"]


def test_verified_translation_pairs_work():
    checks = [
        ({"texts": ["hello world"], "source_language": "en", "target_language": "hi"}, "नमस्ते दुनिया"),
        ({"texts": ["hello world"], "source_language": "en", "target_language": "or"}, "ହ୍ୟାଲୋ ଦୁନିଆ"),
        ({"texts": ["नमस्ते दुनिया"], "source_language": "hi", "target_language": "en"}, "hello world"),
        ({"texts": ["ହ୍ୟାଲୋ ଦୁନିଆ"], "source_language": "or", "target_language": "en"}, "hello world"),
    ]

    for payload, expected in checks:
        response = client.post("/api/translation/translate", json=payload)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["count"] == 1
        assert body["translations"][0]["translated_text"] == expected
