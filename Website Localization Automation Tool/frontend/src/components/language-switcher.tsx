import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { Check, Languages, Loader2, RotateCcw, Search, AlertCircle, Wifi, Globe } from "lucide-react";
import { TranslationApi } from "../services/api";
import type { TranslationLanguageInfo, TranslationHealthResponse } from "../types";
import { Button } from "./ui/button";
import { LANGUAGES } from "../constants/languages";

const STORAGE_KEY = "loctool_language_preference";

const FALLBACK_LANGUAGES: TranslationLanguageInfo[] = LANGUAGES.map((l) => ({
  code: l.code,
  name: l.name,
  nativeName: l.nativeName,
}));

const RTL_LANGUAGES = new Set(["ar", "ur", "fa", "he"]);

export function LanguageSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string>(() => {
    if (typeof window === "undefined") return "en";
    return localStorage.getItem(STORAGE_KEY) || "en";
  });
  const [languages, setLanguages] = useState<TranslationLanguageInfo[]>(FALLBACK_LANGUAGES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<TranslationHealthResponse | null>(null);
  const [fetching, setFetching] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load supported languages and health from backend
  useEffect(() => {
    let alive = true;
    setFetching(true);
    setError(null);

    Promise.all([
      TranslationApi.languages().catch(() => null),
      TranslationApi.health().catch(() => null),
    ])
      .then(([langData, healthData]) => {
        if (!alive) return;
        setFetching(false);
        if (langData && Array.isArray(langData.languages) && langData.languages.length > 0) {
          setLanguages(langData.languages);
        } else {
          setLanguages(FALLBACK_LANGUAGES);
        }
        if (healthData) setHealth(healthData);
      })
      .catch(() => {
        if (alive) {
          setFetching(false);
          setLanguages(FALLBACK_LANGUAGES);
          setError("Could not load language data");
        }
      });

    return () => {
      alive = false;
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Set document language and direction
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = selected;
      document.documentElement.dir = RTL_LANGUAGES.has(selected) ? "rtl" : "ltr";
    }
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, selected);
    }
  }, [selected]);

  const filteredLanguages = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return languages;
    return languages.filter((lang) => {
      const haystack = `${lang.name || ""} ${lang.nativeName || ""} ${lang.code}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [languages, search]);

  const active = useMemo(() => {
    return languages.find((lang) => lang.code === selected) || FALLBACK_LANGUAGES.find((l) => l.code === "en") || FALLBACK_LANGUAGES[0];
  }, [languages, selected]);

  const handleSelect = useCallback(
    async (code: string) => {
      if (!code || code === selected) {
        setIsOpen(false);
        return;
      }

      // Verify the language is supported by the backend
      const langExists = languages.some((lang) => lang.code === code);
      if (!langExists) {
        setError(`Language "${code}" is not supported`);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        // Verify the language is supported by attempting a translation.
        // If it fails, we still save the selection since the fallback
        // dictionary may handle the actual page content.
        await TranslationApi.translate("hello", "en", code);
        setSelected(code);
      } catch (err: any) {
        setSelected(code);
        setError(
          err?.message ||
            "Translation service unavailable. Selection saved — content will use cached translations."
        );
      } finally {
        setLoading(false);
        setIsOpen(false);
      }
    },
    [selected, languages],
  );

  const resetLanguage = () => {
    setSelected("en");
    setError(null);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setIsOpen((prev) => !isOpen)}
        className="gap-2"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <Languages className="h-4 w-4" />
        <span className="max-w-[110px] truncate" title={active?.name || "English"}>
          {active?.nativeName || active?.name || "English"}
        </span>
        <span className="sr-only">Change language</span>
      </Button>

      {isOpen && (
        <>
          {/* Backdrop for mobile */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 top-14 z-50 w-[340px] max-w-[90vw] rounded-xl border border-border bg-surface shadow-lg">
          {/* Search */}
          <div className="border-b border-border p-2">
            <div className="flex items-center gap-2 rounded-lg bg-muted px-2 py-2 text-sm text-muted-foreground">
              <Search className="h-4 w-4" />
              <input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search languages"
                className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
                aria-label="Search languages"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="rounded p-0.5 hover:bg-muted-foreground/20"
                  aria-label="Clear search"
                >
                  <span className="text-xs">✕</span>
                </button>
              )}
            </div>
          </div>

          {/* Language list */}
          <div className="max-h-[320px] overflow-y-auto p-2">
            {fetching && (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading languages…
              </div>
            )}

            {!fetching && filteredLanguages.length === 0 ? (
              <div className="px-2 py-4 text-sm text-muted-foreground">
                No matching languages found.
              </div>
            ) : (
              filteredLanguages.map((lang) => {
                const isSelected = lang.code === selected;
                const isRTL = lang.code ? RTL_LANGUAGES.has(lang.code) : false;
                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => handleSelect(lang.code)}
                    disabled={loading}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50"
                    role="option"
                    aria-selected={isSelected}
                  >
                    <div className={isRTL ? "text-right" : ""}>
                      <div className="font-medium">{lang.nativeName || lang.name}</div>
                      <div className="text-xs text-muted-foreground">{lang.name}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isSelected && <Check className="h-4 w-4 text-primary" />}
                      {lang.code && (
                        <span className="text-xs text-muted-foreground/50">{lang.code.toLowerCase()}</span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="border-t border-border px-3 py-2 text-xs text-amber-600">
              <div className="flex items-start gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            </div>
          )}

          {/* Loading indicator for translation check */}
          {loading && (
            <div className="flex items-center gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Verifying translation capability…
            </div>
          )}

          {/* Reset button */}
          <div className="border-t border-border p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetLanguage}
              className="w-full justify-center gap-2"
              disabled={loading}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restore original language
            </Button>
          </div>

          {/* Health indicator */}
          {health && (
            <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                {health.available ? (
                  <Wifi className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                )}
                <span>
                  {health.available ? "Translation active" : "Translation unavailable"}
                </span>
              </div>
              <span className="text-muted-foreground/60">
                Model: {health.model_version || "default"}
              </span>
            </div>
          )}
          </div>
        </>
      )}
    </div>
  );
}

export function getSelectedLanguage(): string {
  if (typeof window === "undefined") return "en";
  return localStorage.getItem(STORAGE_KEY) || "en";
}

export function setSelectedLanguage(lang: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = RTL_LANGUAGES.has(lang) ? "rtl" : "ltr";
}
