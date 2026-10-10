import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ProjectsApi } from "../services/api";
import type { Project, ProjectStats, Page } from "../types";
import { formatDistance } from "../lib/utils";
import { useSearch, useGlobalSearch } from "../lib/search-context";
import {
  Globe,
  BarChart3,
  CheckCircle,
  Clock,
  FileText,
  ExternalLink,
  Rocket,
  Send,
  Plus,
  Search,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Badge, statusBadgeVariant } from "../components/ui/badge";
import { Skeleton } from "../components/ui/skeleton";
import { Progress } from "../components/ui/progress";
import { EmptyState } from "../components/ui/empty-state";
import { KPICard } from "../components/ui/kpi-card";
import { Tooltip } from "../components/ui/tooltip";
import { StatusIndicator } from "../components/ui/status-indicator";

interface ProjectWithStats extends Project {
  stats?: ProjectStats;
  pages?: Page[];
}

const statCards = [
  { label: "Total Projects", icon: <Globe className="h-5 w-5 text-primary" /> },
  { label: "Active", icon: <Clock className="h-5 w-5 text-blue-500" /> },
  { label: "Published", icon: <Rocket className="h-5 w-5 text-purple-500" /> },
  { label: "In Progress", icon: <Send className="h-5 w-5 text-amber-500" /> },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery, results, setResults, setPlaceholder, isOpen, setIsOpen] = [
    useSearch().query,
    useSearch().setQuery,
    useSearch().results,
    useSearch().setResults,
    useSearch().setPlaceholder,
    useSearch().isOpen,
    useSearch().setIsOpen,
  ];

  const { updateResults } = useGlobalSearch(
    projects,
    (project, q) =>
      project.name.toLowerCase().includes(q) ||
      project.source_url.toLowerCase().includes(q) ||
      (project.target_language_name || project.target_language)
        .toLowerCase()
        .includes(q),
    (project) => ({
      id: project.id,
      type: "project",
      title: project.name,
      subtitle: `${project.target_language_name || project.target_language}`,
      href: `/project/${project.id}/dashboard`,
    }),
    true
  );

  useEffect(() => {
    setPlaceholder("Search projects, URLs, languages…");

    const loadProjects = async () => {
      setLoading(true);
      try {
        const data = await ProjectsApi.list();
        const projectsWithStats = await Promise.all(
          data.map(async (p) => {
            try {
              const [stats, pages] = await Promise.all([
                ProjectsApi.stats(p.id),
                ProjectsApi.pages(p.id).catch(() => []),
              ]);
              return { ...p, stats, pages };
            } catch {
              return p;
            }
          })
        );
        setProjects(projectsWithStats);
      } catch {
        setProjects([]);
      } finally {
        setLoading(false);
      }
    };

    loadProjects();
  }, []);

  useEffect(() => {
    updateResults(query);
  }, [query, projects, updateResults]);

  const stats = {
    total: projects.length,
    active: projects.filter((p) => p.status === "active").length,
    published: projects.filter((p) => p.published_publication_id).length,
    inProgress: projects.filter(
      (p) => !p.published_publication_id && p.status !== "archived"
    ).length,
  };

  const recentProjects = [...projects].sort(
    (a, b) =>
      new Date(b.updated_at || b.created_at || 0).getTime() -
      new Date(a.updated_at || a.created_at || 0).getTime()
  );

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-1" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-36" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48 mt-1" />
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="space-y-7"
    >
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm shadow-slate-900/[0.025] sm:p-7">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-blue-700">
            Localization overview
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Dashboard</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            {stats.total === 0
              ? "Create your first localization project to get started."
              : `${stats.total} project${stats.total !== 1 ? "s" : ""} · ${stats.published} published`}
          </p>
        </div>
        <Button onClick={() => navigate("/create")} className="h-10 rounded-xl bg-blue-600 px-4 shadow-md shadow-blue-600/15 hover:bg-blue-700">
          <Plus className="h-4 w-4" />
          Create Project
        </Button>
      </div>

      {/* KPI Cards */}
      {stats.total > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="grid grid-cols-2 gap-3 md:grid-cols-4"
        >
          <KPICard
            icon={<Globe className="h-5 w-5 text-primary" />}
            label="Total Projects"
            value={stats.total}
          />
          <KPICard
            icon={<Clock className="h-5 w-5 text-blue-500" />}
            label="Active"
            value={stats.active}
          />
          <KPICard
            icon={<Rocket className="h-5 w-5 text-purple-500" />}
            label="Published"
            value={stats.published}
          />
          <KPICard
            icon={<Send className="h-5 w-5 text-amber-500" />}
            label="In Progress"
            value={stats.inProgress}
          />
        </motion.div>
      )}

      {/* Recent Projects */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.3 }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">
            Recent Projects
          </h2>
          {stats.total > 0 && (
            <Button variant="ghost" size="sm" onClick={() => navigate("/projects")}>
              View all →
            </Button>
          )}
        </div>

        {stats.total === 0 ? (
          <Card className="rounded-2xl border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.025]">
            <CardContent className="pt-12">
              <EmptyState
                icon={<Send className="h-12 w-12" />}
                title="No projects yet"
                description="Create your first localization project. Enter your website URL, select a target language, and we'll scan, translate, and deploy multilingual content automatically."
                action={{
                  label: "Create Your First Project",
                  onClick: () => navigate("/create"),
                }}
              />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {recentProjects.slice(0, 8).map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05, duration: 0.2 }}
              >
                <ProjectRow project={p} onOpen={() => navigate(`/project/${p.id}/dashboard`)} />
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Quick Actions */}
      {stats.total > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.3 }}
          className="flex flex-wrap gap-3"
        >
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Quick Actions
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => navigate("/create")}>
                  <Plus className="h-4 w-4" />
                  New Project
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.location.reload()}
                >
                  <Globe className="h-4 w-4" />
                  Refresh
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}

function ProjectRow({
  project,
  onOpen,
}: {
  project: ProjectWithStats;
  onOpen: () => void;
}) {
  const stats = project.stats;
  const total = stats?.total_pages || 0;
  const totalWords = stats?.total_words || 0;
  const translated = stats?.translated_pages || 0;
  const approved = stats?.approved_pages || 0;
  const crawlProgress =
    total > 0
      ? Math.round(
          ((translated + (total - (stats?.selected_pages || 0))) / total) * 100
        )
      : 0;

  return (
    <Card className="rounded-2xl border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.025] transition-all hover:border-slate-300 hover:shadow-md">
    <CardContent className="p-4 sm:p-5">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 ring-1 ring-blue-100">
            <Globe className="h-5 w-5 text-blue-700" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-foreground">{project.name}</p>
                {project.published_publication_id && (
                  <Badge variant="success" className="text-xs">
                    Published
                  </Badge>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <a
                  href={project.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-foreground transition-colors truncate max-w-xs"
                >
                  {project.source_url}
                </a>
                <span>→</span>
                <span>
                  {project.target_language_name || project.target_language}
                </span>
              </div>
            </div>
          </div>

          {stats && (
            <div className="flex flex-wrap items-center gap-5 sm:gap-7">
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">{total}</p>
                <p className="text-xs text-muted-foreground">Pages</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">
                  {totalWords.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">Words</p>
              </div>
              <div className="flex flex-col items-center gap-1 min-w-[100px]">
                <div className="text-right">
                  <StatusIndicator
                    status={
                      approved > 0 && translated === total
                        ? "success"
                        : translated > 0
                        ? "warning"
                        : "pending"
                    }
                    label={
                      approved > 0 && translated === total
                        ? "Approved"
                        : translated > 0
                        ? "In Progress"
                        : "Not Started"
                    }
                    dotOnly
                  />
                  <p className="text-xs text-muted-foreground">
                    {approved}/{total} approved
                  </p>
                </div>
                <div className="w-24">
                  <Progress
                    value={total > 0 ? (translated / total) * 100 : 0}
                    max={100}
                    size="sm"
                  />
                </div>
              </div>
              <Tooltip content="Open project dashboard" side="left" delayMs={300}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onOpen}
                  className="h-8 w-8 p-0"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </Tooltip>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
