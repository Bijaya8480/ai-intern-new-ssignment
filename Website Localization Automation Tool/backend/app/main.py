"""FastAPI application entry point.

Run with:  python -m uvicorn app.main:app --reload
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import init_db, engine
from .api import api_router

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
PUBLISHER_DIR = os.path.join(PROJECT_ROOT, "publisher")
SAMPLE_SITE_DIR = os.path.join(PUBLISHER_DIR, "sample-site")
LOCJS_DIR = os.path.join(PUBLISHER_DIR)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Website Localization Automation Tool",
    description="API for crawling, analyzing, translating and publishing website localizations.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS: in development allow the frontend origin; demo default is permissive.
if settings.app_env == "development":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    origins = [settings.frontend_url]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(api_router, prefix="/api")

# Serve the localization runtime script and published translations at a stable,
# snippet-friendly URL (e.g. https://domain/loc.js).
_LOCJS_PATH = os.path.join(PUBLISHER_DIR, "loc.js")


@app.get("/loc.js", response_class=FileResponse)
async def serve_locjs(request: Request):
    if os.path.isfile(_LOCJS_PATH):
        return FileResponse(_LOCJS_PATH, media_type="application/javascript")
    from fastapi.responses import PlainTextResponse

    return PlainTextResponse("/* loc.js not yet generated */", media_type="text/plain")


# Runtime translations payload endpoint is mounted under the api router (/api/runtime/...).

# Serve the sample site so the publish/test flow can be demoed on one origin.
if os.path.isdir(SAMPLE_SITE_DIR):
    app.mount("/sample-site", StaticFiles(directory=SAMPLE_SITE_DIR, html=True), name="sample_site")


@app.get("/health")
async def health():
    return {"status": "ok", "env": settings.app_env}
