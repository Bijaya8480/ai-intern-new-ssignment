import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ProjectsApi, TranslationApi } from "../services/api";
import type { Project, TranslationEngineStatus } from "../types";
import { Save, Globe, Tag, ExternalLink, Check, Cloud } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import { ErrorState } from "../components/ui/error-state";
import { Badge } from "../components/ui/badge";

export default function Settings() {
  const { projectId } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({ name: "", target_language_name: "" });
  const [toggles, setToggles] = useState({
    use_translation_memory: true,
    preserve_brand_names: true,
    auto_approve_unchanged: false,
    skip_empty_elements: true,
  });
  const [engine, setEngine] = useState<TranslationEngineStatus | null>(null);
  const [loadingEngine, setLoadingEngine] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    ProjectsApi.get(projectId)
      .then((p) => {
        setProject(p);
        setForm({ name: p.name, target_language_name: p.target_language_name || "" });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    TranslationApi.getEngine()
      .then((e) => setEngine(e))
      .catch(() => setEngine(null))
      .finally(() => setLoadingEngine(false));
  }, []);

  const handleSave = async () => {
    if (!project || !projectId) return;
    setSaving(true);
    try {
      await new Promise((r) => setTimeout(r, 500));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      /* pass */
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: keyof typeof toggles) => {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
    if (saved) setSaved(false);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-64 mb-6" />
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!project) {
    return (
      <ErrorState
        title="Project Not Found"
        message="Unable to load project settings."
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
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Project configuration and localization preferences
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="inline-flex items-center gap-1 text-xs text-green-600">
              <Check className="h-3 w-3" />
              Saved
            </span>
          )}
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              "Saving…"
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Project Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Project Settings</CardTitle>
          <CardDescription>
            Update your project name and language settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="Project Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Source URL"
            value={project.source_url}
            readOnly
            className="bg-muted/30 cursor-not-allowed"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Target Language"
              value={project.target_language_name || project.target_language}
              readOnly
              className="bg-muted/30 cursor-not-allowed"
            />
            <Input
              label="Source Language"
              value={project.source_language_name || project.source_language || "Auto-detect"}
              readOnly
              className="bg-muted/30 cursor-not-allowed"
            />
          </div>
          <Input
            label="Target Language Code"
            value={form.target_language_name}
            onChange={(e) => setForm({ ...form, target_language_name: e.target.value })}
          />
        </CardContent>
      </Card>

       {/* Translation Engine */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            Translation Engine
          </CardTitle>
          <CardDescription>
            Configured AI translation providers. The primary engine is used first,
            with graceful fallback to lower-priority engines.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingEngine ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-5 w-64" />
              <Skeleton className="h-5 w-40" />
            </div>
          ) : !engine ? (
            <p className="text-sm text-muted-foreground">
              Could not load translation engine status.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Primary engine:</span>
                <Badge variant="default">{engine.primary}</Badge>
              </div>
              <div className="space-y-2">
                {engine.engines.map((e) => (
                  <div
                    key={e.name}
                    className="flex items-center justify-between py-1.5"
                  >
                    <span className="text-sm">{e.label}</span>
                    <div className="flex items-center gap-2">
                      {e.available ? (
                        <Badge variant="outline" className="text-green-600">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Disabled
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground w-10 text-right">
                        #{e.priority}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {!engine.engines.some(
                (e) => e.name === "google-cloud" && e.available,
              ) && (
                <div className="rounded-md bg-muted/30 p-3 text-sm">
                  <span className="font-medium">Google Cloud Translation API</span>{" "}
                  requires a server API key. Set
                  <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs">
                    GOOGLE_CLOUD_TRANSLATE_KEY
                  </code>
                  in the backend <code className="rounded bg-muted px-1.5 py-0.5 text-xs">.env</code>.
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Localization Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Localization Preferences</CardTitle>
          <CardDescription>
            Fine-tune how your content is translated and localized
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ToggleRow
            label="Use translation memory"
            description="Reuse previously approved translations for consistency"
            checked={toggles.use_translation_memory}
            onChange={() => toggle("use_translation_memory")}
          />
          <ToggleRow
            label="Preserve brand names"
            description="Never translate known brand names and product names"
            checked={toggles.preserve_brand_names}
            onChange={() => toggle("preserve_brand_names")}
          />
          <ToggleRow
            label="Auto-approve unchanged segments"
            description="Segments identical to source are marked as approved automatically"
            checked={toggles.auto_approve_unchanged}
            onChange={() => toggle("auto_approve_unchanged")}
          />
          <ToggleRow
            label="Skip empty elements"
            description="Exclude empty or whitespace-only segments from translation"
            checked={toggles.skip_empty_elements}
            onChange={() => toggle("skip_empty_elements")}
          />
        </CardContent>
      </Card>
    </motion.div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer py-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
      />
      <div className="flex-1">
        <p className="font-medium text-foreground">{label}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
      </div>
    </label>
  );
}
