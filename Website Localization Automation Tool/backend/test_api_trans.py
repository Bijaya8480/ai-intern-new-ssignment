# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding="utf-8")
from fastapi.testclient import TestClient
from app.main import app

c = TestClient(app)

# Test translate endpoint
tests = [
    ("hello world", "en", "hi"),
    ("hello world", "en", "or"),
    ("welcome to our website", "en", "hi"),
    ("welcome to our website", "en", "or"),
]

for text, src, tgt in tests:
    r = c.post('/api/translation/translate', json={'texts': [text], 'source_language': src, 'target_language': tgt})
    body = r.json()
    print(f"{src}->{tgt}: '{text}' => '{body['translations'][0]['translated_text']}' (provider: {body['translations'][0]['provider']})")

# Test reverse
r = c.post('/api/translation/translate', json={'texts': ['नमस्ते दुनिया'], 'source_language': 'hi', 'target_language': 'en'})
body = r.json()
print(f"hi->en: 'नमस्ते दुनिया' => '{body['translations'][0]['translated_text']}' (provider: {body['translations'][0]['provider']})")

r = c.post('/api/translation/translate', json={'texts': ['ହ୍ୟାଲୋ ଦୁନିଆ'], 'source_language': 'or', 'target_language': 'en'})
body = r.json()
print(f"or->en: 'ହ୍ୟାଲୋ ଦୁନିଆ' => '{body['translations'][0]['translated_text']}' (provider: {body['translations'][0]['provider']})")

# Test health
r = c.get('/api/translation/health')
print(f"Health: {r.json()}")

# Test languages
r = c.get('/api/translation/languages')
data = r.json()
print(f"Languages: {len(data['languages'])} supported, model: {data['model_version']}")
print(f"Directions for 'en': {len(data['translation_directions']['en'])} targets")
print(f"Directions for 'hi': {data['translation_directions']['hi']}")
print(f"Directions for 'or': {data['translation_directions']['or']}")
