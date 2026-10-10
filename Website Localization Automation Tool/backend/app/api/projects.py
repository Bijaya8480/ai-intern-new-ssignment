"""Projects, crawl, pages-listing and publish APIs."""
from __future__ import annotations

import shutil
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy import select, func, delete
from sqlalchemy.orm import selectinload

from ..database import get_db, SessionFactory
from ..models import Project, Page, CrawlJob, Publication, TranslationSegment, TranslationMemory
from ..schemas import (
    ProjectCreate, ProjectRead, PageRead, CrawlProgress, ProjectStats,
)
from ..services.crawler import CrawlerService
from ..utils import word_count as wc

router = APIRouter()
crawler = CrawlerService()


# ---- Projects -----------------------------------------------------------
@router.post("/projects", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate, db: SessionFactory = Depends(get_db)):
    project = Project(
        name=payload.name,
        source_url=str(payload.source_url).strip(),
        target_language=payload.target_language,
        target_language_name=payload.target_language_name or payload.target_language,
        source_language=payload.source_language,
        source_language_name=payload.source_language_name or "",
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/projects/{project_id}", response_model=ProjectRead)
def get_project(project_id: str, db: SessionFactory = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("/projects", response_model=List[ProjectRead])
def list_projects(limit: int = 50, db: SessionFactory = Depends(get_db)):
    rows = db.execute(select(Project).order_by(Project.created_at.desc()).limit(limit)).scalars().all()
    return rows


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: str, db: SessionFactory = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    db.delete(project)
    db.commit()
    # remove the sqlite file is not done here; only rows.
    return None


# ---- Crawl --------------------------------------------------------------
@router.post("/projects/{project_id}/crawl", response_model=CrawlProgress)
def start_crawl(project_id: str, db: SessionFactory = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        # validate URL first
    v = crawler.validate_target(project.source_url)
    if not v.valid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid or unreachable URL: {v.error}",
        )

    # Persist the validated/normalized URL so the crawler uses a canonical base
    if v.normalized and v.normalized != project.source_url:
        project.source_url = v.normalized
        db.commit()

    job = crawler.start_crawl(project_id, db)
    return CrawlProgress(
        job_id=job.id,
        project_id=job.project_id,
        status=job.status,
        total_pages=job.total_pages,
        pages_discovered=job.pages_discovered,
        pages_crawled=job.pages_crawled,
        pages_failed=job.pages_failed,
        current_url=job.current_url,
        error=job.error,
    )


@router.get("/projects/{project_id}/crawl/status", response_model=CrawlProgress)
def crawl_status(project_id: str, job_id: Optional[str] = None, db: SessionFactory = Depends(get_db)):
    q = select(CrawlJob).where(CrawlJob.project_id == project_id).order_by(CrawlJob.created_at.desc())
    if job_id:
        q = select(CrawlJob).where(CrawlJob.id == job_id)
    job = db.execute(q).scalars().first()
    if not job:
        raise HTTPException(status_code=404, detail="Crawl job not found")
    return CrawlProgress(
        job_id=job.id,
        project_id=job.project_id,
        status=job.status,
        total_pages=job.total_pages,
        pages_discovered=job.pages_discovered,
        pages_crawled=job.pages_crawled,
        pages_failed=job.pages_failed,
        current_url=job.current_url,
        error=job.error,
    )


# ---- Pages --------------------------------------------------------------
def _page_to_read(p: Page) -> PageRead:
    return PageRead(
        id=p.id, project_id=p.project_id, url=p.url, normalized_url=p.normalized_url,
        title=p.title, http_status=p.http_status, word_count=p.word_count,
        detected_language=p.detected_language, content_type=p.content_type,
        crawl_status=p.crawl_status, crawl_error=p.crawl_error, last_crawled_at=p.last_crawled_at,
        translation_status=p.translation_status, selected_for_translation=p.selected_for_translation,
    )


@router.get("/projects/{project_id}/pages", response_model=List[PageRead])
def list_pages(
    project_id: str,
    selected: Optional[bool] = None,
    crawl_status: Optional[str] = None,
    content_type: Optional[str] = None,
    search: Optional[str] = None,
    sort: Optional[str] = None,
    order: str = "asc",
    db: SessionFactory = Depends(get_db),
):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    q = select(Page).where(Page.project_id == project_id)
    if selected is not None:
        q = q.where(Page.selected_for_translation == selected)
    if crawl_status:
        q = q.where(Page.crawl_status == crawl_status)
    if content_type:
        q = q.where(Page.content_type == content_type)
    if search:
        like = f"%{search}%"
        q = q.where((Page.title.like(like)) | (Page.normalized_url.like(like)))
    if sort:
        col = getattr(Page, sort, Page.page_order)
        q = q.order_by(col.desc() if order == "desc" else col.asc())
    pages = db.execute(q).scalars().all()
    return [_page_to_read(p) for p in pages]


@router.get("/pages/{page_id}", response_model=PageRead)
def get_page(page_id: str, db: SessionFactory = Depends(get_db)):
    p = db.get(Page, page_id)
    if not p:
        raise HTTPException(status_code=404, detail="Page not found")
    return _page_to_read(p)


@router.patch("/pages/{page_id}")
def update_page(page_id: str, payload: dict, db: SessionFactory = Depends(get_db)):
    page = db.get(Page, page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    for k, v in payload.items():
        if hasattr(page, k):
            setattr(page, k, v)
    db.commit()
    db.refresh(page)
    return _page_to_read(page)


@router.post("/pages/bulk")
def bulk_update_pages(selections: List[dict], db: SessionFactory = Depends(get_db)):
    """[{page_id, selected_for_translation}]"""
    for item in selections:
        page = db.get(Page, item.get("page_id"))
        if not page:
            continue
        if "selected_for_translation" in item:
            page.selected_for_translation = bool(item["selected_for_translation"])
        db.commit()
    return {"updated": len(selections)}


# ---- Project statistics -------------------------------------------------
@router.get("/projects/{project_id}/stats", response_model=ProjectStats)
def project_stats(project_id: str, db: SessionFactory = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    pages = db.execute(select(Page).where(Page.project_id == project_id)).scalars().all()
    total_words = sum(p.word_count or 0 for p in pages)
    selected = sum(1 for p in pages if p.selected_for_translation)
    translated = sum(1 for p in pages if p.translation_status in ("complete", "approved", "partial"))
    approved = sum(1 for p in pages if p.translation_status == "approved")
    published = 0
    pub = (
        db.execute(select(Publication).where(Publication.project_id == project_id).order_by(Publication.version.desc()).limit(1))
        .scalars().first()
    )
    if pub:
        published = 1
    effort = f"{total_words} words (~{max(1, round(total_words/200))} min)"
    return ProjectStats(
        total_pages=len(pages), total_words=total_words, selected_pages=selected,
        translated_pages=translated, approved_pages=approved,
        published_pages=published, estimated_effort=effort,
    )
