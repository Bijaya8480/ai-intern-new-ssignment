import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ProjectsApi, PagesApi } from "../services/api";
import type { Page, ProjectStats } from "../types";
import { formatDate } from "../lib/utils";
import {
  Search,
  FileText,
  Globe,
  BarChart3,
  Clock,
  XCircle,
  CheckCircle,
  ChevronUp,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Badge, statusBadgeVariant } from "../components/ui/badge";
import { Skeleton } from "../components/ui/skeleton";
import { EmptyState } from "../components/ui/empty-state";
import { Select } from "../components/ui/select";
import { KPICard } from "../components/ui/kpi-card";
import { StatusIndicator } from "../components/ui/status-indicator";
import { Tooltip } from "../components/ui/tooltip";

interface Filters {
  search: string;
  crawl_status: string;
  translation_status: string;
}

const SORT_FIELDS = [
  { key: "normalized_url", label: "URL" },
  { key: "title", label: "Title" },
  { key: "http_status", label: "HTTP Status" },
  { key: "word_count", label: "Words" },
  { key: "crawl_status", label: "Crawl Status" },
  { key: "translation_status", label: "Translation" },
  { key: "last_crawled_at", label: "Last Crawled" },
];

function SortableTh({
  field,
  label,
  sortField,
  sortOrder,
  onSort,
}: {
  field: string;
  label: string;
  sortField: string;
  sortOrder: "asc" | "desc";
  onSort: (field: string, order: "asc" | "desc") => void;
}) {
  const active = sortField === field;
  return (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none"
      onClick={() => onSort(field, active && sortOrder === "asc" ? "desc" : "asc")}
    >
      <div className="flex items-center gap-1">
        {label}
        {active && (
          sortOrder === "asc" ? (
            <ChevronUp className="h-3 w-3 text-primary" />
          ) : (
            <ChevronDown className="h-3 w-3 text-primary" />
          )
        )}
      </div>
    </th>
  );
}

export default function WebsiteAnalysis() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [pages, setPages] = useState<Page[]>([]);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Filters>({
    search: "",
    crawl_status: "",
    translation_status: "",
  });
  const [sortField, setSortField] = useState("normalized_url");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  const pid = projectId!;

  const loadPages = () => {
    setLoading(true);
    const qs: Record<string, string | number | boolean | undefined> = {
      crawl_status: filters.crawl_status || undefined,
      translation_status: filters.translation_status || undefined,
      search: filters.search || undefined,
      sort: sortField,
      order: sortOrder,
    };
    ProjectsApi.pages(pid, qs)
      .then(setPages)
      .catch(() => setPages([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!projectId) return;
    ProjectsApi.stats(projectId).then(setStats).catch(() => {});
    loadPages();
  }, [projectId, filters, sortField, sortOrder]);

  const toggleSelect = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelected(s);
  };

  const selectAll = () => {
    setSelected(new Set(pages.map((p) => p.id)));
  };

  const deselectAll = () => setSelected(new Set());

  const clearFilters = () => {
    setFilters({ search: "", crawl_status: "", translation_status: "" });
    setSortField("normalized_url");
    setSortOrder("asc");
    setCurrentPage(1);
  };

  const onSort = (field: string, order: "asc" | "desc") => {
    setSortField(field);
    setSortOrder(order);
    setCurrentPage(1);
  };

  const filteredPages = useMemo(() => {
    let result = [...pages];
    result.sort((a, b) => {
      const av = a[sortField as keyof Page];
      const bv = b[sortField as keyof Page];
      if (av === bv) return 0;
      const cmp = String(av).localeCompare(String(bv));
      return sortOrder === "asc" ? cmp : -cmp;
    });
    return result;
  }, [pages, sortField, sortOrder]);

  const totalPages = Math.ceil(filteredPages.length / pageSize);
  const paginatedPages = filteredPages.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const hasIssues = (p: Page) => {
    const issues: string[] = [];
    if (p.crawl_status === "failed") issues.push(p.crawl_error || "Failed");
    if (!p.title) issues.push("Missing title");
    if ((p.word_count || 0) === 0) issues.push("Empty page");
    if (!p.detected_language) issues.push("Language detection failure");
    return issues;
  };

  const bulkTranslate = async () => {
    if (selected.size === 0) return;
    setLoading(true);
    try {
      await PagesApi.bulk(
        Array.from(selected).map((id) => ({
          page_id: id,
          selected_for_translation: true,
        }))
      );
      setSelected(new Set());
      setCurrentPage(1);
      loadPages();
    } finally {
      setLoading(false);
    }
  };

  const allSelected = pages.length > 0 && pages.every((p) => selected.has(p.id));

  const getTranslationStatusType = (status: string) => {
    switch (status) {
      case "approved": return "success";
      case "edited": return "warning";
      case "machine_translated":
      case "partial": return "info";
      case "complete": return "success";
      default: return "pending";
    }
  };

  const getCrawlStatusType = (status: string) => {
    switch (status) {
      case "crawled": return "success";
      case "failed": return "error";
      case "crawling":
      case "running": return "info";
      default: return "pending";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Website Analysis</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {pages.length} pages discovered
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/project/${pid}/dashboard`)}
          >
            ← Dashboard
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/project/${pid}/crawl`)}
          >
            Re-crawl
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="grid grid-cols-2 md:grid-cols-5 gap-4"
        >
          <KPICard
            icon={<FileText className="h-5 w-5 text-primary" />}
            label="Total Pages"
            value={stats.total_pages}
          />
          <KPICard
            icon={<BarChart3 className="h-5 w-5 text-primary" />}
            label="Total Words"
            value={stats.total_words}
            sub={stats.estimated_effort || undefined}
          />
          <KPICard
            icon={<Globe className="h-5 w-5 text-blue-500" />}
            label="Selected"
            value={stats.selected_pages}
          />
          <KPICard
            icon={<Clock className="h-5 w-5 text-amber-500" />}
            label="Translated"
            value={stats.translated_pages}
          />
          <KPICard
            icon={<CheckCircle className="h-5 w-5 text-green-500" />}
            label="Approved"
            value={stats.approved_pages}
          />
        </motion.div>
      )}

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.3 }}
      >
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                <input
                  type="text"
                  placeholder="Search URL or title…"
                  className="w-full pl-10 pr-3 py-2 rounded-lg border border-border bg-muted text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary"
                  value={filters.search}
                  onChange={(e) =>
                    setFilters({ ...filters, search: e.target.value })
                  }
                />
              </div>

              <Select
                value={filters.crawl_status}
                onChange={(e) =>
                  setFilters({ ...filters, crawl_status: e.target.value })
                }
                className="w-44"
              >
                <option value="">All Crawl Statuses</option>
                <option value="crawled">Crawled</option>
                <option value="failed">Failed</option>
                <option value="pending">Pending</option>
              </Select>

              <Select
                value={filters.translation_status}
                onChange={(e) =>
                  setFilters({ ...filters, translation_status: e.target.value })
                }
                className="w-48"
              >
                <option value="">All Translation Statuses</option>
                <option value="not_selected">Not Selected</option>
                <option value="selected">Selected</option>
                <option value="partial">Partial</option>
                <option value="complete">Complete</option>
                <option value="approved">Approved</option>
              </Select>

              {(filters.search || filters.crawl_status || filters.translation_status) && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear Filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Bulk Actions */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.3 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={allSelected ? deselectAll : selectAll}
            disabled={loading}
          >
            {allSelected ? "Deselect All" : "Select All"}
          </Button>
          {selected.size > 0 && (
            <span className="text-sm text-muted-foreground">
              {selected.size} selected
            </span>
          )}
        </div>
        {selected.size > 0 && (
          <Button onClick={bulkTranslate} size="sm" disabled={loading}>
            Mark for Translation
          </Button>
        )}
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.3 }}
      >
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      readOnly
                      onChange={() => {}}
                      className="rounded border-border text-primary focus:ring-primary"
                    />
                  </th>
                  {SORT_FIELDS.map((field) => (
                    <SortableTh
                      key={field.key}
                      field={field.key}
                      label={field.label}
                      sortField={sortField}
                      sortOrder={sortOrder}
                      onSort={onSort}
                    />
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                    Issues
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-4" />
                      </td>
                      {SORT_FIELDS.map((f) => (
                        <td key={f.key} className="px-4 py-3">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      ))}
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-16" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-12 ml-auto" />
                      </td>
                    </tr>
                  ))
                ) : (
                  paginatedPages.map((p) => {
                    const issues = hasIssues(p);
                    return (
                      <tr
                        key={p.id}
                        className="border-b border-border hover:bg-muted/50 transition-colors"
                      >
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={selected.has(p.id)}
                            onChange={() => toggleSelect(p.id)}
                            className="rounded border-border text-primary focus:ring-primary"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-mono text-xs text-muted-foreground truncate max-w-xs">
                            {p.normalized_url.replace(/^.*?\/\/[^/]+/, "")}
                          </div>
                          {p.title && (
                            <div className="text-sm text-foreground mt-0.5 truncate max-w-xs">
                              {p.title}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-foreground">
                            {p.title || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-foreground">
                            {p.http_status || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-foreground">
                            {p.word_count}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-foreground">
                            {formatDate(p.last_crawled_at || "")}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusIndicator
                            status={getCrawlStatusType(p.crawl_status)}
                            label={p.crawl_status}
                            dotOnly
                          />
                        </td>
                        <td className="px-4 py-3">
                          <StatusIndicator
                            status={getTranslationStatusType(p.translation_status)}
                            label={p.translation_status || "pending"}
                            dotOnly
                          />
                        </td>
                        <td className="px-4 py-3">
                          {issues.length > 0 ? (
                            <Tooltip
                              content={issues.join(", ")}
                              side="left"
                              delayMs={300}
                            >
                              <div className="flex items-center gap-1 justify-end">
                                <XCircle className="h-4 w-4 text-destructive" />
                                <span className="text-xs text-muted-foreground">
                                  {issues.length} issue{issues.length > 1 ? "s" : ""}
                                </span>
                              </div>
                            </Tooltip>
                          ) : (
                            <CheckCircle className="h-4 w-4 text-green-500 justify-end ml-auto" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Tooltip content="Edit segments" side="bottom" delayMs={300}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                navigate(`/project/${pid}/edit/${p.id}`)
                              }
                            >
                              Edit
                            </Button>
                          </Tooltip>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-3 border-t border-border flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 1 || loading}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === totalPages || loading}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      </motion.div>

      {/* Empty State */}
      {!loading && pages.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={<FileText className="h-12 w-12" />}
              title="No pages found"
              description={
                filters.search || filters.crawl_status || filters.translation_status
                  ? "Try adjusting your filters"
                  : "Crawl your website to discover pages for translation"
              }
              action={
                filters.search || filters.crawl_status || filters.translation_status
                  ? { label: "Clear Filters", onClick: clearFilters }
                  : { label: "Start Crawling", onClick: () => navigate(`/project/${pid}/crawl`) }
              }
            />
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
