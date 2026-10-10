"""Publishing: validate approved translations, create a publication, gen snippet."""
from __future__ import annotations

import json
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status, Query

from sqlalchemy import select

from ..database import get_db, SessionFactory
from ..models import Project, Page, TranslationSegment, TranslationVariant, Publication
from ..schemas import PublicationRead, ProjectStats, TranslationRecord
from ..config import settings
from ..services.publishing import inject_into_sample_site
from ..constants.languages import LANGUAGES

router = APIRouter()


@router.post("/projects/{project_id}/publish", response_model=PublicationRead)
def publish_project(
    project_id: str,
    target_language: str | None = Query(default=None, min_length=2, max_length=16),
    db: SessionFactory = Depends(get_db),
):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    language = (target_language or project.target_language).lower()
    if language not in LANGUAGES:
        raise HTTPException(status_code=422, detail="Unsupported target language")

    pages = db.execute(select(Page).where(Page.project_id == project_id,
          Page.selected_for_translation == True)).scalars().all()
    if not pages:
        raise HTTPException(status_code=422, detail="No pages selected for translation")

    selected_ids = [p.id for p in pages]

    # Validate: every selected page must have at least one approved segment if it has segments
    missing_approved = []
    records: List[dict] = []
    for page in pages:
        segs = db.execute(select(TranslationSegment).where(
            TranslationSegment.page_id == page.id)).scalars().all()
        if not segs:
            missing_approved.append(page.normalized_url)
            continue
        if language == project.target_language:
            approved = [
                (s, s.target_text)
                for s in segs
                if s.translation_status == "approved" and s.target_text
            ]
        else:
            variants = db.execute(
                select(TranslationVariant).where(
                    TranslationVariant.segment_id.in_([s.id for s in segs]),
                    TranslationVariant.target_language == language,
                    TranslationVariant.translation_status == "approved",
                    TranslationVariant.target_text.is_not(None),
                )
            ).scalars().all()
            segments_by_id = {s.id: s for s in segs}
            approved = [(segments_by_id[v.segment_id], v.target_text) for v in variants]
        if not approved:
            missing_approved.append(page.normalized_url)
            continue
        rel = _relative_path(project.source_url, page.normalized_url)
        for s, target_text in approved:
            records.append({
                "url": rel,
                "selector": s.element_selector or "",
                "source_hash": s.source_hash,
                "source_text": s.source_text,
                "target_text": target_text,
                "element_type": s.element_type or "text",
            })

    # Publication versions are project-wide because the existing database
    # enforces uniqueness for (project_id, version), independent of language.
    latest = db.execute(
        select(Publication)
        .where(Publication.project_id == project_id)
        .order_by(Publication.version.desc())
    ).scalars().first()
    next_version = (latest.version + 1) if latest else 1

    stats = {"total": len(records), "pages": len(pages),
             "without_approved_segments": len(missing_approved)}
    pub = Publication(
        project_id=project_id,
        version=next_version,
        target_language=language,
        status="published",
        published_at=datetime.utcnow(),
        stats=json.dumps(stats),
        translations_json=json.dumps(records),
    )
    db.add(pub)
    db.commit()
    db.refresh(pub)
    project.published_publication_id = pub.id
    db.commit()

    # Inject the live snippet into the demo sample site (idempotent) and
    # default to the source language so the site loads in English, letting the
    # visitor switch to the target language.
    default_lang = project.source_language or "en"
    try:
        inject_into_sample_site(project.id, default_lang)
    except Exception as exc:
        log_opt = __import__("logging").getLogger("loc_tool")
        log_opt.warning("Failed to inject snippet into sample site: %s", exc)

    # Update page translation_status -> published
    if language == project.target_language:
        for p in pages:
            p.translation_status = "approved"
    db.commit()

    return PublicationRead(id=pub.id, project_id=project_id, version=pub.version,
                           target_language=language,
                           status=pub.status, published_at=pub.published_at, stats=pub.stats)


@router.get("/projects/{project_id}/snippet")
def get_snippet(
    project_id: str,
    target_language: str | None = Query(default=None, min_length=2, max_length=16),
    db: SessionFactory = Depends(get_db),
):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    language = (target_language or project.target_language).lower()
    if language not in LANGUAGES:
        raise HTTPException(status_code=422, detail="Unsupported target language")
    publication_query = select(Publication).where(
        Publication.project_id == project_id,
        Publication.target_language == language,
    )
    if language == project.target_language:
        publication_query = select(Publication).where(
            Publication.project_id == project_id,
            (Publication.target_language == language) | (Publication.target_language.is_(None)),
        )
    pub = db.execute(publication_query.order_by(Publication.version.desc())).scalars().first()
    if pub is None and language == project.target_language and project.published_publication_id:
        pointed_publication = db.get(Publication, project.published_publication_id)
        if pointed_publication and pointed_publication.target_language in (None, language):
            pub = pointed_publication
    if not pub:
        raise HTTPException(status_code=409, detail="This language has not been published yet")
    snippet = (
        f'<script src="{settings.publisher_base_url}/loc.js" '
        f'data-project="{project.id}" '
        f'data-lang="{settings.snippet_default_lang}">'
        f'</script>'
    )
    return {"project_id": project.id, "publication_id": pub.id, "version": pub.version,
            "snippet": snippet, "target_language": language}


def _relative_path(base_url: str, normalized_url: str) -> str:
    from urllib.parse import urlparse
    b = urlparse(base_url)
    u = urlparse(normalized_url)
    path = u.path or "/"
    if not path.startswith("/"):
        path = "/" + path
    return path
