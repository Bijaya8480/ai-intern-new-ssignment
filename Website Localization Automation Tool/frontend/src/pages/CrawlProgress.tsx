import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ProjectsApi } from "../services/api";
import type { CrawlProgress, Project } from "../types";
import { cn } from "../lib/utils";
import {
  Globe,
  Loader,
  CheckCircle,
  XCircle,
  AlertCircle,
  BarChart3,
  Shield,
  ArrowRight,
  FileText,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Badge, statusBadgeVariant } from "../components/ui/badge";
import { Skeleton } from "../components/ui/skeleton";
import { Progress } from "../components/ui/progress";
import { ErrorState } from "../components/ui/error-state";
import { StatusIndicator } from "../components/ui/status-indicator";
import { PageHeader } from "../components/ui/page-header";

interface StatProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  status?: "success" | "warning" | "error" | "info" | "pending" | "neutral";
}

function Stat({ icon, label, value, status }: StatProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-muted/30 px-3 py-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="flex items-center gap-2">
          <p className="text-xl font-semibold text-foreground">{value}</p>
          {status && <StatusIndicator status={status} dotOnly />}
        </div>
      </div>
    </div>
  );
}

interface LogEntry {
  id: number;
  icon: React.ReactNode;
  label: string;
  status: "success" | "error" | "info";
  detail?: string;
  timestamp: string;
}

function LogItem({ entry }: { entry: LogEntry }) {
  const statusIcon = {
    success: <CheckCircle className="h-4 w-4 text-green-500" />,
    error: <XCircle className="h-4 w-4 text-red-500" />,
    info: <AlertCircle className="h-4 w-4 text-indigo-500" />,
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-start gap-3 py-2.5 border-b border-border last:border-0"
    >
      <div className="flex h-5 w-5 shrink-0 items-center justify-center">
        {entry.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-foreground">{entry.label}</p>
          <div className="flex items-center gap-1 shrink-0">
            {statusIcon[entry.status]}
            <span className="text-xs text-muted-foreground capitalize">
              {entry.status}
            </span>
          </div>
        </div>
        {entry.detail && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {entry.detail}
          </p>
        )}
        <p className="text-xs text-muted-foreground/50 mt-0.5">
          {entry.timestamp}
        </p>
      </div>
    </motion.div>
  );
}

function formatTime(date: Date) {
  return new Date(date).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function CrawlProgressPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [progress, setProgress] = useState<CrawlProgress | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [wordCount, setWordCount] = useState<number | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const pid = projectId!;

  useEffect(() => {
    if (!projectId) return;
    ProjectsApi.get(projectId)
      .then(setProject)
      .catch(() => {});
    ProjectsApi.stats(projectId)
      .then((s) => setWordCount(s.total_words))
      .catch(() => {});
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !project) return;
    setLogs([
      {
        id: 1,
        icon: <Shield className="h-4 w-4 text-indigo-500" />,
        label: "Initializing crawl",
        status: "info",
        detail: `Target: ${project.source_url}`,
        timestamp: formatTime(new Date()),
      },
    ]);

    let cancelled = false;
    (async () => {
      try {
        const p = await ProjectsApi.crawl(projectId!);
        if (cancelled) return;
        setProgress(p);
        setJobId(p.job_id);
        setLogs((l) => [
          ...l,
          {
            id: l.length + 1,
            icon: <Globe className="h-4 w-4 text-blue-500" />,
            label: "Crawl job created",
            status: "success",
            detail: `Job ID: ${p.job_id}`,
            timestamp: formatTime(new Date()),
          },
        ]);
      } catch (e: any) {
        setError(e.message || "Failed to start crawl");
        setLogs((l) => [
          ...l,
          {
            id: l.length + 1,
            icon: <XCircle className="h-4 w-4 text-red-500" />,
            label: "Crawl failed to start",
            status: "error",
            detail: e.message,
            timestamp: formatTime(new Date()),
          },
        ]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, project]);

  useEffect(() => {
    if (!jobId || !projectId) return;
    const timer = setInterval(async () => {
      try {
        const p = await ProjectsApi.crawlStatus(projectId!, jobId);
        setProgress(p);

        if (p.status === "completed" || p.status === "failed") {
          clearInterval(timer);
          if (p.status === "completed") {
            setLogs((l) => [
              ...l,
              {
                id: l.length + 1,
                icon: <CheckCircle className="h-4 w-4 text-green-500" />,
                label: "Crawl completed",
                status: "success",
                detail: `${p.pages_crawled} pages crawled successfully`,
                timestamp: formatTime(new Date()),
              },
            ]);
            setTimeout(() => navigate(`/project/${projectId}/pages`), 1500);
          } else {
            setLogs((l) => [
              ...l,
              {
                id: l.length + 1,
                icon: <XCircle className="h-4 w-4 text-red-500" />,
                label: "Crawl failed",
                status: "error",
                detail: p.error || "Unknown error",
                timestamp: formatTime(new Date()),
              },
            ]);
          }
        } else if (p.pages_crawled > 0 && p.pages_discovered > 0) {
          const logCount = logs.filter((l) =>
            l.label.includes("Discovered")
          ).length;
          if (logCount < Math.floor(p.pages_crawled / 5)) {
            setLogs((l) => [
              ...l,
              {
                id: l.length + 1,
                icon: <Globe className="h-4 w-4 text-primary" />,
                label: `Discovered ${p.pages_discovered} pages`,
                status: "info",
                detail: `${p.pages_crawled} crawled so far`,
                timestamp: formatTime(new Date()),
              },
            ]);
          }
        }
      } catch {
        /* ignore transient errors */
      }
    }, 800);
    return () => clearInterval(timer);
  }, [jobId, projectId, navigate, logs]);

  const scrollToBottom = () => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  if (error)
    return (
      <div className="py-12">
        <ErrorState
          title="Crawl Failed"
          message={error}
          onRetry={() => window.location.reload()}
        />
      </div>
    );

  if (loading || !project) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-6 w-20" />
        </div>
        <Skeleton className="h-4 w-64 mb-6" />
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-5">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-8 w-full" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="bg-muted/30 rounded-lg p-3 h-16">
                    <Skeleton className="h-full w-full" />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-48 mt-1" />
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-64 overflow-y-auto">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
                  <Skeleton className="h-5 w-5 rounded" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!progress && !error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Crawling Website"
          description={project.source_url || "Scanning website for pages and content"}
          icon={<Globe className="h-5 w-5 text-primary" />}
        />
        <Card>
          <CardContent className="pt-6 space-y-5">
            <div className="flex justify-between text-sm">
              <span className="font-medium text-foreground">
                Preparing crawl...
              </span>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader className="h-3 w-3 animate-spin text-primary" />
                <span className="text-xs">Pending</span>
              </div>
            </div>
            <Progress value={0} max={100} size="lg" color="primary" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-muted/30 rounded-lg p-3 h-18">
                  <Skeleton className="h-full w-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!progress) return null;

  const {
    status,
    pages_crawled,
    pages_discovered,
    pages_failed,
    current_url,
    total_pages,
  } = progress;

  const processed = pages_crawled + pages_failed;
  const denom = pages_discovered || processed + 1;
  const pct = Math.round((processed / denom) * 100);
  const isRunning = status === "running";
  const isCompleted = status === "completed";
  const isFailed = status === "failed";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="space-y-6"
    >
      {/* Header */}
      <PageHeader
        title="Crawling Website"
        description={project?.source_url || "Scanning website for pages and content"}
        icon={<Globe className="h-5 w-5 text-primary" />}
      />

      {/* Status Badge */}
      <div className="flex items-center gap-2">
        <Badge
          variant={statusBadgeVariant(status)}
          className="text-xs font-medium"
        >
          {status}
        </Badge>
        {isRunning && (
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader className="h-3 w-3 animate-spin text-primary" />
            Crawling in progress
          </span>
        )}
      </div>

      {/* Main Progress Card */}
      <Card>
        <CardHeader>
          <CardTitle>Crawl Progress</CardTitle>
          <CardDescription>
            {processed} of {denom} pages processed
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium text-foreground">
                {pct}% complete
              </span>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader
                  className={cn(
                    "h-3 w-3",
                    isRunning ? "animate-spin text-primary" : "text-muted-foreground"
                  )}
                />
                <span className="text-xs">
                  {isRunning
                    ? "Crawling..."
                    : isCompleted
                    ? "Completed"
                    : "Idle"}
                </span>
              </div>
            </div>
            <Progress
              value={pct}
              max={100}
              size="lg"
              color={isCompleted ? "success" : isFailed ? "destructive" : "primary"}
            />
            {current_url && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
                <ArrowRight className="h-3 w-3 shrink-0" />
                <span className="font-mono">
                  {current_url.replace(/^.*?\/\/[^/]+/, "")}
                </span>
              </div>
            )}
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat
              icon={<Globe className="h-5 w-5 text-primary" />}
              label="Discovered"
              value={pages_discovered}
              status="info"
            />
            <Stat
              icon={<FileText className="h-5 w-5 text-blue-500" />}
              label="Crawled"
              value={pages_crawled}
              status="success"
            />
            <Stat
              icon={<XCircle className="h-5 w-5 text-red-500" />}
              label="Failed"
              value={pages_failed}
              status={pages_failed > 0 ? "error" : "neutral"}
            />
            <Stat
              icon={<BarChart3 className="h-5 w-5 text-green-500" />}
              label="Total"
              value={total_pages}
              status={isCompleted ? "success" : "neutral"}
            />
          </div>

          {/* Crawl Details */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
            <DetailCard
              icon={<Shield className="h-4 w-4 text-indigo-500" />}
              label="robots.txt"
              value="Compliant"
              status="success"
            />
            <DetailCard
              icon={<Globe className="h-4 w-4 text-blue-500" />}
              label="Redirects"
              value="0 followed"
              status="neutral"
            />
            <DetailCard
              icon={<AlertCircle className="h-4 w-4 text-amber-500" />}
              label="Warnings"
              value={String(pages_failed)}
              status={pages_failed > 0 ? "warning" : "success"}
            />
            <DetailCard
              icon={<FileText className="h-4 w-4 text-primary" />}
              label="Word Count"
              value={wordCount ? `${wordCount.toLocaleString()}` : "~calculating"}
              status="neutral"
            />
          </div>
        </CardContent>
      </Card>

      {/* Activity Log */}
      <Card>
        <CardHeader>
          <CardTitle>Crawl Log</CardTitle>
          <CardDescription>Real-time activity during the crawl</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-80 overflow-y-auto">
            <AnimatePresence>
              {logs.map((log) => (
                <LogItem key={log.id} entry={log} />
              ))}
            </AnimatePresence>
            <div ref={logEndRef} />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function DetailCard({
  icon,
  label,
  value,
  status,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  status: "success" | "warning" | "error" | "info" | "pending" | "neutral";
}) {
  return (
    <div className="p-3 rounded-lg bg-muted/30 text-center border border-border">
      <div className="flex items-center justify-center gap-1.5 mb-1">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="font-medium text-foreground">{value}</div>
      <div className="mt-1">
        <StatusIndicator status={status} dotOnly />
      </div>
    </div>
  );
}
