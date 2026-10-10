import { useEffect, useRef } from "react";
import { cn } from "../lib/utils";
import { Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSearch } from "../lib/search-context";

export function GlobalSearch() {
  const { query, setQuery, results, isOpen, setIsOpen, placeholder } =
    useSearch();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [setIsOpen]);

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, []);

  const handleSelect = (result: any) => {
    setQuery("");
    setIsOpen(false);
    navigate(result.href);
  };

  return (
    <div ref={containerRef} className="relative w-72">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          className={cn(
            "w-full rounded-lg border border-border bg-muted px-3 py-2 pl-10 text-sm",
            "text-foreground placeholder:text-muted-foreground/60",
            "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent",
            "transition-all duration-200"
          )}
          aria-label="Global search"
          aria-expanded={isOpen}
          aria-autocomplete="list"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted-foreground/20"
            aria-label="Clear search"
          >
            <X className="h-3 w-3" />
          </button>
        )}
        <kbd className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
          <span className="sr-only">Ctrl</span>
        </kbd>
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute top-full mt-1 w-full rounded-lg border border-border bg-surface shadow-subtle-lg py-1 max-h-80 overflow-y-auto z-50">
          {results.map((result) => (
            <button
              key={result.id}
              onClick={() => handleSelect(result)}
              className="w-full px-3 py-2 text-left hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                  {result.type}
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium text-foreground truncate">
                    {result.title}
                  </span>
                  {result.subtitle && (
                    <span className="text-xs text-muted-foreground truncate">
                      {result.subtitle}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
