import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ProjectsApi, SegmentsApi, TranslationApi } from "../services/api";
import type { Project, Segment, TranslationLanguageInfo } from "../types";
import { cn } from "../lib/utils";
import {
  Search,
  Check,
  RefreshCw,
  Copy,
  Zap,
  Sparkles,
  AlertCircle,
  FileText,
  ChevronLeft,
  ChevronRight,
  Save,
  HelpCircle,
  ExternalLink,
  Trash2,
  Hash,
  Clock,
  Languages,
  ClipboardCopy,
  CheckCircle,
  Filter,
  X,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge, statusBadgeVariant } from "../components/ui/badge";
import { Skeleton } from "../components/ui/skeleton";
import { Modal } from "../components/ui/modal";
import { StatusIndicator } from "../components/ui/status-indicator";
import { Tooltip } from "../components/ui/tooltip";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";

type StatusFilter = "all" | "pending" | "machine_translated" | "edited" | "approved";

interface SegmentMeta {
  source?: string;
  usedMemory?: boolean;
}

const statusLabels: Record<string, string> = {
  approved: "Approved",
  edited: "Needs Review",
  machine_translated: "Machine",
  pending: "Not translated",
};

function SegmentStatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    approved: "Approved",
    edited: "Needs Review",
    machine_translated: "Machine-translated",
    pending: "Pending",
  };
  return (
    <Badge variant={statusBadgeVariant(status)} className="text-xs">
      {labels[status] || status.replace("_", " ")}
    </Badge>
  );
}

export default function TranslationReview() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const pid = projectId!;
  const [project, setProject] = useState<Project | null>(null);
  const [languages, setLanguages] = useState<TranslationLanguageInfo[]>([]);
  const [targetLanguage, setTargetLanguage] = useState("");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [saveState, setSaveState] = useState<Record<string, "idle" | "saving" | "saved" | "error">>(
    () => ({})
  );
  const [segmentMeta, setSegmentMeta] = useState<Record<string, SegmentMeta>>(() => ({}));
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const loadSegments = async () => {
    setLoading(true);
    try {
      const segs = await SegmentsApi.projectSegments(pid, {
        status: statusFilter !== "all" ? statusFilter : undefined,
        search: searchQuery || undefined,
        targetLanguage: targetLanguage || undefined,
      });
      setSegments(segs);
      setActiveSegmentId((current) =>
        current && segs.some((segment) => segment.id === current)
          ? current
          : segs[0]?.id || null
      );
    } catch (e) {
      console.error(e);
      setTranslateError(e instanceof Error ? e.message : "Failed to load translations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!projectId) return;
    ProjectsApi.get(projectId)
      .then((loadedProject) => {
        setProject(loadedProject);
        setTargetLanguage(loadedProject.target_language);
      })
      .catch((error) => {
        setTranslateError(error instanceof Error ? error.message : "Failed to load project");
      });
    TranslationApi.languages()
      .then((response) => setLanguages(response.languages))
      .catch((error) => {
        setTranslateError(error instanceof Error ? error.message : "Failed to load languages");
      });
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !targetLanguage) return;
    loadSegments();
  }, [projectId, statusFilter, searchQuery, targetLanguage]);

  useEffect(
    () => () => {
      Object.values(debounceRef.current).forEach(clearTimeout);
    },
    []
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
    },
    []
  );

  const handleFilterChange = useCallback(
    (value: string) => {
      setStatusFilter(value as StatusFilter);
    },
    []
  );

  const filteredSegments = segments.filter((s) => {
    if (statusFilter !== "all" && s.translation_status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        s.source_text.toLowerCase().includes(q) ||
        (s.target_text || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const updateSegment = (id: string, updates: Partial<Segment>) => {
    setSegments((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  };

  const handleTextChange = (id: string, text: string) => {
    const trimmed = text.trim();
    const status = trimmed ? "edited" : "pending";
    updateSegment(id, { target_text: text, translation_status: status });
    setSaveState((s) => ({ ...s, [id]: "saving" }));
    clearTimeout(debounceRef.current[id]);
    debounceRef.current[id] = setTimeout(async () => {
      try {
        await SegmentsApi.patchTranslation(id, targetLanguage, {
          target_text: text,
          translation_status: status,
        });
        setSaveState((s) => ({ ...s, [id]: "saved" }));
        setTimeout(() => setSaveState((s) => ({ ...s, [id]: "idle" })), 1500);
      } catch {
        setSaveState((s) => ({ ...s, [id]: "error" }));
      }
    }, 800);
  };

  const translateAll = async () => {
    setTranslating(true);
    setTranslateError(null);
    try {
      const results = await SegmentsApi.translateProject(pid, targetLanguage);
      const errors = results.filter((result) => result.source === "error").length;
      await loadSegments();
      if (errors) {
        setTranslateError(`${errors} segment${errors === 1 ? "" : "s"} could not be translated.`);
      }
    } catch (e: any) {
      console.error(e);
      setTranslateError(e.message || "Translation failed");
    } finally {
      setTranslating(false);
    }
  };

  const regenerate = async (id: string) => {
    try {
      const r = await SegmentsApi.regenerate(id, targetLanguage);
      updateSegment(id, {
        target_text: r.target_text,
        translation_status: r.translation_status as Segment["translation_status"],
      });
      setSegmentMeta((prev) => ({
        ...prev,
        [id]: { source: r.source, usedMemory: r.used_memory },
      }));
      if (r.source === "error") {
        alert("Translation failed: " + r.target_text);
      }
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Regeneration failed");
    }
  };

  const approve = async (id: string) => {
    try {
      await SegmentsApi.approve(id, targetLanguage);
      updateSegment(id, { translation_status: "approved" });
    } catch (e) {
      console.error(e);
      setTranslateError(e instanceof Error ? e.message : "Could not approve translation");
    }
  };

  const copySource = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const total = segments.length;
  const approved = segments.filter((s) => s.translation_status === "approved").length;
  const needsReview = segments.filter((s) => s.translation_status === "edited").length;
  const machineTranslated = segments.filter(
    (s) => s.translation_status === "machine_translated"
  ).length;
  const pending = segments.filter(
    (s) => s.translation_status === "pending" || s.translation_status === "machine_translated"
  ).length;
  const targetLanguageName =
    languages.find((language) => language.code === targetLanguage)?.nativeName ||
    languages.find((language) => language.code === targetLanguage)?.name ||
    targetLanguage;
  const sourceLanguageName =
    languages.find((language) => language.code === project?.source_language)?.name ||
    project?.source_language_name ||
    project?.source_language ||
    "Source";

  if (loading || !project) {
    return (
      <div className="flex h-[calc(100vh-8rem)] gap-4">
        <div className="w-72 flex-shrink-0 border-r border-border bg-surface">
          <div className="p-3 border-b border-border space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
          <div className="p-2 space-y-1 overflow-y-auto">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>
        <div className="flex-1">
          <Skeleton className="h-full w-full" />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex min-h-[calc(100vh-8rem)] flex-col gap-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-blue-700">
            <span className="h-2 w-2 rounded-full bg-blue-600" />
            Localization workspace
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
            Translation review
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Review content for <span className="font-medium text-slate-700">{project.name}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {project.source_url && (
            <a
              href={project.source_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              <ExternalLink className="h-4 w-4" />
              Visit website
            </a>
          )}
          <Button
            size="md"
            onClick={translateAll}
            disabled={translating || total === 0 || !targetLanguage}
            className="h-10 rounded-xl bg-blue-600 px-4 shadow-md shadow-blue-600/15 hover:bg-blue-700"
          >
            {translating ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            {translating ? "Translating…" : `Translate to ${targetLanguageName}`}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Total segments", value: total, icon: FileText, tone: "text-slate-700 bg-slate-100" },
          { label: "Needs review", value: needsReview, icon: AlertCircle, tone: "text-amber-700 bg-amber-50" },
          { label: "Machine translated", value: machineTranslated, icon: Sparkles, tone: "text-blue-700 bg-blue-50" },
          { label: "Approved", value: approved, icon: CheckCircle, tone: "text-emerald-700 bg-emerald-50" },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.02]">
            <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", tone)}>
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <div>
              <div className="text-xl font-semibold tracking-tight text-slate-900">{value}</div>
              <div className="text-xs font-medium text-slate-500">{label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex min-h-[580px] flex-1 flex-col gap-4 xl:flex-row">
      {/* LEFT: Segment Navigation */}
      <aside className="flex w-full flex-shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm shadow-slate-900/[0.025] xl:w-[310px]">
        {/* Search & Filter */}
        <div className="space-y-3 border-b border-slate-100 p-4">
          <Input
            label="Find a segment"
            placeholder="Search segments…"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          <div className="flex flex-wrap gap-1">
            {(
              ["all", "pending", "machine_translated", "edited", "approved"] as StatusFilter[]
            ).map((f) => (
              <button
                key={f}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-[11px] font-medium capitalize transition-all whitespace-nowrap",
                  statusFilter === f
                    ? "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                )}
                onClick={() => handleFilterChange(f)}
              >
                {f === "all" ? "All" : f === "machine_translated" ? "Machine" : f.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>

        {/* Segment List */}
        <div className="flex-1 overflow-y-auto">
          {filteredSegments.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No segments match your filter.
            </div>
          ) : (
            <div className="space-y-1.5 p-2">
              {filteredSegments.map((s) => {
                const meta = segmentMeta[s.id];
                const progress =
                  s.target_text && s.target_text.trim()
                    ? s.translation_status === "approved"
                      ? 100
                      : s.translation_status === "edited"
                      ? 75
                      : 50
                    : 0;
                return (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={cn(
                      "group cursor-pointer rounded-xl border p-3.5 transition-all",
                      activeSegmentId === s.id
                        ? "border-blue-200 bg-blue-50/60 shadow-sm shadow-blue-900/5"
                        : "border-transparent hover:border-slate-200 hover:bg-slate-50"
                    )}
                    onClick={() => {
                      setActiveSegmentId(s.id);
                      document.getElementById(`review-segment-${s.id}`)?.scrollIntoView({
                        behavior: "smooth",
                        block: "nearest",
                      });
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <SegmentStatusBadge status={s.translation_status} />
                      {meta?.usedMemory && (
                        <Badge variant="outline" className="text-xs">
                          <Zap className="h-3 w-3" />
                          from memory
                        </Badge>
                      )}
                    </div>
                    <p className="mb-1.5 line-clamp-2 text-[13px] leading-5 text-slate-600">
                      {s.source_text}
                    </p>
                    {s.target_text && (
                      <p className="mb-1.5 line-clamp-1 text-xs text-slate-800">
                        {s.target_text}
                      </p>
                    )}
                    {progress > 0 && (
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-1">
                      <Badge
                        variant={statusBadgeVariant(s.translation_status)}
                        className="text-xs"
                      >
                        {progress}% complete
                      </Badge>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Stats + Actions */}
        <div className="border-t border-slate-100 bg-slate-50/70 p-4">
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground mb-2">
            <span>Total: {total}</span>
            <div className="flex gap-3">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                {approved}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                {needsReview}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                {machineTranslated}
              </span>
            </div>
          </div>
          {translateError && (
            <div className="mt-2 flex items-start gap-2 text-xs text-destructive">
              <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
              <span>{translateError}</span>
            </div>
          )}
        </div>
      </aside>

      {/* RIGHT: Bulk Editor */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm shadow-slate-900/[0.025]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-slate-900">Review queue</h2>
            <p className="mt-1 text-xs text-slate-500">
              Review and edit {sourceLanguageName} → {targetLanguageName} translations.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div className="w-56">
              <label htmlFor="review-target-language" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Target language
              </label>
              <Select
                id="review-target-language"
                aria-label="Select target language for review"
                value={targetLanguage}
                onChange={(event) => {
                  setTranslateError(null);
                  setTargetLanguage(event.target.value);
                }}
                disabled={translating}
              >
                {languages.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.nativeName || language.name} ({language.name})
                  </option>
                ))}
                {project && !languages.some((language) => language.code === project.target_language) && (
                  <option value={project.target_language}>
                    {project.target_language_name || project.target_language}
                  </option>
                )}
              </Select>
            </div>
            <Button
              size="sm"
              onClick={translateAll}
              disabled={translating || total === 0 || !targetLanguage}
              aria-label={`Translate selected pages to ${targetLanguageName}`}
            >
              {translating ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              {translating ? "Translating…" : "Translate"}
            </Button>
          </div>
        </div>

        {filteredSegments.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-muted-foreground">
              {searchQuery || statusFilter !== "all"
                ? "No segments match your filter."
                : "No segments found. Translate pages first."}
            </p>
          </div>
        ) : (
          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-4 lg:p-5">
            {filteredSegments.map((s) => {
              const meta = segmentMeta[s.id];
              return (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  id={`review-segment-${s.id}`}
                  className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.025] sm:p-5"
                >
                  <div className="flex items-start gap-4 mb-3">
                    <div className="flex-shrink-0 w-10 text-center">
                      <SegmentStatusBadge status={s.translation_status} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">
                          {s.element_type || "text"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {s.source_text.split(/\s+/).length} words
                        </span>
                        {meta?.usedMemory && (
                          <Badge variant="outline" className="text-xs">
                            <Zap className="h-3 w-3" />
                            from memory
                          </Badge>
                        )}
                      </div>
                      <div className="prose prose-sm max-w-none">
                        <pre className="whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm font-normal leading-relaxed text-slate-800">
                          {s.source_text}
                        </pre>
                      </div>
                      {s.element_selector && (
                        <code className="mt-2 text-xs text-muted-foreground/70 break-all bg-muted/30 px-2 py-1 rounded">
                          {s.element_selector}
                        </code>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-xs">Translation</Badge>
                    <SegmentStatusBadge status={s.translation_status} />
                    {s.target_text && (
                      <Tooltip content="Copy translation" side="right" delayMs={300}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigator.clipboard.writeText(s.target_text!)}
                          aria-label="Copy translation"
                        >
                          <ClipboardCopy className="h-3.5 w-3.5" />
                        </Button>
                      </Tooltip>
                    )}
                  </div>

                  {meta?.source && (
                    <div className="mb-3 text-xs text-muted-foreground flex items-center gap-1.5">
                      <Languages className="h-3 w-3" />
                      <span>
                        Sourced from:{" "}
                        <code className="text-xs bg-muted/30 px-1.5 py-0.5 rounded">
                          {meta.source}
                        </code>
                      </span>
                    </div>
                  )}

                  <textarea
                    className={cn(
                      "min-h-[92px] w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100",
                      s.translation_status === "approved"
                        ? "border-emerald-200 bg-emerald-50/40"
                        : ""
                    )}
                    value={s.target_text || ""}
                    onChange={(e) => handleTextChange(s.id, e.target.value)}
                    placeholder="Enter translation…"
                  />
                  <div className="mt-1 min-h-5 text-xs text-muted-foreground" role="status" aria-live="polite">
                    {saveState[s.id] === "saving" && "Saving translation…"}
                    {saveState[s.id] === "saved" && "Translation saved"}
                    {saveState[s.id] === "error" && (
                      <span className="text-destructive">Save failed. Your edit is still in this form; edit again to retry.</span>
                    )}
                  </div>

                  {meta?.usedMemory && (
                    <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
                      <div className="h-1 w-1 rounded-full bg-green-500" />
                      <span>Translation sourced from translation memory</span>
                    </div>
                  )}

                  {s.translation_status === "pending" &&
                    !s.target_text && (
                      <div className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                        <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>
                          No translation yet. Click "Regenerate" to generate, or
                          translate manually below.
                        </span>
                      </div>
                    )}

                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                    <Tooltip content="Regenerate translation" side="top" delayMs={300}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => regenerate(s.id)}
                      >
                        <RefreshCw className="h-4 w-4" />
                        Regenerate
                      </Button>
                    </Tooltip>
                    <Tooltip content="AI improve translation" side="top" delayMs={300}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => regenerate(s.id)}
                      >
                        <Sparkles className="h-4 w-4" />
                        AI Improve
                      </Button>
                    </Tooltip>
                    <Tooltip content="Copy source text" side="top" delayMs={300}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copySource(s.source_text)}
                        aria-label="Copy source text"
                      >
                        <Copy className="h-4 w-4" />
                        Copy Source
                      </Button>
                    </Tooltip>
                    <Tooltip
                      content={
                        s.translation_status === "approved"
                          ? "Translation is approved"
                          : "Approve translation"
                      }
                      side="top"
                      delayMs={300}
                    >
                      <Button
                        variant={
                          s.translation_status === "approved" ? "outline" : "primary"
                        }
                        size="sm"
                        onClick={() => approve(s.id)}
                        disabled={
                          s.translation_status === "approved" ||
                          !s.target_text ||
                          saveState[s.id] === "saving"
                        }
                        className={
                          s.translation_status === "approved"
                            ? "border-green-200 dark:border-green-900/30 text-green-600"
                            : ""
                        }
                      >
                        {s.translation_status === "approved" ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        {s.translation_status === "approved" ? "Approved" : "Approve"}
                      </Button>
                    </Tooltip>
                    <span className="flex-1" />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/project/${pid}/edit/${s.page_id}`)}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open in Editor
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>
      </div>
    </motion.div>
  );
}