import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ProjectsApi } from "../services/api";
import type { Project, ProjectStats, Page } from "../types";
import { cn, formatDate } from "../lib/utils";
import {
  Globe,
  BarChart3,
  CheckCircle,
  Clock,
  FileText,
  ExternalLink,
  Rocket,
  Send,
  Languages,
  ChevronRight,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Skeleton } from "../components/ui/skeleton";
import { Progress } from "../components/ui/progress";
import { EmptyState } from "../components/ui/empty-state";
import { statusBadgeVariant } from "../components/ui/badge";

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-muted rounded-lg">{icon}</div>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            {sub && <p className="text-xs text-muted-foreground/70 mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const WORKFLOW_STEPS = [
  { key: "url", label: "URL Entered", icon: Send },
  { key: "crawl", label: "Crawl Site", icon: Globe },
  { key: "analyze", label: "Analyze Pages", icon: BarChart3 },
  { key: "translate", label: "Translate", icon: Languages },
  { key: "review", label: "Review", icon: CheckCircle },
  { key: "publish", label: "Publish", icon: Rocket },
];

function WorkflowIndicator({
  stats,
  pages,
}: {
  stats: ProjectStats;
  pages: Page[];
}) {
  const crawled = pages.filter((p) => p.crawl_status === "crawled").length;
  const total = stats.total_pages;
  const approved = stats.approved_pages;
  const published = stats.published_pages;

  const stepState: Record<string, "complete" | "active" | "pending"> = {
    url: "complete",
    crawl: total > 0 ? "complete" : "active",
    analyze: crawled > 0 ? (crawled < total ? "active" : "complete") : "pending",
    translate: crawled >= total && stats.translated_pages > 0 ? "active" : crawled >= total ? "active" : "pending",
    review: approved > 0 ? "complete" : stats.translated_pages > 0 ? "active" : "pending",
    publish: published > 0 ? "complete" : approved > 0 ? "active" : "pending",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workflow</CardTitle>
        <CardDescription>
          URL → Crawl → Analyze → Translate → Review → Publish
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-start justify-between">
          {WORKFLOW_STEPS.map((step, i) => {
            const state = stepState[step.key];
            const isComplete = state === "complete";
            const isActive = state === "active";
            const isPending = state === "pending";

            return (
              <div key={step.key} className="flex flex-col items-center flex-1">
                <div className="flex items-center w-full">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        "h-9 w-9 rounded-xl flex items-center justify-center border-2 transition-all",
                        isComplete
                          ? "bg-primary border-primary text-primary-foreground"
                          : isActive
                          ? "bg-primary/10 border-primary text-primary"
                          : isPending
                          ? "border-border bg-muted text-muted-foreground"
                          : "border-border bg-surface"
                      )}
                    >
                      <step.icon className="h-4 w-4" />
                    </div>
                    <span
                      className={cn(
                        "text-xs mt-1.5 font-medium text-center",
                        isComplete
                          ? "text-primary"
                          : isActive
                          ? "text-primary"
                          : "text-muted-foreground"
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                  {i < WORKFLOW_STEPS.length - 1 && (
                    <div
                      className={cn(
                        "flex-1 h-px mt-[-18px] mb-12",
                        isComplete ? "bg-primary" : "bg-border"
                      )}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);

  const pid = projectId!;

  useEffect(() => {
    if (!projectId) return;
    ProjectsApi.get(projectId)
      .then(setProject)
      .catch(() => {});
    ProjectsApi.stats(projectId)
      .then(setStats)
      .catch(() => {});
    ProjectsApi.pages(projectId)
      .then(setPages)
      .catch(() => setPages([]));
    setLoading(false);
  }, [projectId]);

  if (loading || !project) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-64 mb-6" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="pt-6">
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const completed = pages.filter((p) => p.crawl_status === "crawled").length;
  const total = pages.length;
  const translated = pages.filter(
    (p) => p.translation_status === "complete" || p.translation_status === "approved"
  ).length;
  const approved = pages.filter((p) => p.translation_status === "approved").length;
  const pending = pages.filter(
    (p) => p.translation_status === "not_selected" || !p.translation_status
  ).length;

  const recentPages = pages.slice(0, 5);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="space-y-8"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <Globe className="h-4 w-4" />
            <a
              href={project.source_url}
              target="_blank"
              rel="noreferrer"
              className="hover:text-primary transition-colors"
            >
              {project.source_url}
            </a>
            <span>→</span>
            <span>{project.target_language_name || project.target_language}</span>
            <Badge variant={statusBadgeVariant(project.status)}>
              {project.status}
            </Badge>
          </div>
        </div>
        {project.published_publication_id && (
          <Badge variant="success" className="text-xs">
            Published
          </Badge>
        )}
      </div>

      {/* Workflow Indicator */}
      {stats && (
        <WorkflowIndicator stats={stats} pages={pages} />
      )}

      {/* KPI Cards */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          <StatCard
            icon={<FileText className="h-5 w-5 text-primary" />}
            label="Total Pages"
            value={stats.total_pages}
          />
          <StatCard
            icon={<BarChart3 className="h-5 w-5 text-primary" />}
            label="Total Words"
            value={stats.total_words}
            sub={stats.estimated_effort}
          />
          <StatCard
            icon={<Clock className="h-5 w-5 text-blue-500" />}
            label="Selected"
            value={stats.selected_pages}
          />
          <StatCard
            icon={<CheckCircle className="h-5 w-5 text-green-500" />}
            label="Approved"
            value={stats.approved_pages}
            sub={`${stats.translated_pages} translated`}
          />
        </motion.div>
      )}

      {/* Progress bars */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.3 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Project Progress</CardTitle>
            <CardDescription>
              {total > 0
                ? `${total} pages • ${stats?.total_words || 0} words`
                : "Start a crawl to see progress"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-foreground">Crawl</span>
                <span className="text-muted-foreground">
                  {completed}/{total} pages
                </span>
              </div>
              <Progress
                value={total > 0 ? (completed / total) * 100 : 0}
                max={100}
                color={total > 0 ? "success" : "primary"}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-foreground">Translation</span>
                <span className="text-muted-foreground">
                  {translated}/{total} pages
                </span>
              </div>
              <Progress
                value={total > 0 ? (translated / total) * 100 : 0}
                max={100}
                color="primary"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-foreground">Approval</span>
                <span className="text-muted-foreground">
                  {approved}/{translated > 0 ? translated : 1} translated
                </span>
              </div>
              <Progress
                value={translated > 0 ? (approved / translated) * 100 : 0}
                max={100}
                color="success"
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.3 }}
        className="flex flex-wrap gap-3"
      >
        <Button onClick={() => navigate(`/project/${pid}/crawl`)}>
          <Globe className="h-4 w-4" />
          Crawl / Re-crawl
        </Button>
        <Button variant="outline" onClick={() => navigate(`/project/${pid}/pages`)}>
          <FileText className="h-4 w-4" />
          Manage Pages
        </Button>
        <Button variant="outline" onClick={() => navigate(`/project/${pid}/review`)}>
          <CheckCircle className="h-4 w-4" />
          Review Translations
        </Button>
        <Button variant="outline" onClick={() => navigate(`/project/${pid}/publish`)}>
          <Rocket className="h-4 w-4" />
          Publish
        </Button>
      </motion.div>

      {/* Recent Pages */}
      {total > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.3 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Recent Pages</CardTitle>
              <CardDescription>{total} pages discovered</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                        URL
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                        Words
                      </th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">
                        Crawl
                      </th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">
                        Translation
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentPages.map((p) => (
                      <tr
                        key={p.id}
                        className="border-b border-border hover:bg-muted/50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="font-mono text-xs text-muted-foreground">
                            {p.normalized_url.replace(/^.*?\/\/[^/]+/, "")}
                          </div>
                          {p.title && (
                            <div className="text-sm text-foreground mt-0.5">
                              {p.title}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-foreground">
                          {p.word_count}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={statusBadgeVariant(p.crawl_status)}>
                            {p.crawl_status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={statusBadgeVariant(p.translation_status)}>
                            {p.translation_status || "pending"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              navigate(`/project/${pid}/edit/${p.id}`)
                            }
                          >
                            Edit
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {total === 0 && (
        <EmptyState
          icon={<Globe className="h-12 w-12" />}
          title="No pages discovered"
          description="Start by crawling your website to discover pages for translation."
          action={{
            label: "Start Crawling",
            onClick: () => navigate(`/project/${pid}/crawl`),
          }}
        />
      )}
    </motion.div>
  );
}
