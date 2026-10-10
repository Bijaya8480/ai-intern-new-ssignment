"""Database setup using SQLAlchemy.

A `database_url` setting (default SQLite) configures the engine. To migrate to
PostgreSQL, set ``DATABASE_URL=postgresql+psycopg2://user:pass@host/db``.
The ORM/repository layer abstracts the engine so the rest of the code is
database-agnostic.
"""
from __future__ import annotations

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from .config import settings

if settings.database_url.startswith("sqlite"):
    engine: Engine = create_engine(
        settings.database_url,
        connect_args={"check_same_thread": False, "timeout": 30},
        future=True,
    )
else:
    engine = create_engine(settings.database_url, future=True)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, connection_record):
    try:
        dbapi_conn.execute("PRAGMA foreign_keys=ON")
        dbapi_conn.execute("PRAGMA journal_mode=WAL")
        dbapi_conn.execute("PRAGMA busy_timeout=30000")
    except Exception:
        pass


# Session factory for all database sessions
SessionFactory = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)

Base = declarative_base()


def get_db():
    """FastAPI dependency for request-scoped database sessions."""
    db = SessionFactory()
    try:
        yield db
    finally:
        db.close()


def get_db_session():
    """Create a new database session for background tasks."""
    return SessionFactory()


def init_db() -> None:
    # Import models lazily to avoid a circular import (models import Base from
    # this module); by the time init_db is called this module is fully loaded.
    import importlib

    importlib.import_module(".models", package=__package__)
    Base.metadata.create_all(bind=engine)

    if engine.dialect.name == "sqlite":
        with engine.begin() as conn:
            cols = conn.exec_driver_sql(
                "PRAGMA table_info(translation_memory)"
            ).fetchall()
            exists = any(row[1] == "model_version" for row in cols)
            if not exists:
                conn.exec_driver_sql(
                    "ALTER TABLE translation_memory ADD COLUMN model_version VARCHAR(64) NOT NULL DEFAULT 'default'"
                )
            publication_cols = conn.exec_driver_sql(
                "PRAGMA table_info(publications)"
            ).fetchall()
            if publication_cols and not any(row[1] == "target_language" for row in publication_cols):
                conn.exec_driver_sql(
                    "ALTER TABLE publications ADD COLUMN target_language VARCHAR(16)"
                )
