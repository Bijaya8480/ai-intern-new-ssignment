"""ORM models.

Entities: Project, Page, TranslationSegment, TranslationMemory, Publication,
CrawlJob. A short base-62 id generator keeps project/page ids URL-friendly.
"""
from __future__ import annotations

import secrets
import string

from sqlalchemy import (
    Column, String, Integer, Text, DateTime, Boolean, ForeignKey, UniqueConstraint, Index,
)
from sqlalchemy.sql import func

from ..database import Base

B62 = string.digits + string.ascii_letters


def gen_id(n: int = 12) -> str:
    return "".join(secrets.choice(B62) for _ in range(n))


class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String(255), nullable=False)
    source_url = Column(String(2048), nullable=False)
    target_language = Column(String(16), nullable=False)
    target_language_name = Column(String(64), nullable=False, default="")
    source_language = Column(String(16), nullable=True)
    source_language_name = Column(String(64), nullable=True)
    status = Column(String(32), default="active")  # active, archived
    published_publication_id = Column(String, nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    pages = None  # set by relationship after class def


class Page(Base):
    __tablename__ = "pages"
    __table_args__ = (
        UniqueConstraint("project_id", "normalized_url", name="uq_page_project_url"),
        Index("ix_page_project", "project_id"),
        Index("ix_page_translation_status", "project_id", "translation_status"),
    )

    id = Column(String, primary_key=True, default=gen_id)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    url = Column(String(2048), nullable=False)
    normalized_url = Column(String(2048), nullable=False)
    title = Column(String(512), nullable=True)
    http_status = Column(Integer, nullable=True)
    word_count = Column(Integer, default=0, nullable=False)
    detected_language = Column(String(16), nullable=True)
    content_type = Column(String(64), default="Other", nullable=False)
    crawl_status = Column(String(32), default="pending", nullable=False)  # pending, crawled, failed
    crawl_error = Column(Text, nullable=True)
    last_crawled_at = Column(DateTime, nullable=True)
    translation_status = Column(
        String(32), default="not_selected", nullable=False
    )  # not_selected, selected, drafted, partial, complete, approved
    selected_for_translation = Column(Boolean, default=False, nullable=False)
    page_order = Column(Integer, default=0, nullable=False)
    # Parsed HTML snapshot, used to (re)extract translation segments.
    raw_html = Column(Text, nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class TranslationSegment(Base):
    __tablename__ = "translation_segments"
    __table_args__ = (
        Index("ix_segment_page", "page_id"),
        Index("ix_segment_source_hash", "source_hash"),
        Index("ix_segment_translation_status", "page_id", "translation_status"),
    )

    id = Column(String, primary_key=True, default=gen_id)
    page_id = Column(String, ForeignKey("pages.id", ondelete="CASCADE"), nullable=False)
    source_text = Column(Text, nullable=False)
    target_text = Column(Text, nullable=True)
    source_hash = Column(String(64), nullable=False, index=True)
    element_type = Column(String(32), nullable=True)  # h1, h2, p, button, title, meta
    element_selector = Column(String(255), nullable=True)
    translation_status = Column(
        String(32), default="pending", nullable=False
    )  # pending, machine_translated, edited, approved

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class TranslationVariant(Base):
    __tablename__ = "translation_variants"
    __table_args__ = (
        UniqueConstraint("segment_id", "target_language", name="uq_variant_segment_language"),
        Index("ix_variant_language_status", "target_language", "translation_status"),
    )

    id = Column(String, primary_key=True, default=gen_id)
    segment_id = Column(
        String, ForeignKey("translation_segments.id", ondelete="CASCADE"), nullable=False
    )
    target_language = Column(String(16), nullable=False)
    target_text = Column(Text, nullable=True)
    translation_status = Column(String(32), default="pending", nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class TranslationMemory(Base):
    __tablename__ = "translation_memory"
    __table_args__ = (
        UniqueConstraint("project_id", "source_hash", "target_language", "model_version",
                         name="uq_tm_project_hash_target_model"),
        Index("ix_tm_source_hash", "source_hash"),
    )

    id = Column(String, primary_key=True, default=gen_id)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    source_hash = Column(String(64), nullable=False)
    source_text = Column(Text, nullable=False)
    target_text = Column(Text, nullable=False)
    source_language = Column(String(16), nullable=False)
    target_language = Column(String(16), nullable=False)
    model_version = Column(String(64), default="default", nullable=False)
    used_count = Column(Integer, default=0, nullable=False)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class Publication(Base):
    __tablename__ = "publications"
    __table_args__ = (
        Index("ix_pub_project", "project_id"),
        UniqueConstraint("project_id", "version", name="uq_pub_project_version"),
    )

    id = Column(String, primary_key=True, default=gen_id)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    version = Column(Integer, nullable=False)
    target_language = Column(String(16), nullable=True)
    status = Column(String(32), default="published", nullable=False)
    published_at = Column(DateTime, server_default=func.now(), nullable=False)
    stats = Column(Text, nullable=True)  # JSON: total, approved, translated, words
    # Stored snapshot of the published translation set (url -> list of segment dicts)
    translations_json = Column(Text, nullable=False)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)


class CrawlJob(Base):
    __tablename__ = "crawl_jobs"
    __table_args__ = (Index("ix_crawl_project", "project_id"),)

    id = Column(String, primary_key=True, default=gen_id)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    status = Column(
        String(32), default="pending", nullable=False
    )  # pending, running, completed, failed
    total_pages = Column(Integer, default=0, nullable=False)
    pages_discovered = Column(Integer, default=0, nullable=False)
    pages_crawled = Column(Integer, default=0, nullable=False)
    pages_failed = Column(Integer, default=0, nullable=False)
    current_url = Column(String(2048), nullable=True)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    error = Column(Text, nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)


# Relationships (defined after all classes to avoid ordering issues)
from sqlalchemy.orm import relationship  # noqa: E402

Project.pages = relationship(
    "Page", backref="project", cascade="all, delete-orphan", lazy="selectin"
)
Page.segments = relationship(
    "TranslationSegment", backref="page", cascade="all, delete-orphan", lazy="selectin"
)
Project.crawl_jobs = relationship(
    "CrawlJob", backref="project", cascade="all, delete-orphan", lazy="selectin"
)
Project.publications = relationship(
    "Publication", backref="project", cascade="all, delete-orphan", lazy="selectin"
)
Project.translation_memory = relationship(
    "TranslationMemory", backref="project", cascade="all, delete-orphan", lazy="selectin"
)
