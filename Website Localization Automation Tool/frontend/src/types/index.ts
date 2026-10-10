export interface Project {
  id: string;
  name: string;
  source_url: string;
  target_language: string;
  target_language_name?: string;
  source_language?: string;
  source_language_name?: string;
  status: string;
  published_publication_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ProjectCreate {
  name: string;
  source_url: string;
  target_language: string;
  target_language_name?: string;
  source_language?: string;
  source_language_name?: string;
}

export type CrawlStatus = "pending" | "running" | "completed" | "failed";

export interface CrawlProgress {
  job_id: string;
  project_id: string;
  status: CrawlStatus;
  total_pages: number;
  pages_discovered: number;
  pages_crawled: number;
  pages_failed: number;
  current_url?: string;
  error?: string;
}

export interface Page {
  id: string;
  project_id: string;
  url: string;
  normalized_url: string;
  title?: string;
  http_status?: number;
  word_count: number;
  detected_language?: string;
  content_type: string;
  crawl_status: string;
  crawl_error?: string;
  last_crawled_at?: string;
  translation_status: string;
  selected_for_translation: boolean;
  raw_html?: string;
}

export type SegmentStatus = "pending" | "machine_translated" | "edited" | "approved";

export interface Segment {
  id: string;
  page_id: string;
  source_text: string;
  target_text?: string;
  source_hash: string;
  element_type?: string;
  element_selector?: string;
  translation_status: SegmentStatus;
  target_language?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SegmentTranslateResponse {
  segment_id: string;
  target_text: string;
  translation_status: string;
  used_memory: boolean;
  source: string;
}

export interface ProjectStats {
  total_pages: number;
  total_words: number;
  selected_pages: number;
  translated_pages: number;
  approved_pages: number;
  published_pages: number;
  estimated_effort: string;
}

export interface Publication {
  id: string;
  project_id: string;
  version: number;
  target_language?: string;
  status: string;
  published_at?: string;
  stats?: string;
}

export interface SnippetResponse {
  project_id: string;
  publication_id: string;
  version: number;
  snippet: string;
  target_language: string;
}

export interface TranslationRecord {
  url: string;
  selector: string;
  source_hash: string;
  source_text: string;
  target_text: string;
  element_type?: string;
}

export interface RuntimeResponse {
  project_id: string;
  publication_id: string;
  version: number;
  target_language: string;
  target_language_name: string;
  source_language?: string;
  segments: TranslationRecord[];
}

export interface TranslationLanguageInfo {
  code: string;
  name: string;
  nativeName?: string;
}

export interface TranslationLanguageResponse {
  languages: TranslationLanguageInfo[];
  translation_directions: Record<string, string[]>;
  model_version?: string;
}

export interface TranslationEngineInfo {
  name: string;
  label: string;
  available: boolean;
  priority: number;
}

export interface TranslationEngineStatus {
  primary: string;
  engines: TranslationEngineInfo[];
}

export interface BatchTranslateItem {
  text: string;
  source_language: string;
  target_language: string;
}

export interface BatchTranslationResult {
  source_text: string;
  translated_text: string;
  source_language: string;
  target_language: string;
  provider: string;
}

export interface TranslationBatchResponse {
  translations: BatchTranslationResult[];
  count: number;
  model_version: string;
}

export interface TranslationHealthResponse {
  status: string;
  available: boolean;
  providers: Record<string, boolean>;
  model_version: string;
}
