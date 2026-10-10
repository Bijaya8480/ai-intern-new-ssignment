export interface Language {
  code: string;
  name: string;
  nativeName: string;
  flag?: string;
}

export const LANGUAGES: Language[] = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "hi", name: "Hindi", nativeName: "हिंदी" },
  { code: "or", name: "Odia", nativeName: "ଓଡ଼ିଆ" },
  { code: "bn", name: "Bengali", nativeName: "বাংলা" },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்" },
  { code: "te", name: "Telugu", nativeName: "తెలుగు" },
  { code: "mr", name: "Marathi", nativeName: "मराठी" },
  { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" },
  { code: "pa", name: "Punjabi", nativeName: "ਪੰਜਾਬੀ" },
  { code: "as", name: "Assamese", nativeName: "অসমীয়া" },
  { code: "kn", name: "Kannada", nativeName: "ಕನ್ನಡ" },
  { code: "ml", name: "Malayalam", nativeName: "മലയാളം" },
  { code: "ur", name: "Urdu", nativeName: "اردو" },
  { code: "ne", name: "Nepali", nativeName: "नेपाली" },
  { code: "sa", name: "Sanskrit", nativeName: "संस्कृत" },
  { code: "es", name: "Spanish", nativeName: "Español" },
  { code: "fr", name: "French", nativeName: "Français" },
  { code: "de", name: "German", nativeName: "Deutsch" },
  { code: "ar", name: "Arabic", nativeName: "العربية" },
  { code: "it", name: "Italian", nativeName: "Italiano" },
  { code: "pt", name: "Portuguese", nativeName: "Português" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands" },
  { code: "ru", name: "Russian", nativeName: "Русский" },
  { code: "ja", name: "Japanese", nativeName: "日本語" },
  { code: "ko", name: "Korean", nativeName: "한국어" },
  { code: "zh-cn", name: "Chinese (Simplified)", nativeName: "简体中文" },
  { code: "zh-tw", name: "Chinese (Traditional)", nativeName: "繁體中文" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe" },
  { code: "sv", name: "Swedish", nativeName: "Svenska" },
  { code: "pl", name: "Polish", nativeName: "Polski" },
  { code: "ro", name: "Romanian", nativeName: "Română" },
  { code: "th", name: "Thai", nativeName: "ไทย" },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt" },
];

// Default source language for the application
export const DEFAULT_SOURCE_LANGUAGE = "en";

// The base language code (without regional suffix)
export function langPrefix(code?: string): string {
  if (!code) return "";
  return code.toLowerCase().split("-")[0];
}

// Normalize a language code (lowercase, underscores to hyphens)
export function normalizeLang(code?: string): string {
  if (!code) return "";
  const normalized = code.toLowerCase().replace(/_/g, "-");
  if (normalized === "zh") return "zh-cn";
  return normalized;
}

// Look up the display name for a language code
export function langName(code?: string): string {
  if (!code) return "";
  const found = LANGUAGES.find(
    (l) => l.code.toLowerCase() === code.toLowerCase()
  );
  return found ? found.name : code.toUpperCase();
}

// Look up the native name for a language code
export function langNativeName(code?: string): string {
  if (!code) return "";
  const found = LANGUAGES.find(
    (l) => l.code.toLowerCase() === code.toLowerCase()
  );
  return found ? found.nativeName : code.toUpperCase();
}

// Find a language object by code
export function findLanguage(code?: string): Language | undefined {
  if (!code) return undefined;
  return LANGUAGES.find(
    (l) => l.code.toLowerCase() === code.toLowerCase()
  );
}
