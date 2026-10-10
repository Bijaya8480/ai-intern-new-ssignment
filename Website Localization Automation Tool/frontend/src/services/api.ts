/** Tiny fetch wrapper with JSON handling and user-friendly error messages. */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

const BASE = import.meta.env.VITE_API_BASE || "";

export async function api<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  if (res.status === 404) throw new ApiError(404, "Resource not found");
  if (res.status === 422) {
    const b = await res.json().catch(() => ({}));
    throw new ApiError(422, (b as any).detail || "Invalid input");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = `Server error (${res.status})`;
    try {
      const j = JSON.parse(text);
      msg = (j as any).detail || msg;
    } catch {
      msg = text || msg;
    }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

import type {
  Project, ProjectCreate, CrawlProgress, Page, Segment, SegmentTranslateResponse,
  ProjectStats, Publication, SnippetResponse, RuntimeResponse, TranslationEngineStatus,
  TranslationLanguageResponse, TranslationBatchResponse, TranslationHealthResponse,
} from "../types";

export const ProjectsApi = {
  create: (body: ProjectCreate) => api<Project>("POST", "/api/projects", body),
  list: () => api<Project[]>("GET", "/api/projects"),
  get: (id: string) => api<Project>("GET", `/api/projects/${id}`),
  delete: (id: string) => api<void>("DELETE", `/api/projects/${id}`),
  crawl: (id: string) => api<CrawlProgress>("POST", `/api/projects/${id}/crawl`),
  crawlStatus: (id: string, jobId?: string) =>
    api<CrawlProgress>("GET", `/api/projects/${id}/crawl/status${jobId ? `?job_id=${jobId}` : ""}`),
  stats: (id: string) => api<ProjectStats>("GET", `/api/projects/${id}/stats`),
  pages: (id: string, opts: Record<string, string | number | boolean | undefined> = {}) => {
    const q = new URLSearchParams();
    Object.entries(opts).forEach(([k, v]) => { if (v !== undefined && v !== "") q.set(k, String(v)); });
    const qs = q.toString();
    return api<Page[]>("GET", `/api/projects/${id}/pages${qs ? "?" + qs : ""}`);
  },
  publish: (id: string, targetLanguage?: string) => {
    const query = targetLanguage
      ? `?target_language=${encodeURIComponent(targetLanguage)}`
      : "";
    return api<Publication>("POST", `/api/projects/${id}/publish${query}`);
  },
  snippet: (id: string, targetLanguage?: string) => {
    const query = targetLanguage
      ? `?target_language=${encodeURIComponent(targetLanguage)}`
      : "";
    return api<SnippetResponse>("GET", `/api/projects/${id}/snippet${query}`);
  },
};

export const PagesApi = {
  get: (id: string) => api<Page>("GET", `/api/pages/${id}`),
  patch: (id: string, body: Partial<Page>) => api<Page>("PATCH", `/api/pages/${id}`, body),
  segments: (id: string) => api<Segment[]>("GET", `/api/pages/${id}/segments`),
  extract: (id: string) => api<Segment[]>("POST", `/api/pages/${id}/extract`),
  translate: (id: string) => api<SegmentTranslateResponse[]>("POST", `/api/pages/${id}/translate`),
  bulk: (items: Array<{ page_id: string; selected_for_translation: boolean }>) =>
    api<{ updated: number }>("POST", "/api/pages/bulk", items),
};

export const SegmentsApi = {
  patch: (id: string, body: Partial<Segment>) => api<Segment>("PATCH", `/api/segments/${id}`, body),
  patchTranslation: (id: string, targetLanguage: string, body: Partial<Segment>) =>
    api<Segment>(
      "PATCH",
      `/api/segments/${id}/translations/${encodeURIComponent(targetLanguage)}`,
      body
    ),
  regenerate: (id: string, targetLanguage?: string) => {
    const query = targetLanguage
      ? `?target_language=${encodeURIComponent(targetLanguage)}`
      : "";
    return api<SegmentTranslateResponse>("POST", `/api/segments/${id}/regenerate${query}`);
  },
  approve: (id: string, targetLanguage?: string) => {
    const query = targetLanguage
      ? `?target_language=${encodeURIComponent(targetLanguage)}`
      : "";
    return api<Segment>("POST", `/api/segments/${id}/approve${query}`);
  },
  translateProject: (projectId: string, targetLanguage: string) =>
    api<SegmentTranslateResponse[]>(
      "POST",
      `/api/projects/${projectId}/translate?target_language=${encodeURIComponent(targetLanguage)}`
    ),
  projectSegments: (
    projectId: string,
    opts: { status?: string; search?: string; targetLanguage?: string } = {}
  ) => {
    const q = new URLSearchParams();
    if (opts.status) q.set("status", opts.status);
    if (opts.search) q.set("search", opts.search);
    if (opts.targetLanguage) q.set("target_language", opts.targetLanguage);
    const qs = q.toString();
    return api<Segment[]>("GET", `/api/projects/${projectId}/segments${qs ? "?" + qs : ""}`);
  },
};

export const TranslationApi = {
  languages: () => api<TranslationLanguageResponse>("GET", "/api/translation/languages"),
  health: () => api<TranslationHealthResponse>("GET", "/api/translation/health"),
  translate: (text: string, sourceLanguage: string, targetLanguage: string) =>
    api<{ translated_text: string; source: string }>("POST", "/api/translate", {
      text,
      source_language: sourceLanguage,
      target_language: targetLanguage,
    }),
  translateBatch: (texts: string[], sourceLanguage: string, targetLanguage: string) =>
    api<TranslationBatchResponse>("POST", "/api/translation/translate", {
      texts,
      source_language: sourceLanguage,
      target_language: targetLanguage,
    }),
  translateItems: (items: Array<{ text: string; source_language: string; target_language: string }>) =>
    api<TranslationBatchResponse>("POST", "/api/translation/translate", {
      items,
    }),
  getEngine: () => api<TranslationEngineStatus>("GET", "/api/translate/engine"),
};

export const RuntimeApi = {
  translations: (projectId: string, lang: string, source: string) =>
    api<RuntimeResponse>("GET", `/api/runtime/${projectId}/translations?lang=${lang}&source=${encodeURIComponent(source)}`),
};
