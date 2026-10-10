import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useCallback,
  Dispatch,
  SetStateAction,
} from "react";

interface SearchResult {
  id: string;
  type: "project" | "page" | "segment";
  title: string;
  subtitle?: string;
  href: string;
}

interface SearchContextValue {
  query: string;
  setQuery: (q: string) => void;
  results: SearchResult[];
  setResults: Dispatch<SetStateAction<SearchResult[]>>;
  placeholder: string;
  setPlaceholder: (p: string) => void;
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
}

const SearchContext = createContext<SearchContextValue | undefined>(undefined);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [placeholder, setPlaceholder] = useState("Search...");
  const [isOpen, setIsOpen] = useState(false);

  const ctx: SearchContextValue = {
    query,
    setQuery,
    results,
    setResults,
    placeholder,
    setPlaceholder,
    isOpen,
    setIsOpen,
  };

  return <SearchContext.Provider value={ctx}>{children}</SearchContext.Provider>;
}

export function useSearch() {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error("useSearch must be used within SearchProvider");
  return ctx;
}

export function useGlobalSearch<T>(
  data: T[],
  extractQuery: (item: T, query: string) => boolean,
  toResult: (item: T) => SearchResult,
  enabled: boolean
) {
  const { setResults, setPlaceholder } = useSearch();

  const updateResults = useCallback(
    (q: string) => {
      const matches =
        !enabled || !q.trim()
          ? []
          : data
              .filter((item) => extractQuery(item, q))
              .map(toResult)
              .slice(0, 8);
      setResults((current) => {
        const unchanged =
          current.length === matches.length &&
          current.every(
            (result, index) =>
              result.id === matches[index].id &&
              result.type === matches[index].type &&
              result.title === matches[index].title &&
              result.subtitle === matches[index].subtitle &&
              result.href === matches[index].href
          );
        return unchanged ? current : matches;
      });
    },
    [data, extractQuery, toResult, enabled, setResults]
  );

  return { updateResults };
}
