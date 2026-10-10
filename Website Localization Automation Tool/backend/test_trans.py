# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding="utf-8")

from app.services.translation import TranslationService
ts = TranslationService()

tests = [
    ("hello world", "en", "hi"),
    ("hello world", "en", "or"),
    ("welcome to our website", "en", "hi"),
    ("welcome to our website", "en", "or"),
    ("\u0928\u092E\u0938\u094D\u0924\u0947", "hi", "en"),
    ("\u0B94\u0CAD\u0BF3\u0BB5\u0BA9\u0BCD", "or", "en"),
    ("home", "en", "hi"),
    ("about", "en", "or"),
]

for text, src, tgt in tests:
    result = ts.translate_text(text, src, tgt)
    print(f"{src}->{tgt}: '{text}' => '{result}'")
