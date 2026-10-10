import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { PagesApi, SegmentsApi, TranslationApi } from "../services/api";
import type { Page, Segment, SegmentTranslateResponse } from "../types";
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
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge, statusBadgeVariant } from "../components/ui/badge";
import { Skeleton } from "../components/ui/skeleton";
import { Modal } from "../components/ui/modal";
import { StatusIndicator } from "../components/ui/status-indicator";
import { Tooltip } from "../components/ui/tooltip";

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

function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard Shortcuts">
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between py-1.5 border-b border-border">
          <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">Ctrl + ←</kbd>
          <span className="text-muted-foreground">Previous segment</span>
        </div>
        <div className="flex items-center justify-between py-1.5 border-b border-border">
          <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">Ctrl + →</kbd>
          <span className="text-muted-foreground">Next segment</span>
        </div>
        <div className="flex items-center justify-between py-1.5 border-b border-border">
          <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">Ctrl + S</kbd>
          <span className="text-muted-foreground">Save current segment</span>
        </div>
        <div className="flex items-center justify-between py-1.5">
          <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">Ctrl + /</kbd>
          <span className="text-muted-foreground">Focus search</span>
        </div>
      </div>
    </Modal>
  );
}

export default function TranslationEditor() {
  const { projectId, pageId } = useParams();
  const navigate = useNavigate();
  const pid = projectId!;
  const [page, setPage] = useState<Page | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [saveState, setSaveState] = useState<Record<string, "idle" | "saving" | "saved">>(
    () => ({})
  );
  const [segmentMeta, setSegmentMeta] = useState<Record<string, SegmentMeta>>(() => ({}));
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const targetRef = useRef<HTMLTextAreaElement>(null);

  const loadSegments = async () => {
    setLoading(true);
    try {
      const segs = await PagesApi.segments(pageId!);
      setSegments(segs);
      if (segs.length > 0) setActiveId(segs[0].id);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!pageId) return;
    PagesApi.get(pageId!).then(setPage).catch(() => {});
    loadSegments();
  }, [projectId, pageId]);

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

  const activeIndex = filteredSegments.findIndex((s) => s.id === activeId);
  const activeSegment = segments.find((s) => s.id === activeId) || filteredSegments[0];

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
        await SegmentsApi.patch(id, {
          target_text: text,
          translation_status: status,
        });
        setSaveState((s) => ({ ...s, [id]: "saved" }));
        setTimeout(() => setSaveState((s) => ({ ...s, [id]: "idle" })), 1500);
      } catch {
        setSaveState((s) => ({ ...s, [id]: "idle" }));
      }
    }, 800);
  };

  const translateAll = async () => {
    setTranslating(true);
    setTranslateError(null);
    try {
      const res: SegmentTranslateResponse[] = await PagesApi.translate(pageId!);
      const errors: string[] = [];
      res.forEach((r) => {
        updateSegment(r.segment_id, {
          target_text: r.target_text,
          translation_status: r.translation_status as Segment["translation_status"],
        });
        setSegmentMeta((prev) => ({
          ...prev,
          [r.segment_id]: { source: r.source, usedMemory: r.used_memory },
        }));
        if (r.source === "error") {
          errors.push(`Segment "${r.target_text}" could not be translated`);
        }
      });
      if (errors.length > 0) {
        setTranslateError(errors.join("; "));
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
      const r = await SegmentsApi.regenerate(id);
      updateSegment(id, {
        target_text: r.target_text,
        translation_status: r.translation_status as Segment["translation_status"] as any,
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

  const aiImprove = async (id: string) => {
    await regenerate(id);
  };

  const approve = async (id: string) => {
    try {
      await SegmentsApi.approve(id);
      updateSegment(id, { translation_status: "approved" });
    } catch (e) {
      console.error(e);
    }
  };

  const copySource = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const navigateSegment = (dir: "prev" | "next") => {
    if (activeIndex < 0) return;
    if (dir === "prev" && activeIndex > 0) {
      setActiveId(filteredSegments[activeIndex - 1].id);
    }
    if (dir === "next" && activeIndex < filteredSegments.length - 1) {
      setActiveId(filteredSegments[activeIndex + 1].id);
    }
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && e.key === "ArrowLeft") {
        e.preventDefault();
        navigateSegment("prev");
      }
      if (isMod && e.key === "ArrowRight") {
        e.preventDefault();
        navigateSegment("next");
      }
      if (isMod && e.key === "s") {
        e.preventDefault();
        if (activeSegment) {
          setSaveState((s) => ({ ...s, [activeSegment.id]: "saved" }));
          setTimeout(
            () => setSaveState((s) => ({ ...s, [activeSegment.id]: "idle" })),
            1000
          );
        }
      }
      if (isMod && e.key === "/") {
        e.preventDefault();
        const searchEl = document.querySelector('input[placeholder="Search segments…"]');
        (searchEl as HTMLInputElement | null)?.focus();
      }
    },
    [activeIndex, filteredSegments, activeSegment]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const total = segments.length;
  const approved = segments.filter((s) => s.translation_status === "approved").length;
  const needsReview = segments.filter((s) => s.translation_status === "edited").length;
  const machineTranslated = segments.filter(
    (s) => s.translation_status === "machine_translated"
  ).length;
  const pending = segments.filter(
    (s) => s.translation_status === "pending" || s.translation_status === "machine_translated"
  ).length;

  if (loading || !page) {
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
      className="flex h-[calc(100vh-8rem)] gap-4"
    >
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* LEFT: Segment Navigation */}
      <div className="w-72 flex-shrink-0 flex flex-col border-r border-border bg-surface">
        {/* Search & Filter */}
        <div className="p-3 border-b border-border space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
            <input
              type="text"
              placeholder="Search segments…"
              className="w-full pl-10 pr-3 py-2 rounded-lg border border-border bg-muted text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {(
              ["all", "pending", "machine_translated", "edited", "approved"] as StatusFilter[]
            ).map((f) => (
              <button
                key={f}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-lg transition-all whitespace-nowrap",
                  statusFilter === f
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
                onClick={() => setStatusFilter(f)}
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
            <div className="py-1">
              {filteredSegments.map((s) => {
                const isActive = activeId === s.id;
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
                      "mx-2 my-1 p-3 rounded-lg cursor-pointer transition-all border group",
                      isActive
                        ? "bg-primary/5 border-primary/30 shadow-sm"
                        : "hover:bg-muted border-transparent"
                    )}
                    onClick={() => setActiveId(s.id)}
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
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-1.5">
                      {s.source_text}
                    </p>
                    {s.target_text && (
                      <p className="text-xs text-foreground/80 line-clamp-1 mb-1.5">
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
                    <div className="mt-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
        <div className="p-3 border-t border-border">
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
          <Button
            size="sm"
            onClick={translateAll}
            disabled={translating || total === 0}
            className="w-full"
            aria-label="Translate all segments"
          >
            {translating ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            {translating ? "Translating…" : "Translate All"}
          </Button>
          {translateError && (
            <div className="mt-2 flex items-start gap-2 text-xs text-destructive">
              <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
              <span>{translateError}</span>
            </div>
          )}
        </div>
      </div>

      {/* CENTER + RIGHT: Editor Panes */}
      <div className="flex-1 flex flex-col min-w-0">
        <AnimatePresence mode="wait">
          {activeSegment ? (
            <motion.div
              key={activeSegment.id}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col"
            >
              {/* Toolbar */}
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => navigateSegment("prev")}
                    disabled={activeIndex <= 0}
                    aria-label="Previous segment"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => navigateSegment("next")}
                    disabled={activeIndex >= filteredSegments.length - 1}
                    aria-label="Next segment"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {activeIndex + 1} of {filteredSegments.length}
                  </span>
                  <button
                    className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShortcutsOpen(true)}
                    aria-label="Keyboard shortcuts"
                  >
                    <HelpCircle className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {saveState[activeSegment.id] === "saving" && (
                    <span className="text-xs text-primary flex items-center gap-1">
                      <Save className="h-3 w-3 animate-pulse" />
                      Saving…
                    </span>
                  )}
                  {saveState[activeSegment.id] === "saved" && (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <Check className="h-3 w-3" />
                      Saved
                    </span>
                  )}
                </div>
              </div>

              {/* Editor Body */}
              <div className="flex-1 flex gap-px bg-border">
                {/* Source Panel */}
                <div className="flex-1 flex flex-col bg-surface p-6 overflow-y-auto">
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="outline" className="text-xs">
                      {activeSegment.element_type || "text"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {activeSegment.source_text.split(/\s+/).length} words
                    </span>
                  </div>
                  <div className="prose prose-sm max-w-none">
                    <pre className="whitespace-pre-wrap text-sm text-foreground font-normal leading-relaxed bg-muted/30 rounded-lg p-5 min-h-[150px]">
                      {activeSegment.source_text}
                    </pre>
                  </div>
                  {activeSegment.element_selector && (
                    <code className="mt-3 text-xs text-muted-foreground/70 break-all bg-muted/30 px-2 py-1 rounded">
                      {activeSegment.element_selector}
                    </code>
                  )}
                </div>

               {/* Target Panel */}
               <div className="flex-1 flex flex-col bg-surface p-6 overflow-y-auto">
                 <div className="flex items-center justify-between mb-3">
                   <div className="flex items-center gap-2">
                     <Badge variant="outline" className="text-xs">
                       Translation
                     </Badge>
                     <SegmentStatusBadge status={activeSegment.translation_status} />
                   </div>
                   {activeSegment.target_text && (
                     <Tooltip content="Copy translation" side="left" delayMs={300}>
                       <Button
                         variant="ghost"
                         size="sm"
                         onClick={() => navigator.clipboard.writeText(activeSegment.target_text!)}
                         aria-label="Copy translation"
                       >
                         <ClipboardCopy className="h-3.5 w-3.5" />
                       </Button>
                     </Tooltip>
                   )}
                 </div>

                 {segmentMeta[activeSegment.id]?.source && (
                   <div className="mb-3 text-xs text-muted-foreground flex items-center gap-1.5">
                     <Languages className="h-3 w-3" />
                     <span>
                       Sourced from:{" "}
                       <code className="text-xs bg-muted/30 px-1.5 py-0.5 rounded">
                         {segmentMeta[activeSegment.id]?.source}
                       </code>
                     </span>
                   </div>
                 )}

                 <textarea
                   ref={targetRef}
                   className={cn(
                     "flex-1 w-full text-sm text-foreground bg-surface border border-border rounded-lg px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary min-h-[150px] font-normal leading-relaxed",
                     activeSegment.translation_status === "approved"
                       ? "bg-green-500/5 border-green-200 dark:border-green-900/30"
                       : ""
                   )}
                   value={activeSegment.target_text || ""}
                   onChange={(e) =>
                     handleTextChange(activeSegment.id, e.target.value)
                   }
                   placeholder="Enter translation…"
                 />

                  {/* Translation memory suggestion */}
                  {segmentMeta[activeSegment.id]?.usedMemory && (
                    <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
                      <div className="h-1 w-1 rounded-full bg-green-500" />
                      <span>Translation sourced from translation memory</span>
                    </div>
                  )}

                  {activeSegment.translation_status === "pending" &&
                    !activeSegment.target_text && (
                      <div className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                        <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>
                          No translation yet. Click "AI Improve" to generate, or
                          translate manually below.
                        </span>
                      </div>
                    )}
                </div>
              </div>

               {/* Action Bar */}
               <div className="p-4 border-t border-border flex items-center justify-between">
                 <div className="flex items-center gap-2">
                   <Tooltip content="Regenerate translation" side="top" delayMs={300}>
                     <Button
                       variant="outline"
                       size="sm"
                       onClick={() => regenerate(activeSegment.id)}
                     >
                       <RefreshCw className="h-4 w-4" />
                       Regenerate
                     </Button>
                   </Tooltip>
                   <Tooltip content="AI improve translation" side="top" delayMs={300}>
                     <Button
                       variant="outline"
                       size="sm"
                       onClick={() => aiImprove(activeSegment.id)}
                     >
                       <Sparkles className="h-4 w-4" />
                       AI Improve
                     </Button>
                   </Tooltip>
                   <Tooltip content="Copy source text" side="top" delayMs={300}>
                     <Button
                       variant="ghost"
                       size="sm"
                       onClick={() => copySource(activeSegment.source_text)}
                       aria-label="Copy source text"
                     >
                       <Copy className="h-4 w-4" />
                       Copy Source
                     </Button>
                   </Tooltip>
                   <Tooltip
                     content={
                       activeSegment.translation_status === "approved"
                         ? "Translation is approved"
                         : "Approve translation"
                     }
                     side="top"
                     delayMs={300}
                   >
                      <Button
                        variant={
                          activeSegment.translation_status === "approved"
                            ? "outline"
                            : "primary"
                        }
                       size="sm"
                       onClick={() => approve(activeSegment.id)}
                       disabled={
                         activeSegment.translation_status === "approved" ||
                         !activeSegment.target_text
                       }
                       className={
                         activeSegment.translation_status === "approved"
                           ? "border-green-200 dark:border-green-900/30 text-green-600"
                           : ""
                       }
                     >
                       {activeSegment.translation_status === "approved" ? (
                         <CheckCircle className="h-4 w-4 text-green-500" />
                       ) : (
                         <Check className="h-4 w-4" />
                       )}
                       {activeSegment.translation_status === "approved"
                         ? "Approved"
                         : "Approve"}
                     </Button>
                   </Tooltip>
                 </div>
                 <Button
                   variant="ghost"
                   size="sm"
                   onClick={() => navigate(`/project/${pid}/pages`)}
                 >
                   Back to Pages
                 </Button>
               </div>
            </motion.div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-muted-foreground">
                Select a segment to start translating.
              </p>
            </div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
