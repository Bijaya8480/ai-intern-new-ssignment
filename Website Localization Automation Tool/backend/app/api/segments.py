"""Translation segments: extract, list, edit, regenerate, approve."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from ..database import get_db, SessionFactory
from ..models import Page, TranslationSegment, TranslationVariant, Project, Publication
from ..schemas import SegmentRead, SegmentUpdate, SegmentTranslateResponse
from ..services.content_extraction import extract_segments
from ..services.translation import TranslationService
from ..constants.languages import LANGUAGES

router = APIRouter()
ts = TranslationService()


@router.post("/pages/{page_id}/extract", response_model=List[SegmentRead])
def extract_page_segments(page_id: str, db: SessionFactory = Depends(get_db)):
    page = db.get(Page, page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    if not page.raw_html:
        raise HTTPException(status_code=409, detail="Page raw HTML not available for extraction")
    segs = extract_segments(page.raw_html)
    created = 0
    for s in segs:
        page.segments.append(TranslationSegment(**s))
        created += 1
    db.commit()
    db.refresh(page)
    return [_to_read(s) for s in page.segments]


@router.get("/pages/{page_id}/segments", response_model=List[SegmentRead])
def list_segments(page_id: str, db: SessionFactory = Depends(get_db)):
    page = db.get(Page, page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    if not page.segments:
        # auto-extract if not already present
        if page.raw_html:
            segs = extract_segments(page.raw_html)
            for s in segs:
                page.segments.append(TranslationSegment(**s))
            db.commit()
            db.refresh(page)
    return [_to_read(s) for s in page.segments]


@router.post("/pages/{page_id}/translate", response_model=List[SegmentTranslateResponse])
def translate_page(page_id: str, db: SessionFactory = Depends(get_db)):
    page = db.get(Page, page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    project = db.get(Project, page.project_id)
    if not page.segments:
        segs = extract_segments(page.raw_html or "")
        for s in segs:
            page.segments.append(TranslationSegment(**s))
        db.commit()
        db.refresh(page)

    results = []
    for seg in page.segments:
        if seg.translation_status in ("approved", "edited") and seg.target_text:
            results.append(SegmentTranslateResponse(segment_id=seg.id, target_text=seg.target_text,
                                                    translation_status=seg.translation_status, used_memory=True, source="memory"))
            continue
        translated, used_memory, source = ts.translate(
            seg.source_text, project.source_language or "en", project.target_language,
            project.id, db,
        )
        if translated is None:
            # Translation engine could not produce output — keep source but
            # flag as needing review so the editor shows an error state.
            seg.translation_status = "pending"
            results.append(SegmentTranslateResponse(segment_id=seg.id, target_text=seg.source_text,
                                                    translation_status="pending",
                                                    used_memory=False, source="error"))
            continue
        seg.target_text = translated
        seg.translation_status = "machine_translated"
        seg.updated_at = datetime.utcnow()
        results.append(SegmentTranslateResponse(segment_id=seg.id, target_text=translated,
                                                translation_status="machine_translated",
                                                used_memory=used_memory, source=source))
    db.commit()
    _recalc_page_status(page, db)
    return results


@router.post("/projects/{project_id}/translate", response_model=List[SegmentTranslateResponse])
def translate_project(
    project_id: str,
    target_language: str = Query(..., min_length=2, max_length=16),
    db: SessionFactory = Depends(get_db),
):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    target_language = target_language.lower()
    if target_language not in LANGUAGES:
        raise HTTPException(status_code=422, detail="Unsupported target language")

    selected_pages = [page for page in project.pages if page.selected_for_translation]
    if not selected_pages:
        raise HTTPException(status_code=409, detail="No pages selected for translation")

    results = []
    segment_count = 0
    for page in selected_pages:
        if not page.segments and page.raw_html:
            for item in extract_segments(page.raw_html):
                page.segments.append(TranslationSegment(**item))
            db.flush()

        for seg in page.segments:
            segment_count += 1
            variant = None
            if target_language != project.target_language:
                variant = db.execute(
                    select(TranslationVariant).where(
                        TranslationVariant.segment_id == seg.id,
                        TranslationVariant.target_language == target_language,
                    )
                ).scalars().first()
                if variant is None:
                    variant = TranslationVariant(
                        segment_id=seg.id,
                        target_language=target_language,
                        translation_status="pending",
                    )
                    db.add(variant)
                    db.flush()

            status_value = variant.translation_status if variant else seg.translation_status
            target_text = variant.target_text if variant else seg.target_text
            if status_value in ("approved", "edited") and target_text:
                results.append(
                    SegmentTranslateResponse(
                        segment_id=seg.id,
                        target_text=target_text,
                        translation_status=status_value,
                        used_memory=False,
                        source="existing",
                    )
                )
                continue

            translated, used_memory, source = ts.translate(
                seg.source_text,
                project.source_language or "en",
                target_language,
                project.id,
                db,
            )
            if translated is None:
                results.append(
                    SegmentTranslateResponse(
                        segment_id=seg.id,
                        target_text=target_text or "",
                        translation_status=status_value,
                        used_memory=False,
                        source="error",
                    )
                )
                continue

            if variant:
                variant.target_text = translated
                variant.translation_status = "machine_translated"
                variant.updated_at = datetime.utcnow()
            else:
                seg.target_text = translated
                seg.translation_status = "machine_translated"
                seg.updated_at = datetime.utcnow()
            results.append(
                SegmentTranslateResponse(
                    segment_id=seg.id,
                    target_text=translated,
                    translation_status="machine_translated",
                    used_memory=used_memory,
                    source=source,
                )
            )

    if segment_count == 0:
        raise HTTPException(status_code=409, detail="No translation segments found on selected pages")
    db.commit()
    return results


@router.get("/segments/{segment_id}", response_model=SegmentRead)
def get_segment(segment_id: str, db: SessionFactory = Depends(get_db)):
    seg = db.get(TranslationSegment, segment_id)
    if not seg:
        raise HTTPException(status_code=404, detail="Segment not found")
    return _to_read(seg)


@router.patch("/segments/{segment_id}", response_model=SegmentRead)
def update_segment(segment_id: str, payload: SegmentUpdate, db: SessionFactory = Depends(get_db)):
    seg = db.get(TranslationSegment, segment_id)
    if not seg:
        raise HTTPException(status_code=404, detail="Segment not found")
    if payload.target_text is not None:
        seg.target_text = payload.target_text
    if payload.translation_status is not None:
        seg.translation_status = payload.translation_status
        if payload.translation_status == "approved":
            seg.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(seg)
    _recalc_page_status(seg.page, db)
    return _to_read(seg)


@router.post("/segments/{segment_id}/regenerate", response_model=SegmentTranslateResponse)
def regenerate_segment(
    segment_id: str,
    target_language: Optional[str] = Query(default=None, min_length=2, max_length=16),
    db: SessionFactory = Depends(get_db),
):
    seg = db.get(TranslationSegment, segment_id)
    if not seg:
        raise HTTPException(status_code=404, detail="Segment not found")
    project = db.get(Project, seg.page.project_id)
    language = (target_language or project.target_language).lower()
    if language not in LANGUAGES:
        raise HTTPException(status_code=422, detail="Unsupported target language")
    variant = None
    if language != project.target_language:
        variant = db.execute(
            select(TranslationVariant).where(
                TranslationVariant.segment_id == seg.id,
                TranslationVariant.target_language == language,
            )
        ).scalars().first()
        if variant is None:
            variant = TranslationVariant(
                segment_id=seg.id, target_language=language, translation_status="pending"
            )
            db.add(variant)
            db.flush()
    # Regenerate this single segment only; preserve memory reuse.
    translated, used_memory, source = ts.translate(
        seg.source_text, project.source_language or "en", language,
        project.id, db, use_cache=False,
    )
    if translated is None:
        # No engine could translate — keep existing status
        db.commit()
        if variant is None:
            _recalc_page_status(seg.page, db)
        return SegmentTranslateResponse(segment_id=seg.id, target_text=seg.source_text,
                                        translation_status=seg.translation_status,
                                        used_memory=False, source="error")
    if variant:
        variant.target_text = translated
        variant.translation_status = "machine_translated"
        variant.updated_at = datetime.utcnow()
    else:
        seg.target_text = translated
        seg.translation_status = "machine_translated"
        seg.updated_at = datetime.utcnow()
    db.commit()
    if variant is None:
        _recalc_page_status(seg.page, db)
    return SegmentTranslateResponse(segment_id=seg.id, target_text=translated,
                                    translation_status="machine_translated",
                                    used_memory=used_memory, source=source)


@router.post("/segments/{segment_id}/approve", response_model=SegmentRead)
def approve_segment(
    segment_id: str,
    target_language: Optional[str] = Query(default=None, min_length=2, max_length=16),
    db: SessionFactory = Depends(get_db),
):
    seg = db.get(TranslationSegment, segment_id)
    if not seg:
        raise HTTPException(status_code=404, detail="Segment not found")
    project = db.get(Project, seg.page.project_id)
    language = (target_language or project.target_language).lower()
    if language not in LANGUAGES:
        raise HTTPException(status_code=422, detail="Unsupported target language")
    variant = None
    if language != project.target_language:
        variant = db.execute(
            select(TranslationVariant).where(
                TranslationVariant.segment_id == seg.id,
                TranslationVariant.target_language == language,
            )
        ).scalars().first()
    target_text = variant.target_text if variant else seg.target_text
    if not target_text:
        raise HTTPException(status_code=409, detail="Segment has no translation yet")
    if variant:
        variant.translation_status = "approved"
        variant.updated_at = datetime.utcnow()
    else:
        seg.translation_status = "approved"
        seg.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(seg)
    if variant is None:
        _recalc_page_status(seg.page, db)
    return _to_read(seg, variant, language) if variant else _to_read(seg)


@router.patch("/segments/{segment_id}/translations/{target_language}", response_model=SegmentRead)
def update_translation_variant(
    segment_id: str,
    target_language: str,
    payload: SegmentUpdate,
    db: SessionFactory = Depends(get_db),
):
    seg = db.get(TranslationSegment, segment_id)
    if not seg:
        raise HTTPException(status_code=404, detail="Segment not found")
    project = db.get(Project, seg.page.project_id)
    language = target_language.lower()
    if language not in LANGUAGES:
        raise HTTPException(status_code=422, detail="Unsupported target language")
    if language == project.target_language:
        return update_segment(segment_id, payload, db)

    variant = db.execute(
        select(TranslationVariant).where(
            TranslationVariant.segment_id == seg.id,
            TranslationVariant.target_language == language,
        )
    ).scalars().first()
    if variant is None:
        variant = TranslationVariant(
            segment_id=seg.id, target_language=language, translation_status="pending"
        )
        db.add(variant)
    if payload.target_text is not None:
        variant.target_text = payload.target_text
        if payload.translation_status is None:
            variant.translation_status = "edited" if payload.target_text.strip() else "pending"
    if payload.translation_status is not None:
        variant.translation_status = payload.translation_status
    variant.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(variant)
    return _to_read(seg, variant, language)


def _to_read(
    seg: TranslationSegment,
    variant: Optional[TranslationVariant] = None,
    target_language: Optional[str] = None,
) -> SegmentRead:
    is_empty_variant = target_language is not None and variant is None
    return SegmentRead(
        id=seg.id, page_id=seg.page_id, source_text=seg.source_text,
        target_text=(
            variant.target_text if variant else None if is_empty_variant else seg.target_text
        ),
        target_language=target_language,
        source_hash=seg.source_hash,
        element_type=seg.element_type, element_selector=seg.element_selector,
        translation_status=(
            variant.translation_status if variant else "pending" if is_empty_variant else seg.translation_status
        ),
        created_at=seg.created_at, updated_at=variant.updated_at if variant else seg.updated_at,
    )


def _recalc_page_status(page: Page, db):
    segs = page.segments
    if not segs:
        page.translation_status = "not_selected"
    elif all(s.translation_status == "approved" for s in segs):
        page.translation_status = "approved"
    elif all(s.translation_status in ("machine_translated", "edited", "approved") for s in segs):
        page.translation_status = "complete"
    elif any(s.translation_status in ("machine_translated", "edited", "approved") for s in segs):
        page.translation_status = "partial"
    else:
        page.translation_status = "drafted"
    db.commit()


# ---- Project-level segment review -----------------------------------------
@router.get("/projects/{project_id}/segments", response_model=List[SegmentRead])
def list_project_segments(
    project_id: str,
    status: Optional[str] = Query(default=None, description="Filter by translation status"),
    search: Optional[str] = Query(default=None, description="Search in source/target text"),
    target_language: Optional[str] = Query(default=None, min_length=2, max_length=16),
    db: SessionFactory = Depends(get_db),
):
    """Get all segments for a project (for batch review)."""
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    language = (target_language or project.target_language).lower()
    if language not in LANGUAGES:
        raise HTTPException(status_code=422, detail="Unsupported target language")

    # Get all page IDs for this project
    page_ids = [p.id for p in project.pages]
    if not page_ids:
        return []

    q = select(TranslationSegment).where(TranslationSegment.page_id.in_(page_ids))

    if status and language == project.target_language:
        q = q.where(TranslationSegment.translation_status == status)

    if search and language == project.target_language:
        like = f"%{search}%"
        q = q.where(
            (TranslationSegment.source_text.ilike(like)) |
            (TranslationSegment.target_text.ilike(like))
        )

    q = q.order_by(TranslationSegment.created_at)
    segments = db.execute(q).scalars().all()
    variants = {}
    if language != project.target_language and segments:
        variants = {
            variant.segment_id: variant
            for variant in db.execute(
                select(TranslationVariant).where(
                    TranslationVariant.target_language == language,
                    TranslationVariant.segment_id.in_([s.id for s in segments]),
                )
            ).scalars().all()
        }
    results = (
        [_to_read(s) for s in segments]
        if language == project.target_language
        else [_to_read(s, variants.get(s.id), language) for s in segments]
    )
    if status:
        results = [s for s in results if s.translation_status == status]
    if search:
        query_text = search.casefold()
        results = [
            s for s in results
            if query_text in s.source_text.casefold()
            or query_text in (s.target_text or "").casefold()
        ]
    return results
