import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ProjectsApi } from "../services/api";
import { LANGUAGES, langName } from "../constants/languages";
import { cn } from "../lib/utils";
import {
  ChevronRight,
  Globe,
  Languages,
  MousePointerClick,
  CheckCircle,
  Sparkles,
  Loader,
  AlertCircle,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

type Step = 1 | 2 | 3 | 4;

interface FormData {
  url: string;
  project_name: string;
  source_language: string;
  target_language: string;
  detected_language: string;
}

const steps: { number: Step; label: string; icon: React.ReactNode }[] = [
  { number: 1, label: "Website URL", icon: <Globe className="h-5 w-5" /> },
  { number: 2, label: "Source Language", icon: <Languages className="h-5 w-5" /> },
  { number: 3, label: "Target Language", icon: <Languages className="h-5 w-5" /> },
  { number: 4, label: "Create & Scan", icon: <MousePointerClick className="h-5 w-5" /> },
];

function useUrlValidation(url: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "URL must use HTTP or HTTPS";
    }
    if (!parsed.hostname) {
      return "Please enter a valid domain";
    }
    return null;
  } catch {
    return "Please enter a valid URL (e.g. https://example.com)";
  }
}

const stepDescriptions: Record<Step, string> = {
  1: "Enter the URL of the website you want to localize.",
  2: "We'll detect the source language automatically.",
  3: "Select the language to translate into.",
  4: "Give your project a name and start the website scan.",
};

export default function CreateProject() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormData>({
    url: "",
    project_name: "",
    source_language: "en",
    target_language: "es",
    detected_language: "",
  });

  const urlError = useUrlValidation(form.url);
  const canProceed = step === 1
    ? !!form.url && !urlError
    : step === 3
    ? form.source_language !== form.target_language
    : true;

  useEffect(() => {
    if (form.url && step === 2) {
      const controller = new AbortController();
      (async () => {
        setLoading(true);
        setError("");
        try {
          const res = await fetch(form.url, {
            mode: "cors",
            signal: controller.signal,
            headers: { Accept: "text/html" },
          }).catch(() => null);
          if (res && res.ok) {
            const html = await res.text().catch(() => "");
            const match = html.match(/<html[^>]+lang=["']([a-zA-Z-]+)["']/i);
            if (match) {
              const detected = match[1];
              setForm((f) => ({
                ...f,
                detected_language: detected,
                source_language: detected.split("-")[0],
              }));
            } else {
              setForm((f) => ({ ...f, detected_language: "en", source_language: "en" }));
            }
          } else {
            setForm((f) => ({ ...f, detected_language: "en", source_language: "en" }));
          }
        } catch {
          setForm((f) => ({ ...f, detected_language: "en", source_language: "en" }));
        } finally {
          setLoading(false);
        }
      })();
      return () => controller.abort();
    }
  }, [form.url, step]);

  const next = () => {
    if (step < 4 && !loading) {
      setError("");
      setStep((s) => (s + 1) as Step);
    }
  };

  const back = () => {
    if (step > 1 && !loading) setStep((s) => (s - 1) as Step);
  };

  const handleCreate = async () => {
    if (!form.project_name.trim()) {
      setError("Please enter a project name");
      return;
    }
    if (!form.url) {
      setError("Please enter a website URL");
      return;
    }
    if (urlError) {
      setError(urlError);
      return;
    }
    if (form.source_language === form.target_language) {
      setError("Source and target languages must be different");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const lang = LANGUAGES.find((l) => l.code === form.target_language);
      const created = await ProjectsApi.create({
        name: form.project_name,
        source_url: form.url,
        target_language: form.target_language,
        target_language_name: lang?.name,
        source_language: form.source_language,
        source_language_name: langName(form.source_language),
      });
      navigate(`/project/${created.id}/crawl`);
    } catch (e: any) {
      setError(e.message || "Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  const isStepComplete = (s: number) => {
    if (s < step) return true;
    if (s === step && canProceed) return true;
    return false;
  };

  return (
    <div className="mx-auto max-w-2xl py-8">
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center gap-4 mb-6">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
              {steps[step - 1].icon}
            </div>
            <div>
              <CardTitle className="text-xl">
                {steps[step - 1].label}
              </CardTitle>
              <CardDescription className="mt-1">
                {stepDescriptions[step]}
              </CardDescription>
            </div>
          </div>

          {/* Step indicator */}
          <div className="mb-6">
            <nav aria-label="Progress" className="flex items-center">
              {steps.map((s, i) => {
                const isComplete = s.number < step;
                const isActive = s.number === step;
                return (
                  <div key={s.number} className="flex items-center">
                    <div
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium border-2 transition-all",
                        isComplete
                          ? "border-primary bg-primary text-primary-foreground"
                          : isActive
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-surface text-muted-foreground"
                      )}
                    >
                      {isComplete ? <CheckCircle className="h-4 w-4" /> : s.number}
                    </div>
                    {i < steps.length - 1 && (
                      <div
                        className={cn(
                          "h-px w-10",
                          isComplete ? "bg-primary" : "bg-border"
                        )}
                      />
                    )}
                  </div>
                );
              })}
            </nav>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <AnimatePresence mode="wait">
            {/* Step 1: URL + Project Name */}
            {step === 1 && (
              <motion.div
                key="step-1"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <Input
                  label="Project Name"
                  placeholder="e.g. AcmeCorp Website Translation"
                  value={form.project_name}
                  onChange={(e) =>
                    setForm({ ...form, project_name: e.target.value })
                  }
                  error={!form.project_name ? "Project name is required" : undefined}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && form.project_name && !urlError && form.url) {
                      e.preventDefault();
                      next();
                    }
                  }}
                />
                <Input
                  label="Website URL"
                  placeholder="https://example.com"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  error={urlError || undefined}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && form.url && !urlError) {
                      e.preventDefault();
                      next();
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Enter the homepage of the website you want to localize.
                  We'll crawl all internal pages automatically.
                </p>
                {urlError && (
                  <div className="flex items-start gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{urlError}</span>
                  </div>
                )}
              </motion.div>
            )}

            {/* Step 2: Source Language */}
            {step === 2 && (
              <motion.div
                key="step-2"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div className="flex items-center gap-3 rounded-lg bg-muted/40 p-3.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <Globe className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Detected Language
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {form.detected_language
                        ? langName(form.detected_language) || form.detected_language
                        : "Detecting…"}
                    </p>
                  </div>
                  {loading && (
                    <Loader className="ml-auto h-4 w-4 animate-spin text-primary" />
                  )}
                </div>

                {form.detected_language && (
                  <p className="text-sm text-muted-foreground">
                    We detected{" "}
                    <strong>{langName(form.detected_language)}</strong> from
                    the page's HTML <code>lang</code> attribute. You can
                    override it below if needed.
                  </p>
                )}

                <Select
                  label="Source Language"
                  value={form.source_language}
                  onChange={(e) =>
                    setForm({ ...form, source_language: e.target.value })
                  }
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </Select>
              </motion.div>
            )}

            {/* Step 3: Target Language */}
            {step === 3 && (
              <motion.div
                key="step-3"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <Select
                  label="Target Language"
                  value={form.target_language}
                  onChange={(e) =>
                    setForm({ ...form, target_language: e.target.value })
                  }
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name} ({l.code})
                    </option>
                  ))}
                </Select>
                <p className="text-sm text-muted-foreground">
                  This is the language your visitors will see when they switch
                  from the default source language.
                </p>
                {form.source_language === form.target_language && (
                  <div className="flex items-start gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>Target language must differ from the source language.</span>
                  </div>
                )}
              </motion.div>
            )}

            {/* Step 4: Summary & Create */}
            {step === 4 && (
              <motion.div
                key="step-4"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                <div className="rounded-lg border border-border bg-muted/20 p-5 space-y-4">
                  <h4 className="text-sm font-medium text-foreground">
                    Project Summary
                  </h4>
                  <div className="grid gap-3.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Project Name</span>
                      <span className="text-foreground font-medium">
                        {form.project_name || "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Source URL</span>
                      <span className="text-foreground font-mono text-xs truncate max-w-xs">
                        {form.url || "(not set)"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Source Language</span>
                      <span className="text-foreground">
                        {langName(form.source_language) || form.source_language}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Target Language</span>
                      <span className="text-foreground">
                        {langName(form.target_language)}
                      </span>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Sparkles className="h-3 w-3 text-primary" />
                  <span>
                    After creating, we'll start scanning your website
                    automatically.
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Footer Actions */}
      <div className="mt-6 flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={back}
          disabled={step === 1 || loading}
        >
          Back
        </Button>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/projects")}
            disabled={loading}
          >
            Skip for now
          </Button>
          {step < 4 ? (
            <Button
              onClick={next}
              disabled={
                !canProceed ||
                (step === 1 && (form.project_name ? !form.project_name.trim() && form.url && !urlError : !form.url || !!urlError)) ||
                loading
              }
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleCreate} disabled={loading}>
              {loading ? (
                <div className="flex items-center gap-2">
                  <Loader className="h-4 w-4 animate-spin" />
                  Creating…
                </div>
              ) : (
                <>
                  Create & Scan
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
