"""Languages supported by the tool for translation publishing.

Includes the verified free/AI-capable languages exposed in the app and the
Indian-language locales required by the multilingual translation feature.
"""
from __future__ import annotations

# code -> readable name
LANGUAGES = {
    "en": "English",
    "hi": "Hindi",
    "or": "Odia",
    "bn": "Bengali",
    "ta": "Tamil",
    "te": "Telugu",
    "mr": "Marathi",
    "gu": "Gujarati",
    "pa": "Punjabi",
    "as": "Assamese",
    "kn": "Kannada",
    "ml": "Malayalam",
    "ur": "Urdu",
    "ne": "Nepali",
    "sa": "Sanskrit",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "ar": "Arabic",
    "it": "Italian",
    "pt": "Portuguese",
    "nl": "Dutch",
    "ru": "Russian",
    "ja": "Japanese",
    "ko": "Korean",
    "zh-cn": "Chinese (Simplified)",
    "zh-tw": "Chinese (Traditional)",
    "tr": "Turkish",
    "sv": "Swedish",
    "pl": "Polish",
    "ro": "Romanian",
    "th": "Thai",
    "vi": "Vietnamese",
}

# Native-language labels for the language selector UI.
LANGUAGE_NATIVE_NAMES = {
    "en": "English",
    "hi": "हिंदी",
    "or": "ଓଡ଼ିଆ",
    "bn": "বাংলা",
    "ta": "தமிழ்",
    "te": "తెలుగు",
    "mr": "मराठी",
    "gu": "ગુજરાતી",
    "pa": "ਪੰਜਾਬੀ",
    "as": "অসমীয়া",
    "kn": "ಕನ್ನಡ",
    "ml": "മലയാളം",
    "ur": "اردو",
    "ne": "नेपाली",
    "sa": "संस्कृत",
    "es": "Español",
    "fr": "Français",
    "de": "Deutsch",
    "ar": "العربية",
    "it": "Italiano",
    "pt": "Português",
    "nl": "Nederlands",
    "ru": "Русский",
    "ja": "日本語",
    "ko": "한국어",
    "zh-cn": "简体中文",
    "zh-tw": "繁體中文",
    "tr": "Türkçe",
    "sv": "Svenska",
    "pl": "Polski",
    "ro": "Română",
    "th": "ไทย",
    "vi": "Tiếng Việt",
}

# Verified language pairs are intentionally kept conservative. The actual model's
# support varies by provider and installation, so we gate selection to the
# languages that are supported by the app's translation stack and for which the
# backend can report support at runtime.
LANGUAGE_PAIRS = {
    "en": {"hi", "or", "bn", "ta", "te", "mr", "gu", "pa", "as", "kn", "ml", "ur", "ne", "sa", "fr", "es", "de", "ar", "it", "pt", "nl", "ru", "ja", "ko", "zh-cn", "zh-tw"},
    "hi": {"en", "or", "bn", "ta", "te", "mr", "gu", "pa", "as", "kn", "ml", "ur", "ne", "sa"},
    "or": {"en", "hi", "bn", "ta", "te", "mr", "gu", "pa", "as", "kn", "ml", "ur", "ne", "sa"},
    "bn": {"en", "hi", "or", "ta", "te", "mr", "gu", "pa", "as", "kn", "ml", "ur", "ne", "sa"},
    "ta": {"en", "hi", "or", "bn", "te", "mr", "gu", "pa", "as", "kn", "ml", "ur", "ne", "sa"},
    "te": {"en", "hi", "or", "bn", "ta", "mr", "gu", "pa", "as", "kn", "ml", "ur", "ne", "sa"},
    "mr": {"en", "hi", "or", "bn", "ta", "te", "gu", "pa", "as", "kn", "ml", "ur", "ne", "sa"},
    "gu": {"en", "hi", "or", "bn", "ta", "te", "mr", "pa", "as", "kn", "ml", "ur", "ne", "sa"},
    "pa": {"en", "hi", "or", "bn", "ta", "te", "mr", "gu", "as", "kn", "ml", "ur", "ne", "sa"},
    "as": {"en", "hi", "or", "bn", "ta", "te", "mr", "gu", "pa", "kn", "ml", "ur", "ne", "sa"},
    "kn": {"en", "hi", "or", "bn", "ta", "te", "mr", "gu", "pa", "as", "ml", "ur", "ne", "sa"},
    "ml": {"en", "hi", "or", "bn", "ta", "te", "mr", "gu", "pa", "as", "kn", "ur", "ne", "sa"},
    "ur": {"en", "hi", "or", "bn", "ta", "te", "mr", "gu", "pa", "as", "kn", "ml", "ne", "sa"},
    "ne": {"en", "hi", "or", "bn", "ta", "te", "mr", "gu", "pa", "as", "kn", "ml", "ur", "sa"},
    "sa": {"en", "hi", "or", "bn", "ta", "te", "mr", "gu", "pa", "as", "kn", "ml", "ur", "ne"},
    "fr": {"en", "es", "de", "ar", "it", "pt", "nl", "ru", "ja", "ko"},
    "es": {"en", "fr", "de", "ar", "it", "pt", "nl", "ru", "ja", "ko"},
    "de": {"en", "fr", "es", "ar", "it", "pt", "nl", "ru", "ja", "ko"},
    "ar": {"en", "fr", "es", "de", "it", "pt", "nl", "ru", "ja", "ko"},
    "it": {"en", "fr", "es", "de", "ar", "pt", "nl", "ru", "ja", "ko"},
    "pt": {"en", "fr", "es", "de", "ar", "it", "nl", "ru", "ja", "ko"},
    "nl": {"en", "fr", "es", "de", "ar", "it", "pt", "ru", "ja", "ko"},
    "ru": {"en", "fr", "es", "de", "ar", "it", "pt", "nl", "ja", "ko"},
    "ja": {"en", "fr", "es", "de", "ar", "it", "pt", "nl", "ru", "ko"},
    "ko": {"en", "fr", "es", "de", "ar", "it", "pt", "nl", "ru", "ja"},
    "zh-cn": {"en", "fr", "es", "de", "ar", "it", "pt", "nl", "ru", "ja", "ko"},
    "zh-tw": {"en", "fr", "es", "de", "ar", "it", "pt", "nl", "ru", "ja", "ko"},
}

# Default source language when detection fails.
DEFAULT_SOURCE_LANGUAGE = "en"
