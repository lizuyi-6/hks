from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from apps.api.app.core.database import Base, engine
from apps.api.app.server import app


@pytest.fixture(autouse=True)
def reset_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    generated_dir = Path(__file__).resolve().parents[1] / ".generated"
    generated_dir.mkdir(parents=True, exist_ok=True)
    # Wipe both files and subdirectories (compliance-reports/ etc.) so each
    # test starts with a clean staging area.
    import shutil
    for item in generated_dir.glob("*"):
        if item.is_dir():
            shutil.rmtree(item, ignore_errors=True)
        else:
            try:
                item.unlink()
            except OSError:
                pass
    yield


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def auth_headers(client: TestClient):
    response = client.post(
        "/auth/register",
        json={
            "email": "tester@example.com",
            "full_name": "Tester",
            "password": "password123",
        },
    )
    token = response.json()["accessToken"]
    return {"Authorization": f"Bearer {token}"}
