"""Runtime endpoint consumed by the published loc.js snippet.

GET /api/runtime/{project_id}/translations?lang=es

Returns only the *published* (approved) translation records for the project's
latest publication, scoped to the requested target language. The response is
served with permissive CORS so the snippet can be embedded on any origin.
"""
from __future__ import annotations

import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy import select

from ..database import get_db, SessionFactory
from ..models import Project, Publication
from ..constants.languages import LANGUAGES
from ..schemas import RuntimeResponse, TranslationRecord

router = APIRouter()


@router.get("/runtime/{project_id}/translations")
def runtime_translations(
    project_id: str,
    lang: Optional[str] = Query(default=None),
    source: Optional[str] = Query(default=None, description="Relative path of the current page, e.g. /about"),
    db: SessionFactory = Depends(get_db),
):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    language = (lang or project.target_language).lower()
    if language not in LANGUAGES:
        raise HTTPException(status_code=422, detail="Unsupported target language")
    query = select(Publication).where(
        Publication.project_id == project_id,
        Publication.target_language == language,
    )
    if language == project.target_language:
        query = select(Publication).where(
            Publication.project_id == project_id,
            (Publication.target_language == language) | (Publication.target_language.is_(None)),
        )
    pub = db.execute(query.order_by(Publication.version.desc())).scalars().first()
    if pub is None and language == project.target_language and project.published_publication_id:
        pointed_publication = db.get(Publication, project.published_publication_id)
        if pointed_publication and pointed_publication.target_language in (None, language):
            pub = pointed_publication
    if not pub:
        raise HTTPException(status_code=409, detail="This language has not been published yet")

    # The stored translations are in the project's target language; if a `lang`
    # query is provided and differs we still return the published target set.
    try:
        records = json.loads(pub.translations_json or "[]")
    except Exception:
        records = []

    segments: List[TranslationRecord] = []
    for r in records:
        if source:
            # match either the full path or strip trailing slash differences
            rurl = r.get("url", "")
            if rurl != source and rurl != source.rstrip("/") and source.rstrip("/") != rurl:
                continue
        segments.append(TranslationRecord(
            url=r.get("url", ""),
            selector=r.get("selector", ""),
            source_hash=r.get("source_hash", ""),
            source_text=r.get("source_text", ""),
            target_text=r.get("target_text", ""),
            element_type=r.get("element_type"),
        ))

    response = RuntimeResponse(
        project_id=project.id,
        publication_id=pub.id,
        version=pub.version,
        target_language=language,
        target_language_name=LANGUAGES.get(language, language),
        source_language=project.source_language,
        segments=segments,
    )
    # CORS permissive for cross-origin snippet embedding (demo); tighten in prod
    # via publisher_base_url allowlist.
    resp = JSONResponse(content=response.model_dump())
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return resp
