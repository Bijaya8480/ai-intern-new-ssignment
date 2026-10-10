import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import publish as publish_api
from app.api import segments as segments_api
from app.database import Base, get_db
from app.main import app
from app.models import Page, Project, TranslationSegment


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(bind=engine)
    test_session = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)

    def override_get_db():
        db = test_session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield TestClient(app), test_session
    finally:
        app.dependency_overrides.pop(get_db, None)
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


def test_target_language_variants_review_and_publish_independently(client, monkeypatch):
    client, test_session = client
    project = Project(
        name="Multilingual test",
        source_url="https://example.test",
        target_language="es",
        target_language_name="Spanish",
        source_language="en",
    )
    page = Page(
        project=project,
        url="https://example.test/",
        normalized_url="https://example.test/",
        selected_for_translation=True,
        crawl_status="crawled",
    )
    segment = TranslationSegment(
        page=page,
        source_text="Hello",
        target_text="Hola",
        source_hash="test-hash",
        element_selector="p",
        translation_status="approved",
    )
    with test_session() as session:
        session.add(project)
        session.commit()
        project_id, segment_id = project.id, segment.id

    monkeypatch.setattr(
        segments_api.ts,
        "translate",
        lambda text, source, target, project_id, db, **kwargs: (
            f"{text} [{target}]",
            False,
            "test-provider",
        ),
    )
    monkeypatch.setattr(publish_api, "inject_into_sample_site", lambda *_: None)

    translated = client.post(
        f"/api/projects/{project_id}/translate?target_language=hi"
    )
    assert translated.status_code == 200, translated.text
    assert translated.json()[0]["target_text"] == "Hello [hi]"

    hindi_segments = client.get(
        f"/api/projects/{project_id}/segments?target_language=hi"
    )
    assert hindi_segments.status_code == 200
    assert hindi_segments.json()[0]["target_text"] == "Hello [hi]"

    saved = client.patch(
        f"/api/segments/{segment_id}/translations/hi",
        json={"target_text": "नमस्ते", "translation_status": "edited"},
    )
    assert saved.status_code == 200, saved.text
    approved = client.post(
        f"/api/segments/{segment_id}/approve?target_language=hi"
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["target_text"] == "नमस्ते"

    publication = client.post(
        f"/api/projects/{project_id}/publish?target_language=hi"
    )
    assert publication.status_code == 200, publication.text
    assert publication.json()["target_language"] == "hi"

    runtime = client.get(
        f"/api/runtime/{project_id}/translations?lang=hi&source=%2F"
    )
    assert runtime.status_code == 200, runtime.text
    assert runtime.json()["segments"][0]["target_text"] == "नमस्ते"

    default_publication = client.post(
        f"/api/projects/{project_id}/publish?target_language=es"
    )
    assert default_publication.status_code == 200, default_publication.text
    assert default_publication.json()["target_language"] == "es"
    default_runtime = client.get(
        f"/api/runtime/{project_id}/translations?lang=es&source=%2F"
    )
    assert default_runtime.status_code == 200, default_runtime.text
    assert default_runtime.json()["segments"][0]["target_text"] == "Hola"

    with test_session() as session:
        base_segment = session.get(TranslationSegment, segment_id)
        assert base_segment.target_text == "Hola"
        assert base_segment.translation_status == "approved"
