"""Pydantic schemas (request/response models)."""
from __future__ import annotations

from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, Field, ConfigDict


class ProjectBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    source_url: str = Field(..., min_length=3, max_length=2048)
    target_language: str = Field(..., min_length=2, max_length=16)
    target_language_name: Optional[str] = None
    source_language: Optional[str] = None
    source_language_name: Optional[str] = None


class ProjectCreate(ProjectBase):
    pass


class ProjectRead(ProjectBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    status: str = "active"
    published_publication_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class PageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    project_id: str
    url: str
    normalized_url: str
    title: Optional[str] = None
    http_status: Optional[int] = None
    word_count: int = 0
    detected_language: Optional[str] = None
    content_type: str = "Other"
    crawl_status: str = "pending"
    crawl_error: Optional[str] = None
    last_crawled_at: Optional[datetime] = None
    translation_status: str = "not_selected"
    selected_for_translation: bool = False


class PageUpdate(BaseModel):
    selected_for_translation: Optional[bool] = None
    translation_status: Optional[str] = None


class SegmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    page_id: str
    source_text: str
    target_text: Optional[str] = None
    source_hash: str
    element_type: Optional[str] = None
    element_selector: Optional[str] = None
    translation_status: str = "pending"
    target_language: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class SegmentUpdate(BaseModel):
    target_text: Optional[str] = None
    translation_status: Optional[str] = None


class SegmentTranslateResponse(BaseModel):
    segment_id: str
    target_text: str
    translation_status: str = "machine_translated"
    used_memory: bool = False
    source: str = "ai"  # google-cloud | google | mymemory | ai | memory | error


class TranslationMemoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    source_hash: str
    source_text: str
    target_text: str
    source_language: str
    target_language: str
    used_count: int = 0
    created_at: Optional[datetime] = None


class PublicationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    project_id: str
    version: int
    target_language: Optional[str] = None
    status: str = "published"
    published_at: Optional[datetime] = None
    stats: Optional[str] = None


class CrawlJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    project_id: str
    status: str = "pending"
    total_pages: int = 0
    pages_discovered: int = 0
    pages_crawled: int = 0
    pages_failed: int = 0
    current_url: Optional[str] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    error: Optional[str] = None


class CrawlProgress(BaseModel):
    job_id: str
    project_id: str
    status: str
    total_pages: int
    pages_discovered: int
    pages_crawled: int
    pages_failed: int
    current_url: Optional[str] = None
    error: Optional[str] = None


class ProjectStats(BaseModel):
    total_pages: int = 0
    total_words: int = 0
    selected_pages: int = 0
    translated_pages: int = 0
    approved_pages: int = 0
    published_pages: int = 0
    estimated_effort: str = ""


class TranslationRecord(BaseModel):
    """One record embedded in the runtime translation payload."""
    url: str
    selector: str
    source_hash: str
    source_text: str
    target_text: str
    element_type: Optional[str] = None


class RuntimeResponse(BaseModel):
    project_id: str
    publication_id: str
    version: int
    target_language: str
    target_language_name: str
    source_language: Optional[str] = None
    segments: List[TranslationRecord]
