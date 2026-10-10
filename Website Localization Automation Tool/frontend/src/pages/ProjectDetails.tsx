import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ProjectsApi } from "../services/api";
import type { Project, ProjectStats } from "../types";
import { Globe, Calendar, Tag, ExternalLink, BarChart3, Lock, Save } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Skeleton } from "../components/ui/skeleton";
import { ErrorState } from "../components/ui/error-state";
import { formatDate, formatDateTime } from "../lib/utils";

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
      <div className="p-1.5 rounded-lg bg-muted/30 text-muted-foreground">
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-sm font-medium text-foreground mt-0.5">{value}</p>
      </div>
    </div>
  );
}

export default function ProjectDetails() {
  const { projectId } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!projectId) return;
    Promise.all([
      ProjectsApi.get(projectId),
      ProjectsApi.stats(projectId),
    ])
      .then(([p, s]) => {
        setProject(p);
        setStats(s);
      })
      .catch((e) => setError(e.message || "Failed to load project"))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <ErrorState
        title="Unable to Load Project"
        message={error || "Project not found."}
      />
    );
  }

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
          <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Project configuration and overview
          </p>
        </div>
        <Badge
          variant={project.status === "published" ? "success" : project.status === "active" ? "info" : "pending"}
          className="text-xs"
        >
          {project.status}
        </Badge>
      </div>

      {/* Project Information */}
      <Card>
        <CardHeader>
          <CardTitle>Project Information</CardTitle>
          <CardDescription>Core project settings and metadata</CardDescription>
        </CardHeader>
        <CardContent>
          <InfoRow
            icon={<Globe className="h-4 w-4" />}
            label="Website URL"
            value={
              <a
                href={project.source_url}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline flex items-center gap-1 wrap-break-word"
              >
                {project.source_url}
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            }
          />
          <InfoRow
            icon={<Tag className="h-4 w-4" />}
            label="Target Language"
            value={project.target_language_name || project.target_language}
          />
          <InfoRow
            icon={<Tag className="h-4 w-4" />}
            label="Source Language"
            value={project.source_language_name || project.source_language || "Auto-detect"}
          />
          <InfoRow
            icon={<Calendar className="h-4 w-4" />}
            label="Created"
            value={formatDate(project.created_at || "")}
          />
          <InfoRow
            icon={<Calendar className="h-4 w-4" />}
            label="Last Updated"
            value={formatDateTime(project.updated_at || "")}
          />
          {project.published_publication_id && (
            <InfoRow
              icon={<BarChart3 className="h-4 w-4" />}
              label="Publication"
              value={`Published • ID: ${project.published_publication_id}`}
            />
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      {stats && (
        <Card>
          <CardHeader>
            <CardTitle>Translation Statistics</CardTitle>
            <CardDescription>Overview of your project's content</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-muted/30 rounded-lg text-center">
                <p className="text-2xl font-bold text-foreground">{stats.total_pages}</p>
                <p className="text-xs text-muted-foreground mt-1">Pages Crawled</p>
              </div>
              <div className="p-4 bg-muted/30 rounded-lg text-center">
                <p className="text-2xl font-bold text-foreground">{stats.total_words.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">Total Words</p>
              </div>
              <div className="p-4 bg-muted/30 rounded-lg text-center">
                <p className="text-2xl font-bold text-foreground">{stats.approved_pages}</p>
                <p className="text-xs text-muted-foreground mt-1">Approved</p>
              </div>
              <div className="p-4 bg-muted/30 rounded-lg text-center">
                <p className="text-2xl font-bold text-foreground">{stats.published_pages}</p>
                <p className="text-xs text-muted-foreground mt-1">Published</p>
              </div>
            </div>
            {stats.estimated_effort && (
              <div className="mt-4 text-xs text-muted-foreground">
                Estimated effort: <strong className="text-foreground">{stats.estimated_effort}</strong>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Project ID */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 text-xs">
            <Lock className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Project ID:</span>
            <code className="text-foreground font-mono bg-muted/30 px-1.5 py-0.5 rounded">
              {project.id}
            </code>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
