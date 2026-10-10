import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ProjectsApi } from "../services/api";
import type { Project, Publication, SnippetResponse } from "../types";
import { LANGUAGES } from "../constants/languages";
import { cn } from "../lib/utils";
import {
  Rocket,
  Copy,
  Check,
  ExternalLink,
  Download,
  Code,
  Clock,
  Globe,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Badge, statusBadgeVariant } from "../components/ui/badge";
import { Skeleton } from "../components/ui/skeleton";
import { ErrorState } from "../components/ui/error-state";
import { StatusIndicator } from "../components/ui/status-indicator";
import { Tooltip } from "../components/ui/tooltip";
import { Select } from "../components/ui/select";

export default function Publish() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [publishing, setPublishing] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [targetLanguage, setTargetLanguage] = useState("");
  const [pub, setPub] = useState<Publication | null>(null);
  const [snippet, setSnippet] = useState<SnippetResponse | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const pid = projectId!;

  const handlePublish = async () => {
    setPublishing(true);
    setError("");
    try {
      const language = targetLanguage || project?.target_language;
      if (!language) throw new Error("Select a target language before publishing.");
      const p = await ProjectsApi.publish(pid, language);
      setPub(p);
      try {
        const sn = await ProjectsApi.snippet(pid, language);
        setSnippet(sn);
      } catch (e) {
        setSnippet(null);
        setError(
          `Translations were published, but the install snippet could not be loaded: ${
            e instanceof Error ? e.message : "Unknown error"
          }`
        );
      }
    } catch (e: any) {
      setError(e.message || "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  const handleCopy = async () => {
    if (!snippet) return;
    await navigator.clipboard.writeText(snippet.snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!snippet) return;
    const blob = new Blob([snippet.snippet], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `loc-${snippet.project_id}.js`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!projectId) return;
    ProjectsApi.get(projectId)
      .then((loadedProject) => {
        setProject(loadedProject);
        setTargetLanguage(loadedProject.target_language);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load project"));
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !targetLanguage) return;
    let alive = true;
    ProjectsApi.snippet(projectId, targetLanguage)
      .then((sn) => {
        if (alive) setSnippet(sn);
      })
      .catch(() => {
        if (alive) setSnippet(null);
      });
    return () => {
      alive = false;
    };
  }, [projectId, targetLanguage]);

  const getProjectStatus = () => {
    if (pub?.status === "published" || snippet) return "published";
    if (publishing) return "publishing";
    return "not_published";
  };

  const projectStatus = getProjectStatus();

  if (!project) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-64 mb-6" />
        <Card>
          <CardContent className="pt-6">
            <Skeleton className="h-64 w-full" />
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
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Publish</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Deploy approved translations to your live site.
          </p>
        </div>
        <StatusIndicator
          status={
            projectStatus === "published"
              ? "success"
              : projectStatus === "publishing"
              ? "info"
              : "pending"
          }
          label={
            projectStatus === "published"
              ? "Live"
              : projectStatus === "publishing"
              ? "Deploying"
              : "Not Published"
          }
        />
      </div>

      {error && (
        <ErrorState
          title={
            error.includes("Translations were published")
              ? "Published; snippet unavailable"
              : error.includes("No pages selected for translation")
              ? "No pages selected"
              : "Publish Failed"
          }
          message={
            error.includes("No pages selected for translation")
              ? "No pages have been selected for translation. Crawl your website, go to Website Analysis, and mark pages for translation before publishing."
              : error
          }
          action={
            error.includes("No pages selected for translation")
              ? { label: "Go to Pages", onClick: () => navigate(`/project/${pid}/pages`) }
              : undefined
          }
          onRetry={() => {
            setError("");
            handlePublish();
          }}
        />
      )}

      {/* Deployment Details */}
      <Card>
        <CardHeader>
          <CardTitle>Deployment Details</CardTitle>
          <CardDescription>
            Project configuration for this publication
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <DetailRow icon={<Globe className="h-4 w-4" />} label="Project" value={project.name} />
          <DetailRow
            icon={<ExternalLink className="h-4 w-4" />}
            label="Source Website"
            value={
              <a
                href={project.source_url}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline flex items-center gap-1 break-all"
              >
                {project.source_url}
              </a>
            }
          />
          <div className="grid gap-2 py-2">
            <label
              htmlFor="publish-target-language"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Code className="h-4 w-4" />
              Target language
            </label>
            <Select
              id="publish-target-language"
              aria-label="Select language to publish"
              value={targetLanguage}
              onChange={(event) => {
                setTargetLanguage(event.target.value);
                setPub(null);
                setSnippet(null);
                setError("");
              }}
              disabled={publishing}
            >
              {LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.nativeName || language.name} ({language.name})
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              Publishing is language-specific. Only approved translations for the selected language are included.
            </p>
          </div>
          {snippet && (
            <>
              <DetailRow
                icon={<Rocket className="h-4 w-4" />}
                label="Version"
                value={`v${snippet.version}`}
              />
              <DetailRow
                icon={<Clock className="h-4 w-4" />}
                label="Last Published"
                value={pub?.published_at ? new Date(pub.published_at).toLocaleString() : "—"}
              />
            </>
          )}
          {!snippet && (
            <DetailRow
              icon={<Clock className="h-4 w-4" />}
              label="Status"
              value="Not yet published"
            />
          )}
        </CardContent>
      </Card>

      {/* Publish Button */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
      >
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-foreground">
                  {projectStatus === "published" ? "Republish" : "Publish Now"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {projectStatus === "published"
                    ? "Re-deploy with your latest translation changes."
                    : "Deploy approved translations and generate the JavaScript snippet."}
                </p>
              </div>
              <Button
                size="lg"
                onClick={handlePublish}
                disabled={publishing}
                className="md:ml-auto shrink-0"
              >
                {publishing ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    Publishing…
                  </div>
                ) : (
                  <>
                    <Rocket className="h-4 w-4" />
                    {projectStatus === "published" ? "Republish Now" : "Publish Now"}
                  </>
                )}
              </Button>
            </div>

            {publishing && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mt-2">
                  Publishing your translations…
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Deployment Success / Snippet */}
      <AnimatePresence>
        {snippet && !publishing && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="space-y-4"
          >
            {/* Success Banner */}
            <Card className="border-green-200 dark:border-green-900/30">
              <CardContent className="pt-5">
                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/20 text-green-600">
                    <Rocket className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">
                      Successfully Published
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Version {snippet.version} is now live. Copy the snippet
                      below and add it to your website.
                    </p>
                    {pub?.published_at && (
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        Published at{" "}
                        {new Date(pub.published_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Snippet */}
            <Card>
              <CardHeader>
                <CardTitle>JavaScript Snippet</CardTitle>
                <CardDescription>
                  Paste this snippet before the closing <code>&lt;/body&gt;</code>{" "}
                  tag on your website.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <div className="flex items-center justify-between mb-2">
                    <code className="text-xs text-muted-foreground">
                      data-project="{snippet.project_id}"
                    </code>
                    <Badge variant="outline" className="text-xs">
                      v{snippet.version}
                    </Badge>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-4 overflow-x-auto border border-border">
                    <code className="text-sm font-mono text-foreground whitespace-pre text-wrap break-all">
                      {snippet.snippet}
                    </code>
                  </div>
                  <div className="absolute top-2 right-2 flex gap-1">
                    <Tooltip content="Copy snippet" side="bottom" delayMs={300}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCopy}
                        aria-label="Copy snippet"
                      >
                        {copied ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </Tooltip>
                    <Tooltip content="Download snippet" side="bottom" delayMs={300}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleDownload}
                        aria-label="Download snippet"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                  </div>
                </div>
                {copied && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <Check className="h-3 w-3" />
                    Snippet copied to clipboard
                  </p>
                )}

                <div className="border-t border-border pt-4 flex flex-col sm:flex-row gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopy}>
                    <Copy className="h-4 w-4" />
                    Copy Snippet
                  </Button>
                  <a
                    href={`/sample-site/index.html?loc_project=${snippet.project_id}&loc_lang=${encodeURIComponent(snippet.target_language)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Test Website
                  </a>
                </div>
              </CardContent>
            </Card>

            {/* How it works */}
            <Card>
              <CardHeader>
                <CardTitle>How It Works</CardTitle>
                <CardDescription>
                  Your deployment pipeline
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3 text-sm">
                  <li className="flex items-start gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <span className="text-xs font-medium text-primary">1</span>
                    </div>
                    <p className="text-muted-foreground">
                      Paste the snippet above before the closing{" "}
                      <code>&lt;/body&gt;</code> tag on your site.
                    </p>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <span className="text-xs font-medium text-primary">2</span>
                    </div>
                    <p className="text-muted-foreground">
                      loc.js fetches translations from{" "}
                      <code className="text-xs">
                        /api/runtime/{snippet.project_id}/translations
                      </code>
                      .
                    </p>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <span className="text-xs font-medium text-primary">3</span>
                    </div>
                    <p className="text-muted-foreground">
                      On page load, loc.js matches DOM elements by CSS selector,
                      verifies content hashes, and replaces text safely.
                    </p>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <span className="text-xs font-medium text-primary">4</span>
                    </div>
                    <p className="text-muted-foreground">
                      Visitors see localized content instantly, without a page
                      reload.
                    </p>
                  </li>
                </ol>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Not published state */}
        {!snippet && !publishing && !error && (
          <Card>
            <CardContent className="pt-12">
              <div className="text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-muted/50 mx-auto mb-4">
                  <Rocket className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Not Yet Published
                </h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                  Publish your project to generate the JavaScript snippet that
                  will localize your live website. Make sure all pages are
                  approved before publishing.
                </p>
                <Button onClick={handlePublish}>
                  <Rocket className="h-4 w-4" />
                  Publish Now
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
      <div className="flex items-center gap-2.5">
        <div className="text-muted-foreground">{icon}</div>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <div className="text-sm font-medium text-foreground text-right">
        {value}
      </div>
    </div>
  );
}
