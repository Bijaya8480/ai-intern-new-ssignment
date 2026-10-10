# Technical Notes

## Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Frontend   │──── │   Backend    │──── │  SQLite DB   │
│  (Vite)     │     │  (FastAPI)   │     │  loc_tool.db │
│  port:5174  │──── │  port:8000   │──── │              │
└─────────────┘     └──────────────┘     └──────────────┘
                         │
                         ├─ loc.js (runtime script)
                         ├─ /sample-site (static demo site)
                         └─ /api/runtime (translation JSON)
```

### Components

| Component | Path | Description |
|-----------|------|-------------|
| Backend API | `backend/app/` | FastAPI app with routers for projects, pages, segments, publish, runtime |
| Frontend UI | `frontend/src/` | React + TypeScript + Tailwind CSS SPA |
| Publisher | `publisher/` | `loc.js` runtime script + `sample-site/` demo website |
| Database | SQLite | 7 tables, including language-specific translation variants |

## Database Schema

### SQLAlchemy 1.4 (ORM models in `app/models/__init__.py`)

1. **projects** — `id` (ulid), `name`, `source_url`, `target_language`, `source_language`, `status`, `created_at`
2. **pages** — `id` (ulid), `project_id` (FK), `url`, `normalized_url`, `title`, `word_count`, `content_type`, `crawl_status`, `translation_status`
3. **crawl_jobs** — `id` (ulid), `project_id`, `status`, `started_at`, `finished_at`, `stats` (JSON)
4. **translation_segments** — `id` (ulid), `page_id` (FK), `source_text`, the project's original target text, `source_hash`, `element_selector`, `element_type`, `translation_status`
5. **translation_variants** — `id`, `segment_id` (FK), `target_language`, `target_text`, and language-specific `translation_status` (unique: segment_id + target_language)
6. **translation_memory** — `id` (ulid), `project_id`, source/target language pair, `source_hash`, `source_text`, `target_text`, `used_count`
7. **publications** — `id` (ulid), `project_id`, `target_language`, `version`, `status`, `published_at`

Existing segment target fields remain the project's original target language for backwards compatibility. Other languages are stored independently in `translation_variants`; publishing and runtime snapshots are selected by language. Publication version numbers increase project-wide for compatibility with the existing unique constraint. SQLite startup adds the publication language column to existing databases.

### Hash Strategy

Text is normalized before hashing: lowercase + whitespace-collapse. This ensures "Get Started" and "  get   started  " produce the same hash, matching loc.js's `hashCode()` function.

- Python: `app/utils.py:hash_text()` — djb2 variant, returns `"hash_len"` format
- JavaScript: `publisher/loc.js:hashCode()` — same algorithm
- Cross-verification: `tests/locjs_hash_test.js` (20 cases) + `backend/tests/test_utils.py` (9 cross-checks)

## API Endpoints

### Projects
- `POST /api/projects` — Create project
- `GET /api/projects` — List projects
- `GET /api/projects/{id}` — Get project
- `DELETE /api/projects/{id}` — Delete project
- `GET /api/projects/{id}/stats` — Project statistics
- `POST /api/projects/{id}/crawl` — Start crawl
- `GET /api/projects/{id}/crawl/status?job_id=...` — Poll crawl status
- `POST /api/projects/{id}/publish` — Publish translations
- `GET /api/projects/{id}/snippet` — Get JavaScript snippet
- `POST /api/projects/{id}/translate?target_language=hi` — Translate selected pages into a language variant
- `POST /api/projects/{id}/publish?target_language=hi` — Publish approved translations for a language
- `GET /api/projects/{id}/snippet?target_language=hi` — Get that language's published snippet

### Pages
- `GET /api/pages/{id}` — Get page
- `PATCH /api/pages/{id}` — Update page (selection)
- `POST /api/pages/bulk` — Bulk update page selection
- `POST /api/pages/{id}/extract` — Extract segments from HTML
- `GET /api/pages/{id}/segments` — List segments
- `POST /api/pages/{id}/translate` — Translate all segments
- `GET /api/projects/{id}/segments?target_language=hi` — List a language-specific translation set

### Segments
- `PATCH /api/segments/{id}` — Update segment text/status
- `POST /api/segments/{id}/regenerate` — Regenerate translation
- `POST /api/segments/{id}/approve` — Approve segment
- `PATCH /api/segments/{id}/translations/{language}` — Save a language variant
- `POST /api/segments/{id}/regenerate?target_language=hi` — Regenerate a language variant
- `POST /api/segments/{id}/approve?target_language=hi` — Approve a language variant

### Runtime (consumed by loc.js)
- `GET /api/runtime/{projectId}/translations?lang=es&source=/path` — Serve translations as JSON

## Content Extraction Strategy

The `extract_segments()` function in `app/services/content_extraction.py` identifies translatable text:

1. **Title** — `<title>` tag
2. **Meta description** — `<meta name="description" content="...">`
3. **Image alt text** — `<img alt="...">`
4. **Body text** — `<h1>`–`<h6>`, `<p>`, `<button>`, `<a>` (non-URL), `<li>`, `<span>`, `<div>`

Excluded subtrees: `<script>`, `<style>`, `<code>`, `<pre>`, `<textarea>`, `<noscript>`, `<svg>`, `<head>`.

### CSS Path Generation (`css_path()`)

Builds a unique CSS selector for each element using:
- Tag name (or `#id` if present)
- `:nth-of-type(n)` when siblings of the same type exist
- Parent-above navigation until `<html>`

Example: `html > body > main > section:nth-of-type(2) > button:nth-of-type(1)`

## Translation Strategy

1. **Translation Memory** — First translation is stored in DB; subsequent identical strings reuse it (`used_memory=True`)
2. **Local dictionary** — For common phrases in 26+ language pairs, a built-in dictionary provides verified translations without network access
3. **IndicTrans2 (self-hosted)** — AI4Bharat IndicTrans2 model, used for Indian language pairs when available (lazy-loaded, requires `torch`/`transformers` and a downloaded model)
4. **Bing Translator** — Free Microsoft translator via the `translators` library; supports all 33 languages including Indic and Asian scripts
5. **Google Cloud Translation API** — Official Google Cloud AI service (requires `GOOGLE_CLOUD_TRANSLATE_KEY`). Used when configured.
6. **Google Translate (free)** — `deep-translator` Google Translate, enabled via `USE_GOOGLE_TRANSLATE`.
7. **MyMemory API** — Public free translation API fallback.
8. **LLM** — OpenRouter or OpenAI API, used when `OPENROUTER_API_KEY` / `OPENAI_API_KEY` is configured.

### IndicTrans2 Integration

- **Config file:** `backend/app/services/indic_translator.py`
- **Client class:** `IndicTrans2Client` — singleton with lazy model loading
- **Integration point:** `TranslationService._live_translate()` in `backend/app/services/translation.py`
- **Health check:** `ts.health()` reports `providers.indictrans2` based on `ts._indic_available()`
- **Lazy loading:** `torch`/`transformers` imports are deferred until first use
- **Model loading:** Uses `_try_load_model()` which verifies the model can actually be loaded (not just dependencies)
- **Server mode:** When `INDICTRANS2_URL` is configured and a server is reachable, HTTP requests are used instead of loading the model
- **Graceful fallback:** If IndicTrans2 is unavailable, the service falls through to Google Translate / MyMemory / dictionary

### IndicTrans2 Configuration

| Variable | Default | Description |
|---|---|---|
| `INDICTRANS2_ENABLED` | `true` | Enable/disable IndicTrans2 |
| `LOCAL_TRANSLATION_MODEL` | `ai4bharat/indictrans2-en-indic` | HuggingFace model identifier |
| `INDICTRANS2_URL` | `http://127.0.0.1:8020` | HTTP server URL (for server mode) |
| `TRANSLATION_MODEL_VERSION` | `indictrans2-v1` | Model version label for memory records |

### Supported Indian Languages

- English (en), Hindi (hi), Odia (or), Bengali (bn), Tamil (ta), Telugu (te), Marathi (mr), Gujarati (gu), Punjabi (pa), Assamese (as), Kannada (kn), Malayalam (ml), Urdu (ur), Nepali (ne), Sanskrit (sa)

## loc.js Runtime

The `publisher/loc.js` script runs in the browser and:
1. Reads `data-project` and `data-lang` from `<script src="/loc.js" data-project="..." data-lang="es">`
2. Fetches translations from `/api/runtime/{projectId}/translations?lang={lang}&source={currentPath}`
3. For each segment, queries the DOM using the stored CSS selector
4. Verifies `hashCode(element text) === source_hash` before replacing text
5. Replaces text content in matching elements

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_ENV` | `development` | `development` or `production` |
| `DATABASE_URL` | `sqlite:///./loc_tool.db` | SQLAlchemy connection string |
| `FRONTEND_URL` | `http://localhost:5173` | Allowed CORS origin (production) |
| `MAX_CRAWL_PAGES` | `50` | Max pages to crawl per project |
| `USE_PLAYWRIGHT` | `true` | Use Playwright for rendering JS-heavy sites |
| `OPENROUTER_API_KEY` | — | OpenRouter API key for AI translation |
| `OPENAI_API_KEY` | — | OpenAI API key for AI translation |
| `GOOGLE_CLOUD_TRANSLATE_KEY` | — | Google Cloud Translation API key (primary AI translator) |
| `USE_GOOGLE_TRANSLATE` | `true` | Enable free Google Translate (deep-translator) as fallback |
| `INDICTRANS2_ENABLED` | `true` | Enable IndicTrans2 self-hosted translator |
| `LOCAL_TRANSLATION_MODEL` | `ai4bharat/indictrans2-en-indic` | HuggingFace model identifier |
| `INDICTRANS2_URL` | `http://127.0.0.1:8020` | IndicTrans2 server URL (for server mode) |
| `TRANSLATION_MODEL_VERSION` | `indictrans2-v1` | Model version label |
| `BING_TRANSLATOR` | `true` | Enable Bing Translator (via `translators` library) |
| `TRANSLATION_BATCH_SIZE` | `25` | Max items per batch |
| `TRANSLATION_REQUEST_TIMEOUT` | `30.0` | Request timeout (seconds) |
| `TRANSLATION_RETRY_ATTEMPTS` | `3` | Retry attempts |

## Docker

```bash
docker-compose up --build
```

- Backend: `http://localhost:8000`
- Frontend: `http://localhost:5174`
- Database persists in volume `loc-tool-data`

## Testing

### Backend (pytest)
```bash
cd backend && venv\Scripts\pytest -v
```

Test structure:
- `tests/test_utils.py` — URL normalization, hash, word count, language detection, URL validation
- `tests/test_extraction.py` — HTML content extraction, CSS path generation, DOM matching strategy
- `tests/test_classification.py` — Content type classification heuristics
- `tests/test_api.py` — Integration tests (project CRUD, crawl, extract, translate, publish, runtime)
- `tests/test_translation_api.py` — Translation API endpoint tests (languages, health, translate)
- `tests/test_translation_service.py` — Translation service unit tests, IndicTrans2 integration tests
- `tests/conftest.py` — TestClient fixture, isolated test DB, sample HTML

### Frontend (TypeScript)
```bash
cd frontend && tsc --noEmit
```

### Hash cross-verification
```bash
node tests/locjs_hash_test.js
```

### E2E (Python)
```bash
cd backend && venv\Scripts\pytest -v -m e2e
```
