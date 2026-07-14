import os
from pathlib import Path


TEST_ROOT = Path(__file__).parent / ".runtime"
TEST_ROOT.mkdir(exist_ok=True)
os.environ["RUNTRACE_DATABASE_URL"] = f"sqlite:///{TEST_ROOT / 'test.db'}"
os.environ["RUNTRACE_ARTIFACT_PATH"] = str(TEST_ROOT / "artifacts")
os.environ["RUNTRACE_SEED_DEMO"] = "true"
os.environ["RUNTRACE_DEV"] = "true"


import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from runtrace_api.database import Base, engine  # noqa: E402
from runtrace_api.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_database():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with TestClient(app) as client:
        yield client
