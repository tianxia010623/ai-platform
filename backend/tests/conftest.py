"""Test setup: every test gets a fresh SQLite database and upload folders in a
temp directory, a stubbed embedding model, and a fake Anthropic client --
nothing here touches backend/app.db, backend/uploads or the real API."""

import io
import os
import sys
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="ai-avatar-tests-"))
os.environ.update(
    {
        "JWT_SECRET_KEY": "test-secret-" + "x" * 40,
        "ANTHROPIC_API_KEY": "test-key",
        "DATABASE_URL": f"sqlite+aiosqlite:///{(_TMP / 'test.db').as_posix()}",
        "AVATAR_DIR": str(_TMP / "avatars"),
        "CHAT_FILES_DIR": str(_TMP / "chat_files"),
    }
)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np  # noqa: E402
import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from PIL import Image  # noqa: E402

from core import ratelimit  # noqa: E402
from core.config import settings  # noqa: E402
from core.database import Base, engine, run_migrations  # noqa: E402
from main import app  # noqa: E402
from services import rag_service  # noqa: E402


@pytest.fixture(autouse=True)
async def fresh_state(monkeypatch):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.exec_driver_sql("DROP TABLE IF EXISTS alembic_version")
    run_migrations()
    ratelimit.reset()
    rag_service._cache.clear()
    for d in (settings.avatar_dir, settings.chat_files_dir):
        d.mkdir(parents=True, exist_ok=True)
        for f in d.iterdir():
            f.unlink()

    async def fake_embed_many(texts):
        # Deterministic unit vectors: identical text -> identical vector.
        out = []
        for t in texts:
            rng = np.random.default_rng(abs(hash(t)) % (2**32))
            v = rng.normal(size=8).astype(np.float32)
            out.append(v / np.linalg.norm(v))
        return np.stack(out)

    monkeypatch.setattr(rag_service, "embed_many", fake_embed_many)
    yield


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def register_and_login(client, username="alice", email="alice@example.com", password="password123"):
    r = await client.post("/api/auth/register", json={"username": username, "email": email, "password": password})
    assert r.status_code == 200, r.text
    r = await client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def png_bytes(size=(4, 4)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, (200, 30, 30)).save(buf, format="PNG")
    return buf.getvalue()


class FakeStream:
    def __init__(self, chunks, stop_reason="end_turn", error=None):
        self.chunks, self.stop_reason, self.error = chunks, stop_reason, error

    async def __aenter__(self):
        if self.error:
            raise self.error
        return self

    async def __aexit__(self, *exc):
        return False

    @property
    async def text_stream(self):
        for c in self.chunks:
            yield c

    async def get_final_message(self):
        return type("Final", (), {"stop_reason": self.stop_reason})()


class FakeMessages:
    def __init__(self, owner):
        self.owner = owner

    def stream(self, **kwargs):
        self.owner.calls.append(kwargs)
        return FakeStream(self.owner.chunks, self.owner.stop_reason, self.owner.error)

    async def create(self, **kwargs):
        return type("Resp", (), {"content": []})()


class FakeClient:
    def __init__(self, chunks=("Hello", " there"), stop_reason="end_turn", error=None):
        self.chunks, self.stop_reason, self.error = list(chunks), stop_reason, error
        self.calls: list[dict] = []
        self.messages = FakeMessages(self)
        self.beta = type("Beta", (), {"messages": FakeMessages(self)})()


@pytest.fixture
def fake_claude(monkeypatch):
    fake = FakeClient()
    import api.routes.chat as chat_routes

    monkeypatch.setattr(chat_routes, "anthropic_client", fake)
    return fake
