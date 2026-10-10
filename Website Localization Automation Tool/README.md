# Website Localization Automation Tool

A full-stack application for crawling websites, extracting translatable content, reviewing translations, and publishing them through a browser-side localization runtime.

## Features

- Create and manage localization projects for a website.
- Crawl pages and extract text and selected HTML attributes into translation segments.
- Select target languages during review and independently translate, edit, and approve each language.
- Publish approved translations per language and retrieve its JavaScript localization snippet.
- Use the included `publisher/loc.js` runtime and sample site to exercise the publishing flow.

## Architecture

| Component | Technology | Location |
|---|---|---|
| Frontend | React, TypeScript, Vite | `frontend/` |
| Backend API | FastAPI, SQLAlchemy | `backend/app/` |
| Database | SQLite by default | Configured by `DATABASE_URL` |
| Publisher runtime | JavaScript | `publisher/loc.js` |
| Demo site | Static HTML | `publisher/sample-site/` |

## Requirements

- Python 3.10 or newer
- Node.js 20 or newer and npm
- Internet access for network-backed translation providers
- Playwright browser installation for crawling sites that need browser rendering

## Run locally

Open two terminals from the project root.

### 1. Start the backend

Windows PowerShell:

```powershell
Set-Location backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

If PowerShell does not allow activation, run the virtual environment's Python directly:

```powershell
.\venv\Scripts\python.exe -m pip install -r requirements.txt
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 2. Start the frontend

In a second terminal:

```powershell
Set-Location frontend
npm install
npm run dev
```

Open the URL printed by Vite (normally <http://127.0.0.1:5174>). The Vite development server proxies `/api`, `/loc.js`, `/runtime`, and `/sample-site` to the backend at `http://127.0.0.1:8000`.

Useful local URLs:

- Frontend: <http://127.0.0.1:5174>
- Backend health: <http://127.0.0.1:8000/health>
- Translation health: <http://127.0.0.1:8000/api/translation/health>
- OpenAPI documentation: <http://127.0.0.1:8000/docs>
- Demo site: <http://127.0.0.1:8000/sample-site/>

## Docker

From the project root, run:

```powershell
docker compose up --build
```

The Compose configuration exposes the frontend on port `5174` and the backend on port `8000`.

## Translation support and limitations

The backend exposes a language registry and advertised translation directions through `GET /api/translation/languages`. The registry includes English, Hindi, Odia, Bengali, Tamil, Telugu, Marathi, Gujarati, Punjabi, Assamese, Kannada, Malayalam, Urdu, Nepali, Sanskrit, and additional languages. Availability in the registry does not guarantee that every provider supports every direction or that every translation has been verified.

The translation service attempts Bing Translator (via the `translators` library, supporting all 33 languages), then Google Translate (free, via `deep-translator`), then MyMemory when the first provider fails. A comprehensive local phrase dictionary provides verified offline translations for common phrases across all language pairs. These network-backed providers require internet access and may be rate-limited or unavailable.

### IndicTrans2 (optional self-hosted translation)

The project includes an optional [AI4Bharat IndicTrans2](https://github.com/AI4Bharat/IndicTrans2) integration for high-quality Indian-language translation. It is **disabled by default** unless the model is actually installed and loadable. The integration is lazy-loaded to avoid importing `torch`/`transformers` at startup.

To enable IndicTrans2:

1. Install the required dependencies in the backend virtual environment:

   ```powershell
   Set-Location backend
   .\venv\Scripts\python.exe -m pip install torch transformers sentencepiece
   ```

2. (Optional) Download a model checkpoint from Hugging Face (requires `huggingface_hub`):

   ```powershell
   .\venv\Scripts\python.exe -m pip install huggingface_hub
   .\venv\Scripts\python.exe -c "from huggingface_hub import snapshot_download; snapshot_download('ai4bharat/indictrans2-en-indic', local_dir='./models/indictrans2-en-indic')"
   ```

3. Configure the backend to use the local model by setting the following in `backend/.env`:

   ```
   INDICTRANS2_ENABLED=true
   LOCAL_TRANSLATION_MODEL=ai4bharat/indictrans2-en-indic
   TRANSLATION_MODEL_VERSION=indictrans2-v1
   ```

   Or, for server mode (recommended for production), run the IndicTrans2 server and set:

   ```
   INDICTRANS2_URL=http://127.0.0.1:8020
   INDICTRANS2_ENABLED=true
   ```

4. Verify the health endpoint reports `indictrans2: true`:

   ```
   curl http://127.0.0.1:8000/api/translation/health
   ```

If IndicTrans2 is not available (no model installed or server unreachable), the system gracefully falls back to dictionary translations, Google Translate (free), and MyMemory. The `indictrans2` provider is tried first for Indian language pairs when available.

**Hardware requirements:** IndicTrans2 requires significant RAM/CPU for in-process inference. A GPU is recommended for reasonable latency. Without the model, the system works with the other fallback providers.

The following basic phrases have been verified in both directions by the project tests/workflow:

| Direction | Example |
|---|---|
| English → Hindi | `hello world` → `नमस्ते दुनिया` |
| English → Odia | `hello world` → `ହ୍ୟାଲୋ ଦୁନିଆ` |
| Hindi → English | `नमस्ते दुनिया` → `hello world` |
| Odia → English | `ହ୍ୟାଲୋ ଦୁନିଆ` → `hello world` |

Treat these as phrase-level checks, not as a quality guarantee for full websites or proof that all registry languages and directions work with every configured provider. The project does not bundle a self-hosted IndicTrans2 model.

## Translation API

All API routes are mounted under `/api`.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/translation/languages` | Return language names, native names, supported-direction metadata, and model version |
| `GET` | `/api/translation/health` | Report translation-provider availability |
| `POST` | `/api/translation/translate` | Translate a batch of texts |
| `POST` | `/api/translate` | Translate a single text |
| `GET` | `/api/translate/engine` | Report configured translation engine status |

Example batch request:

```json
{
  "texts": ["Hello", "Welcome to our website"],
  "source_language": "en",
  "target_language": "hi"
}
```

Send it as JSON to `POST /api/translation/translate`. Batch size is limited by the `TRANSLATION_BATCH_SIZE` setting (default: 25). See <http://127.0.0.1:8000/docs> for the live request and response schemas.

## Configuration

Backend settings can be set as environment variables or placed in `backend/.env`. Common settings include:

| Variable | Default | Purpose |
|---|---|---|
| `APP_ENV` | `development` | Application environment |
| `DATABASE_URL` | `sqlite:///./loc_tool.db` | Database connection |
| `FRONTEND_URL` | `http://localhost:5173` | Allowed frontend origin outside development |
| `USE_GOOGLE_TRANSLATE` | `true` | Enable the `deep-translator` Google provider |
| `USE_BING_TRANSLATOR` | `true` | Enable Bing Translator (free, all languages) |
| `GOOGLE_CLOUD_TRANSLATE_KEY` | unset | Google Cloud translation credential setting |
| `OPENROUTER_API_KEY` | unset | OpenRouter credential setting |
| `OPENAI_API_KEY` | unset | OpenAI credential setting |
| `TRANSLATION_BATCH_SIZE` | `25` | Maximum number of text items per batch |
| `TRANSLATION_REQUEST_TIMEOUT` | `30.0` | Translation request timeout setting |
| `TRANSLATION_RETRY_ATTEMPTS` | `3` | Translation retry setting |

Provider support in the translation service may differ from the settings advertised by the engine-status endpoint. Check `/api/translation/health` and `/api/translate/engine` in the environment you are running before relying on a provider. Never commit API keys or production secrets.

## Typical workflow

1. Open the frontend and create a project with a source website and target language.
2. Crawl the site and review the discovered pages.
3. Extract segments, translate them, then edit and approve the results.
4. Publish the project and copy the generated localization snippet into the source website.
5. Test the published behavior using the runtime endpoint and included sample site.

## Tests and checks

Backend tests:

```powershell
Set-Location backend
.\venv\Scripts\python.exe -m pytest -v
```

Frontend type check and production build:

```powershell
Set-Location frontend
npm run typecheck
npm run build
```

Some tests may require the optional browser dependencies or network access. Run them in the configured development environment and review failures rather than treating an unrun test as passing.

## Repository layout

```text
backend/
  app/
    api/          FastAPI route handlers
    constants/    Language metadata
    models/       Database models
    schemas/      API schemas
    services/     Crawling, extraction, translation, publishing
    utils/        Shared utilities
  tests/          Backend tests
frontend/
  src/
    components/   Shared UI and layout
    pages/        Application screens
    services/     Frontend API client
    types/        TypeScript types
publisher/
  loc.js          Browser localization runtime
  sample-site/    Local demo website
docs/
  technical-notes.md
docker-compose.yml
```
