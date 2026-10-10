"""Backend translation service with provider fallback and caching.

The project already exposes translation endpoints from ``app.api.translate`` and
expects a ``TranslationService`` implementation to be present. This module keeps
that contract intact while remaining conservative about language support and
producing transparent fallbacks when the live network-backed translators are
unavailable or rate limited.
"""
from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Optional, Tuple

from sqlalchemy import select

from ..config import settings
from ..constants.languages import LANGUAGES, LANGUAGE_PAIRS, LANGUAGE_NATIVE_NAMES

# Lazy import of the IndicTrans2 client — avoids importing torch/transformers
# at module load time.
_indic_client = None


def _get_indic_client():
    global _indic_client
    if _indic_client is None:
        try:
            from .indic_translator import get_indic_client
            _indic_client = get_indic_client()
        except Exception:
            _indic_client = False  # marker: attempted, unavailable
    return _indic_client if _indic_client is not False else None

try:  # pragma: no cover - best effort import for live translation providers.
    from deep_translator import GoogleTranslator
except Exception:  # pragma: no cover
    GoogleTranslator = None

try:  # pragma: no cover - optional language detection.
    from langdetect import detect, LangDetectException
except Exception:  # pragma: no cover
    detect = None
    class LangDetectException(Exception):
        pass

try:  # pragma: no cover - optional MyMemory integration
    from deep_translator import MyMemoryTranslator
except Exception:  # pragma: no cover
    MyMemoryTranslator = None

# Bing/Microsoft translator via the `translators` library — supports all 33 languages
try:
    import translators as tss
    _bing_translator = tss
except Exception:  # pragma: no cover
    _bing_translator = None

# Map our internal language codes to Bing-compatible codes
_BING_LANG_CODE_MAP = {
    "zh-cn": "zh-Hans",
    "zh-tw": "zh-Hant",
}


def _to_bing_code(code: str) -> str:
    return _BING_LANG_CODE_MAP.get(code, code)


FALLBACK_TRANSLATIONS: Dict[Tuple[str, str], Dict[str, str]] = {
    ("en", "hi"): {
        "hello": "नमस्ते",
        "hello world": "नमस्ते दुनिया",
        "welcome": "स्वागत है",
        "welcome to our website": "हमारी वेबसाइट में स्वागत है",
        "home": "होम",
        "about": "हमारे बारे में",
        "contact": "संपर्क",
        "services": "सेवाएँ",
        "language": "भाषा",
        "search": "खोजें",
        "submit": "सबमिट करें",
        "cancel": "रद्द करें",
        "login": "लॉग इन",
        "logout": "लॉग आउट",
        "settings": "सेटिंग्स",
        "dashboard": "डैशबोर्ड",
        "privacy": "गोपनीयता",
        "terms": "शर्तें",
        "read more": "अधिक पढ़ें",
        "world": "दुनिया",
    },
    ("en", "or"): {
        "hello": "ହ୍ୟାଲୋ",
        "hello world": "ହ୍ୟାଲୋ ଦୁନିଆ",
        "welcome": "ସ୍ୱାଗତ",
        "welcome to our website": "ଆମର ୱେବସାଇଟକୁ ସ୍ୱାଗତ",
        "home": "ହୋମ",
        "about": "ଵିଷୟ",
        "contact": "ସମ୍ପର୍କ",
        "services": "ସେବା",
        "language": "ଭାଷା",
        "search": "ସନ୍ଧାନ",
        "submit": "ଦାଖଲ କରନ୍ତୁ",
        "cancel": "ବାତିଲ୍ କରନ୍ତୁ",
        "login": "ଲଗଇନ",
        "logout": "ଲଗଆଉଟ",
        "settings": "ସେଟିଂସମୂହ",
        "dashboard": "ଡ୍ୟାଶବୋର୍ଡ",
        "privacy": "ଗୋପନୀୟତା",
        "terms": "ସର୍ତ୍ତ",
        "read more": "ଅଧିକ ପଢ଼ନ୍ତୁ",
        "world": "ଦୁନିଆ",
    },
    ("hi", "en"): {
        "नमस्ते": "hello",
        "नमस्ते दुनिया": "hello world",
        "स्वागत": "welcome",
        "होम": "home",
        "संपर्क": "contact",
        "भाषा": "language",
        "खोजें": "search",
        "सबमिट": "submit",
        "रद्द": "cancel",
        "लॉग": "login",
        "सेटिंग्स": "settings",
        "डैशबोर्ड": "dashboard",
        "गोपनीयता": "privacy",
        "शर्तें": "terms",
        "अधिक": "more",
        "दुनिया": "world",
    },
    ("or", "en"): {
        "ହ୍ୟାଲୋ": "hello",
        "ହ୍ୟାଲୋ ଦୁନିଆ": "hello world",
        "ସ୍ୱାଗତ": "welcome",
        "ହୋମ": "home",
        "ସମ୍ପର୍କ": "contact",
        "ଭାଷା": "language",
        "ସନ୍ଧାନ": "search",
        "ଦାଖଲ": "submit",
        "ବାତିଲ୍": "cancel",
        "ଲଗଇନ": "login",
        "ସେଟିଂସ": "settings",
        "ଡ୍ୟାଶବୋର୍ଡ": "dashboard",
        "ଗୋପନୀୟତା": "privacy",
        "ସର୍ତ୍ତ": "terms",
        "ଅଧିକ": "more",
        "ଦୁନିଆ": "world",
    },
    ("en", "bn"): {
        "hello": "হ্যালো",
        "hello world": "হ্যালো বিশ্ব",
        "welcome": "স্বাগত",
        "home": "হোম",
        "about": "সম্পর্কে",
        "contact": "যোগাযোগ",
        "services": "সেবা",
        "language": "ভাষা",
        "search": "অনুসন্ধান",
        "submit": "জমা দিন",
        "cancel": "বাতিল",
        "login": "প্রবেশ",
        "logout": "লগ আউট",
        "settings": "নির্দেশাপত্র",
        "dashboard": "ড্যাশবোর্ড",
        "privacy": "ব্যক্তিগততা",
        "terms": "শর্ত",
        "read more": "আরও পড়ুন",
        "world": "বিশ্ব",
    },
    ("bn", "en"): {
        "হ্যালো": "hello",
        "হ্যালো বিশ্ব": "hello world",
        "স্বাগত": "welcome",
        "হোম": "home",
        "সম্পর্কে": "about",
        "যোগাযোগ": "contact",
        "ভাষা": "language",
        "অনুসন্ধান": "search",
        "বই": "book",
        "আরও": "more",
        "বিশ্ব": "world",
    },
    ("en", "ta"): {
        "hello": "ஹல்லோ",
        "hello world": "ஹல்லோ உலகம்",
        "welcome": "வரவேற்பு",
        "home": "முகப்பு",
        "about": "பற்றி",
        "contact": "தொடர்பு",
        "services": "சேவைகள்",
        "language": "மொழி",
        "search": "தேடுக",
        "submit": "சமர்ப்",
        "cancel": "ரத்துசெய்",
        "login": "உள்நுழை",
        "logout": "விலேயாக்கு",
        "settings": "அமைப்புகள்",
        "dashboard": "டாஷ்போர்டு",
        "privacy": "தனிமைப்பு",
        "terms": "விதிமுறைகள்",
        "read more": "மேலும் படி",
        "world": "உலகம்",
    },
    ("ta", "en"): {
        "ஹல்லோ": "hello",
        "ஹல்லோ உலகம்": "hello world",
        "வரவேற்பு": "welcome",
        "முகப்பு": "home",
        "பற்றி": "about",
        "தொடர்பு": "contact",
        "மொழி": "language",
        "தேடுக": "search",
        "மேலும்": "more",
        "உலகம்": "world",
    },
    ("en", "fr"): {
        "hello": "bonjour",
        "hello world": "bonjour le monde",
        "welcome": "bienvenue",
        "home": "accueil",
        "about": "à propos",
        "contact": "contact",
        "services": "services",
        "language": "langue",
        "search": "rechercher",
        "submit": "soumettre",
        "cancel": "annuler",
        "login": "connexion",
        "logout": "déconnexion",
        "settings": "paramètres",
        "dashboard": "tableau de bord",
        "privacy": "confidentialité",
        "terms": "termes",
        "read more": "lire la suite",
        "world": "monde",
    },
    ("fr", "en"): {
        "bonjour": "hello",
        "bonjour le monde": "hello world",
        "bienvenue": "welcome",
        "accueil": "home",
        "à propos": "about",
        "contact": "contact",
        "langue": "language",
        "rechercher": "search",
        "monde": "world",
    },
    ("en", "es"): {
        "hello": "hola",
        "hello world": "hola mundo",
        "welcome": "bienvenido",
        "home": "inicio",
        "about": "acerca de",
        "contact": "contacto",
        "services": "servicios",
        "language": "idioma",
        "search": "buscar",
        "submit": "enviar",
        "cancel": "cancelar",
        "login": "iniciar sesión",
        "logout": "cerrar sesión",
        "settings": "configuración",
        "dashboard": "panel",
        "privacy": "privacidad",
        "terms": "términos",
        "read more": "leer más",
        "world": "mundo",
    },
    ("en", "de"): {
        "hello": "hallo",
        "hello world": "hallo welt",
        "welcome": "willkommen",
        "home": "startseite",
        "about": "über",
        "contact": "kontakt",
        "services": "dienstleistungen",
        "language": "sprache",
        "search": "suche",
        "submit": "senden",
        "cancel": "abbrechen",
        "login": "anmelden",
        "logout": "abmelden",
        "settings": "einstellungen",
        "dashboard": "dashboard",
        "privacy": "datenschutz",
        "terms": "bedingungen",
        "read more": "weiterlesen",
        "world": "welt",
    },
    ("en", "ar"): {
        "hello": "مرحبا",
        "hello world": "مرحبا بالعالم",
        "welcome": "مرحبا بك",
        "home": "الرئيسية",
        "about": "عن",
        "contact": "اتصل بنا",
        "services": "خدمات",
        "language": "اللغة",
        "search": "بحث",
        "submit": "إرسال",
        "cancel": "إلغاء",
        "login": "تسجيل الدخول",
        "logout": "تسجيل الخروج",
        "settings": "الإعدادات",
        "dashboard": "لوحة القيادة",
        "privacy": "الخصوصية",
        "terms": "الشروط",
        "read more": "اقرأ المزيد",
        "world": "العالم",
    },
    ("en", "it"): {
        "hello": "ciao",
        "hello world": "ciao mondo",
        "welcome": "benvenuto",
        "home": "casa",
        "about": "su",
        "contact": "contatto",
        "services": "servizi",
        "language": "lingua",
        "search": "cerca",
        "submit": "invia",
        "cancel": "annulla",
        "login": "accedi",
        "logout": "esci",
        "settings": "impostazioni",
        "dashboard": "cruscotto",
        "privacy": "privacy",
        "terms": "termini",
        "read more": "leggi di più",
        "world": "mondo",
    },
    ("en", "pt"): {
        "hello": "olá",
        "hello world": "olá mundo",
        "welcome": "bem-vindo",
        "home": "início",
        "about": "sobre",
        "contact": "contato",
        "services": "serviços",
        "language": "idioma",
        "search": "pesquisar",
        "submit": "enviar",
        "cancel": "cancelar",
        "login": "entrar",
        "logout": "sair",
        "settings": "configurações",
        "dashboard": "painel",
        "privacy": "privacidade",
        "terms": "termos",
        "read more": "ler mais",
    },
    ("en", "nl"): {
        "hello": "hallo",
        "hello world": "hallo wereld",
        "welcome": "welkom",
        "home": "thuis",
        "about": "over",
        "contact": "contact",
        "services": "diensten",
        "language": "taal",
        "search": "zoek",
        "submit": "indienen",
        "cancel": "annuleren",
        "login": "inloggen",
        "logout": "uitloggen",
        "settings": "instellingen",
        "dashboard": "dashboard",
        "privacy": "privacy",
        "terms": "voorwaarden",
        "read more": "lees meer",
        "world": "wereld",
    },
    ("en", "ru"): {
        "hello": "привет",
        "hello world": "привет мир",
        "welcome": "добро пожаловать",
        "home": "домой",
        "about": "о",
        "contact": "контакт",
        "services": "услуги",
        "language": "язык",
        "search": "поиск",
        "submit": "отправить",
        "cancel": "отмена",
        "login": "войти",
        "logout": "выйти",
        "settings": "настройки",
        "dashboard": "панель",
        "privacy": "конфиденциальность",
        "terms": "условия",
        "read more": "читать далее",
        "world": "мир",
    },
    ("en", "ja"): {
        "hello": "こんにちは",
        "hello world": "こんにちは世界",
        "welcome": "ようこそ",
        "home": "ホーム",
        "about": "について",
        "contact": "お問い合わせ",
        "services": "サービス",
        "language": "言語",
        "search": "検索",
        "submit": "送信",
        "cancel": "キャンセル",
        "login": "ログイン",
        "logout": "ログアウト",
        "settings": "設定",
        "dashboard": "ダッシュボード",
        "privacy": "プライバシー",
        "terms": "利用規約",
        "read more": "もっと読む",
        "world": "世界",
    },
    ("en", "ko"): {
        "hello": "안녕하세요",
        "hello world": "안녕하세요 세계",
        "welcome": "환영합니다",
        "home": "홈",
        "about": "에 대해",
        "contact": "연락처",
        "services": "서비스",
        "language": "언어",
        "search": "검색",
        "submit": "제출",
        "cancel": "취소",
        "login": "로그인",
        "logout": "로그아웃",
        "settings": "설정",
        "dashboard": "대시보드",
        "privacy": "개인정보 보호",
        "terms": "약관",
        "read more": "더 보기",
        "world": "세계",
    },
    ("en", "zh-cn"): {
        "hello": "你好",
        "hello world": "你好世界",
        "welcome": "欢迎",
        "home": "主页",
        "about": "关于",
        "contact": "联系",
        "services": "服务",
        "language": "语言",
        "search": "搜索",
        "submit": "提交",
        "cancel": "取消",
        "login": "登录",
        "logout": "退出",
        "settings": "设置",
        "dashboard": "仪表盘",
        "privacy": "隐私",
        "terms": "条款",
        "read more": "阅读更多",
        "world": "世界",
    },
    ("en", "zh-tw"): {
        "hello": "你好",
        "hello world": "你好世界",
        "welcome": "歡迎",
        "home": "主頁",
        "about": "關於",
        "contact": "聯繫",
        "services": "服務",
        "language": "語言",
        "search": "搜尋",
        "submit": "提交",
        "cancel": "取消",
        "login": "登錄",
        "logout": "退出",
        "settings": "設定",
        "dashboard": "儀表板",
        "privacy": "隱私",
        "terms": "條款",
        "read more": "閱讀更多",
        "world": "世界",
    },
    ("en", "tr"): {
        "hello": "merhaba",
        "hello world": "merhaba dünya",
        "welcome": "hoş geldiniz",
        "home": "ev",
        "about": "hakkında",
        "contact": "iletişim",
        "services": "hizmetler",
        "language": "dil",
        "search": "arama",
        "submit": "gönder",
        "cancel": "iptal",
        "login": "giriş",
        "logout": "çıkış",
        "settings": "ayarlar",
        "dashboard": "panel",
        "privacy": "gizlilik",
        "terms": "şartlar",
        "read more": "daha fazla oku",
        "world": "dünya",
    },
    ("en", "sv"): {
        "hello": "hej",
        "hello world": "hej världen",
        "welcome": "välkommen",
        "home": "hem",
        "about": "om",
        "contact": "kontakt",
        "services": "tjänster",
        "language": "språk",
        "search": "sök",
        "submit": "skicka",
        "cancel": "avbryt",
        "login": "logga in",
        "logout": "logga ut",
        "settings": "inställningar",
        "dashboard": "instrumentpanel",
        "privacy": "integritet",
        "terms": "villkor",
        "read more": "läs mer",
        "world": "världen",
    },
    ("en", "pl"): {
        "hello": "cześć",
        "hello world": "cześć świecie",
        "welcome": "witamy",
        "home": "strona główna",
        "about": "o",
        "contact": "kontakt",
        "services": "usługi",
        "language": "język",
        "search": "wyszukaj",
        "submit": "prześlij",
        "cancel": "anuluj",
        "login": "zaloguj",
        "logout": "wyloguj",
        "settings": "ustawienia",
        "dashboard": "panel",
        "privacy": "prywatność",
        "terms": "warunki",
        "read more": "czytaj więcej",
        "world": "świat",
    },
    ("en", "ro"): {
        "hello": "salut",
        "hello world": "salut lume",
        "welcome": "bun venit",
        "home": "acasă",
        "about": "despre",
        "contact": "contact",
        "services": "servici",
        "language": "limbă",
        "search": "caută",
        "submit": "trimite",
        "cancel": "anulează",
        "login": "conectare",
        "logout": "deconectare",
        "settings": "setări",
        "dashboard": "tablou de bord",
        "privacy": "confidențialitate",
        "terms": "terme",
        "read more": "citește mai mult",
        "world": "lume",
    },
    ("en", "th"): {
        "hello": "สวัสดี",
        "hello world": "สวัสดีชาวโลก",
        "welcome": "ยินดีต้อนรับ",
        "home": "หน้าหลัก",
        "about": "เกี่ยวกับ",
        "contact": "ติดต่อ",
        "services": "บริการ",
        "language": "ภาษา",
        "search": "ค้นหา",
        "submit": "ส่ง",
        "cancel": "ยกเลิก",
        "login": "เข้าสู่ระบบ",
        "logout": "ออกจากระบบ",
        "settings": "การตั้งค่า",
        "dashboard": "แผงควบคุม",
        "privacy": "ความเป็นส่วนตัว",
        "terms": "ข้อกำหนด",
        "read more": "อ่านเพิ่มเติม",
        "world": "โลก",
    },
    ("en", "vi"): {
        "hello": "xin chào",
        "hello world": "xin chào thế giới",
        "welcome": "chào mừng",
        "home": "trang chủ",
        "about": "về",
        "contact": "liên hệ",
        "services": "dịch vụ",
        "language": "ngôn ngữ",
        "search": "tìm kiếm",
        "submit": "gửi",
        "cancel": "hủy",
        "login": "đăng nhập",
        "logout": "đăng xuất",
        "settings": "cài đặt",
        "dashboard": "bảng điều khiển",
        "privacy": "riêng tư",
        "terms": "điều khoản",
        "read more": "đọc thêm",
        "world": "thế giới",
    },
    ("en", "te"): {
        "hello": "హలో",
        "hello world": "హలో ప్రపంచం",
        "welcome": "స్వాగతం",
        "home": "ముఖ్యపృష్ఠం",
        "about": "గురించి",
        "contact": "సంప్రదించండి",
        "services": "సేవలు",
        "language": "భాష",
        "search": "శోధించండి",
        "submit": "సమర్పించండి",
        "cancel": "రద్దు",
        "login": "లాగిన్",
        "logout": "లాగ్ ఔట్",
        "settings": "సెట్టింగ్స్",
        "dashboard": "డ్యాష్బోర్డ్",
        "privacy": "గోపనీయత",
        "terms": "పదినం",
        "read more": "మరింత చదవండి",
        "world": "ప్రపంచం",
    },
    ("te", "en"): {
        "హలో": "hello",
        "హలో ప్రపంచం": "hello world",
        "స్వాగతం": "welcome",
        "గురించి": "about",
        "భాష": "language",
        "ప్రపంచం": "world",
    },
    ("en", "ml"): {
        "hello": "ഹലോ",
        "hello world": "ഹലോ ലോകം",
        "welcome": "സ്വാഗതം",
        "home": "മുഖ്യപൃക്കരം",
        "about": "കുറിച്ച്",
        "contact": "ബന്ധപ്പെടുക",
        "services": "സേവനങ്ങൾ",
        "language": "ഭാഷ",
        "search": "തിരയുക",
        "submit": "സമർപ്പിക്കുക",
        "cancel": "റദ്ദാക്കുക",
        "login": "ലോഗിൻ",
        "logout": "ലോഗൗട്ട്",
        "settings": "ക്രമീകരണങ്ങൾ",
        "dashboard": "ഡാഷ്ബോർഡ്",
        "privacy": "�്വകാര്യത",
        "terms": "വിധിമുറകൾ",
        "read more": "കൂടുതൽ വായ്ക്കുക",
        "world": "ലോകം",
    },
    ("ml", "en"): {
        "ഹലോ": "hello",
        "ഹലോ ലോകം": "hello world",
        "സ്വാഗതം": "welcome",
        "മുഖ്യപൃക്കരം": "home",
        "ഭാഷ": "language",
        "ലോകം": "world",
    },
    ("en", "kn"): {
        "hello": "ನಮಸ್ಕಾರ",
        "hello world": "ನಮಸ್ಕಾರ ಪ್ರಪಂಚ",
        "welcome": "ಸ್ವಾಗತ",
        "home": "ಮುಂದಿನ",
        "about": "ಬಗ್ಗೆ",
        "contact": "ಸಂಪರ್ಕಿಸಿ",
        "services": "ಸೇವೆಗಳು",
        "language": "ಭಾಷೆ",
        "search": "ಹುಡುಕೆ",
        "submit": "ಸಲ್ಲಿಸಿ",
        "cancel": "ರದ್ದಿಸಿ",
        "login": "ಲಾಗಿನ್",
        "logout": "ಲಾಗ್ ಔಟ್",
        "settings": "ಸೆಟ್ಟಿಂಗ್ಸ್",
        "dashboard": "ಡ್ಯಾಶ್‌ಬೋರ್ಡ್",
        "privacy": "ಗುಪ್ತತೆ",
        "terms": "ಪದಿಣಿ",
        "read more": "ಮತ್ತು ಓದಿ",
        "world": "ಪ್ರಪಂಚ",
    },
    ("kn", "en"): {
        "ನಮಸ್ಕಾರ": "hello",
        "ನಮಸ್ಕಾರ ಪ್ರಪಂಚ": "hello world",
        "ಸ್ವಾಗತ": "welcome",
        "ಭಾಷೆ": "language",
        "ಪ್ರಪಂಚ": "world",
    },
    ("en", "gu"): {
        "hello": "હેલો",
        "hello world": "હેલો વિશ્વ",
        "welcome": "સ્વાગત છે",
        "home": "ઘર",
        "about": "વિશે",
        "contact": "સંપર્ક",
        "services": "સેવાઓ",
        "language": "ભાષા",
        "search": "શોધો",
        "submit": "સબમિટ કરો",
        "cancel": "રદ્દ કરો",
        "login": "લોગિન",
        "logout": "લોગ આઉટ",
        "settings": "સેટિંગ્સ",
        "dashboard": "ડેશબોર્ડ",
        "privacy": "ગુપ્તતા",
        "terms": "શરતો",
        "read more": "વધારે વાંધો",
        "world": "વિશ્વ",
    },
    ("en", "pa"): {
        "hello": "ਹੈਲੋ",
        "hello world": "ਹੈਲੋ ਦੁਨੀਆ",
        "welcome": "ਸੁਆਗਤ ਹੈ",
        "home": "ਘਰ",
        "about": "ਬਾਰੇ",
        "contact": "ਸੰਪਰਕ",
        "services": "ਸੇਵਾਵਾਂ",
        "language": "ਭਾਸ਼ਾ",
        "search": "ਖੋਜੋ",
        "submit": "ਜਮ੍ਹਾਂ ਕਰੋ",
        "cancel": "ਰੱਦ ਕਰੋ",
        "login": "ਲਾਗਇਨ",
        "logout": "ਲੌਗਆਉਟ",
        "settings": "ਸੈਟਿੰਗਸ",
        "dashboard": "ਡੈਸ਼ਬੋਰਡ",
        "privacy": "ਗੁਪਤਤਾ",
        "terms": "ਸ਼ਰਤਾਂ",
        "read more": "ਹੋਰ ਪੜ੍ਹੋ",
        "world": "ਦੁਨੀਆ",
    },
    ("en", "as"): {
        "hello": "হ্যালো",
        "hello world": "হ্যালো বিশ্ব",
        "welcome": "স্বাগত",
        "home": "ঘৰ",
        "about": "বিষয়ৰ পাছত",
        "contact": "যোগাযোগ",
        "services": "সেৱা",
        "language": "ভাষা",
        "search": "বিচাৰা",
        "submit": "জমৱা",
        "cancel": "বিনা",
        "login": "লগইন",
        "logout": "লগআউট",
        "settings": "নিৰ্ধাৰ্য",
        "dashboard": "ড্যাস্ববোৰ্ড",
        "privacy": "গোপনীয়তা",
        "terms": "শৰ্ত",
        "read more": "ক্ৰমে পঢ়ুন",
        "world": "বিশ্ব",
    },
    ("en", "ur"): {
        "hello": "ہیلو",
        "hello world": "ہیلو دنیا",
        "welcome": "خوش آمدید",
        "home": "گھر",
        "about": "کے بارے میں",
        "contact": "رابطہ",
        "services": "خدمات",
        "language": "زبان",
        "search": "تلاش کریں",
        "submit": "جامعہ کریں",
        "cancel": "منسوخ کریں",
        "login": "لاگ ان",
        "logout": "لاگ آؤٹ",
        "settings": "تربیتات",
        "dashboard": "ڈیش بورڈ",
        "privacy": "پرائیویسی",
        "terms": "شرائط",
        "read more": "مزید پڑھیں",
        "world": "دنیا",
    },
    ("en", "ne"): {
        "hello": "नमस्ते",
        "hello world": "नमस्ते संसार",
        "welcome": "स्वागत छ",
        "home": "घर",
        "about": "बारेमा",
        "contact": "सम्पर्क",
        "services": "सेवाहरू",
        "language": "भाषा",
        "search": "खोज्नुहोस्",
        "submit": "पेश गर्नुहोस्",
        "cancel": "रद्द गर्नुहोस्",
        "login": "लगइन",
        "logout": "लग आउट",
        "settings": "सेटिंगहरू",
        "dashboard": "ड्याशबोर्ड",
        "privacy": "गोपनीयता",
        "terms": "सर्तहरू",
        "read more": "थप पढ्नुहोस्",
        "world": "संसार",
    },
    ("en", "mr"): {
        "hello": "नमस्कार",
        "hello world": "नमस्कार जगात",
        "welcome": "स्वागत आहे",
        "home": "मुख्यपृष्ठ",
        "about": "बद्दल",
        "contact": "संपर्क",
        "services": "सेवां",
        "language": "भाषा",
        "search": "शोधा",
        "submit": "सादर करा",
        "cancel": "रद्द करा",
        "login": "लॉगिन",
        "logout": "लॉगआउट",
        "settings": "सेटिंग्ज",
        "dashboard": "डॅशबोर्ड",
        "privacy": "गुप्तता",
        "terms": "नियम",
        "read more": "अधिक वाचा",
        "world": "जगात",
    },
    ("en", "sa"): {
        "hello": "नमस्ते",
        "hello world": "नमस्ते विश्व",
        "welcome": "स्वागतम्",
        "home": "गृहः",
        "about": "बारे",
        "contact": "सम्पर्कः",
        "services": "सेवाः",
        "language": "भाषा",
        "search": "अन्वेषण",
        "submit": "अस्ति",
        "cancel": "रद्द कर",
        "login": "लॉगइन",
        "logout": "विरमणम्",
        "settings": "सेटिंग्स",
        "dashboard": "डॅशबोर्ड",
        "privacy": "गुप्तता",
        "terms": "नियम",
        "read more": "अधिक पठितु",
        "world": "विश्व",
    },
}


class TranslationService:
    """Translate text with resilient free-provider fallback logic."""

    def __init__(self) -> None:
        self._cache: Dict[Tuple[str, str, str], Tuple[str, str]] = {}

    def _normalize_language(self, code: Optional[str], default: str = "en") -> str:
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

    def _coerce_language(self, value: Optional[str], default: str = "en") -> str:
        value = self._normalize_language(value, default)
        return value if value in LANGUAGES else default

    def _detect_language(self, text: str, fallback: str = "en") -> str:
        if not text or not text.strip():
            return fallback
        if detect is not None:
            try:
                detected = detect(text)
            except LangDetectException:
                detected = None
            if detected:
                mapped = self._normalize_language(detected, fallback)
                if mapped in LANGUAGES:
                    return mapped
        if fallback and fallback in LANGUAGES:
            return self._normalize_language(fallback)
        return "en"

    def _dictionary_translate(self, text: str, source_language: str, target_language: str) -> Optional[str]:
        if not text or not text.strip():
            return ""
        source_language = self._coerce_language(source_language, "en")
        target_language = self._coerce_language(target_language, "en")
        if source_language == target_language:
            return text.strip()

        mapping = FALLBACK_TRANSLATIONS.get((source_language, target_language))
        if not mapping:
            return None

        normalized = text.strip()
        lowered = normalized.casefold()
        if lowered in mapping:
            return mapping[lowered]
        if normalized.lower() in mapping:
            return mapping[normalized.lower()]

        # Preserve spaces and punctuation between translated tokens so we don't
        # collapse phrases like "hello world" into "नमस्तेworld".
        words = re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ]+|[\u0900-\u097F\u0B00-\u0B7F\u0B80-\u0BFF\u0980-\u09FF]+|[\u0B00-\u0B7F]+|[^\w\s]", normalized)
        translated_tokens: List[str] = []
        for index, token in enumerate(words):
            token_key = token.casefold()
            translated = mapping.get(token_key, token)
            if index > 0 and translated_tokens and not translated_tokens[-1].endswith(" ") and not token.startswith(" "):
                translated_tokens.append(" ")
            translated_tokens.append(str(translated))

        translated = "".join(translated_tokens)
        if translated.strip() and translated.strip() != normalized:
            return translated.strip()
        return None

    def _live_translate(self, text: str, source_language: str, target_language: str) -> Tuple[Optional[str], Optional[str]]:
        if not text or not text.strip():
            return "", "none"
        source_language = self._coerce_language(source_language, "auto")
        target_language = self._coerce_language(target_language, "en")

        if source_language == "auto":
            source_language = self._detect_language(text, "en")

        # --- IndicTrans2 (self-hosted, free) for Indian language pairs ---
        indic = _get_indic_client()
        if indic is not None and indic.is_available():
            indian_langs = {"en", "hi", "or", "bn", "ta", "te", "mr", "gu",
                           "pa", "as", "kn", "ml", "ur", "ne", "sa"}
            if source_language in indian_langs and target_language in indian_langs:
                result = indic.translate(text, source_language, target_language)
                if result and result.strip():
                    return result.strip(), "indictrans2"

        # --- Bing/Microsoft translator (via translators library) ---
        # Supports all 33 languages including Indic and Asian scripts.
        if _bing_translator is not None:
            try:
                src_code = _to_bing_code(source_language)
                tgt_code = _to_bing_code(target_language)
                translated = tss.translate_text(
                    text, translator="bing",
                    from_language=src_code, to_language=tgt_code,
                )
                if translated and translated.strip():
                    return translated.strip(), "bing"
            except Exception:
                pass

        # --- Google Translate (free, deep-translator) ---
        if not GoogleTranslator:
            return None, "missing"

        try:
            translator = GoogleTranslator(source=source_language, target=target_language)
            translated = translator.translate(text)
            if translated and translated.strip():
                return translated.strip(), "google"
        except Exception:
            try:
                if MyMemoryTranslator is not None:
                    translator = MyMemoryTranslator(source=source_language, target=target_language)
                    translated = translator.translate(text)
                    if translated and translated.strip():
                        return translated.strip(), "mymemory"
            except Exception:
                pass
            return None, "error"
        return None, "error"

    def _indic_available(self) -> bool:
        """Check if IndicTrans2 backend is available and usable."""
        indic = _get_indic_client()
        if indic is None:
            return False
        return indic.is_available()

    def _has_llm_key(self) -> bool:
        return bool(settings.openrouter_api_key or settings.openai_api_key)

    def get_supported_languages(self) -> List[Dict[str, str]]:
        return [
            {"code": code, "name": name, "nativeName": LANGUAGE_NATIVE_NAMES.get(code, name)}
            for code, name in LANGUAGES.items()
        ]

    def get_supported_directions(self) -> Dict[str, List[str]]:
        return {code: sorted(targets) for code, targets in LANGUAGE_PAIRS.items()}

    def health(self) -> Dict[str, Any]:
        indic = _get_indic_client()
        indic_available = indic is not None and indic.is_available()
        providers = {
            "google": bool(GoogleTranslator),
            "mymemory": bool(MyMemoryTranslator),
            "indictrans2": indic_available,
            "bing": _bing_translator is not None,
            "llm": self._has_llm_key(),
        }
        return {
            "status": "ok" if any(providers.values()) else "degraded",
            "available": any(providers.values()),
            "providers": providers,
            "model_version": settings.translation_model_version,
        }

    def translate_text(self, text: str, source_language: Optional[str] = "auto", target_language: str = "en") -> Tuple[Optional[str], str]:
        if text is None:
            return None, "error"
        text = text.strip()
        if not text:
            return "", "none"

        source_language = self._normalize_language(source_language, "auto")
        target_language = self._normalize_language(target_language, "en")

        if source_language == "auto":
            source_language = self._detect_language(text, "en")

        if source_language not in LANGUAGES:
            source_language = self._detect_language(text, "en")

        if target_language not in LANGUAGES:
            return None, "unsupported"

        cache_key = (source_language, target_language, text)
        if cache_key in self._cache:
            return self._cache[cache_key]

        # --- Try the local dictionary first (provides verified translations) ---
        fallback = self._dictionary_translate(text, source_language, target_language)
        if fallback is not None:
            self._cache[cache_key] = (fallback, "local-fallback")
            return fallback, "local-fallback"

        # --- Fall through to live providers (IndicTrans2, Bing, Google, MyMemory) ---
        translated, provider = self._live_translate(text, source_language, target_language)
        if translated is not None and translated.strip():
            self._cache[cache_key] = (translated, provider or "google")
            return translated, provider or "google"

        if source_language == target_language:
            self._cache[cache_key] = (text, "identity")
            return text, "identity"

        return None, "error"

    def translate(
        self,
        source_text: str,
        source_language: Optional[str],
        target_language: str,
        project_id: Optional[str] = None,
        db: Any = None,
        use_cache: bool = True,
    ) -> Tuple[Optional[str], bool, str]:
        if not source_text or not str(source_text).strip():
            return "", False, "none"

        source_language = self._normalize_language(source_language, "auto")
        target_language = self._normalize_language(target_language, "en")
        if source_language == "auto":
            source_language = self._detect_language(source_text, "en")

        if db is not None and project_id and use_cache:
            from ..models import TranslationMemory

            row = db.execute(
                select(TranslationMemory).where(
                    TranslationMemory.project_id == project_id,
                    TranslationMemory.source_text == source_text,
                    TranslationMemory.source_language == source_language,
                    TranslationMemory.target_language == target_language,
                )
            ).scalars().first()
            if row is not None:
                return row.target_text, True, "memory"

        translated, provider = self.translate_text(source_text, source_language, target_language)
        if translated is None:
            return None, False, "error"

        if db is not None and project_id:
            from ..models import TranslationMemory

            existing = db.execute(
                select(TranslationMemory).where(
                    TranslationMemory.project_id == project_id,
                    TranslationMemory.source_text == source_text,
                    TranslationMemory.source_language == source_language,
                    TranslationMemory.target_language == target_language,
                )
            ).scalars().first()
            if existing is None:
                db.add(
                    TranslationMemory(
                        project_id=project_id,
                        source_hash="sha256:" + str(hash(source_text))[:16],
                        source_text=source_text,
                        target_text=translated,
                        source_language=source_language,
                        target_language=target_language,
                        model_version=settings.translation_model_version,
                    )
                )
            else:
                existing.target_text = translated
                existing.model_version = settings.translation_model_version
            db.commit()

        return translated, provider == "memory", provider
