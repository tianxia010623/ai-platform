import json

from sqlalchemy import func, select

from core.config import settings
from core.database import AsyncSessionLocal
from models.chat_session import ChatSession
from models.document_chunk import DocumentChunk
from models.message import Message
from models.message_feedback import MessageFeedback
from tests.conftest import png_bytes, register_and_login


async def create_avatar(client, headers, name="Ada", image: bytes | None = None, tags=("algebra",)):
    files = {"image": ("face.png", image, "image/png")} if image else None
    r = await client.post(
        "/api/avatars",
        data={"name": name, "topic_tags": json.dumps(list(tags))},
        files=files,
        headers=headers,
    )
    return r


async def test_image_endpoint_blocks_path_traversal(client):
    (settings.avatar_dir.parent / "secret.txt").write_text("TOP SECRET")
    for name in ["..%5Csecret.txt", "..%2Fsecret.txt", "..%5C..%5C.env", "secret.txt"]:
        r = await client.get(f"/api/avatars/image/{name}")
        assert r.status_code == 404, name
        assert "TOP SECRET" not in r.text


async def test_avatar_image_is_validated_and_served(client):
    headers = await register_and_login(client)
    r = await create_avatar(client, headers, image=b"<html><script>alert(1)</script></html>")
    assert r.status_code == 400

    r = await create_avatar(client, headers, image=png_bytes())
    assert r.status_code == 200, r.text
    image_path = r.json()["image_path"]
    assert image_path.endswith(".png")
    served = await client.get(image_path)
    assert served.status_code == 200
    assert served.headers["content-type"] == "image/png"
    assert served.headers["x-content-type-options"] == "nosniff"


async def test_avatar_image_size_limit(client, monkeypatch):
    headers = await register_and_login(client)
    monkeypatch.setattr(settings, "max_avatar_image_bytes", 100)
    r = await create_avatar(client, headers, image=png_bytes((64, 64)) + b"\0" * 200)
    assert r.status_code == 413


async def test_replacing_image_deletes_old_file(client):
    headers = await register_and_login(client)
    avatar = (await create_avatar(client, headers, image=png_bytes())).json()
    old_file = settings.avatar_dir / avatar["image_path"].rsplit("/", 1)[-1]
    assert old_file.exists()
    r = await client.put(
        f"/api/avatars/{avatar['id']}/image", files={"image": ("n.png", png_bytes((8, 8)), "image/png")}, headers=headers
    )
    assert r.status_code == 200
    assert not old_file.exists()


async def test_update_avatar_regenerates_prompt(client):
    headers = await register_and_login(client)
    avatar = (await create_avatar(client, headers)).json()
    r = await client.patch(f"/api/avatars/{avatar['id']}", json={"name": "Grace", "expertise": "compilers"}, headers=headers)
    assert r.status_code == 200
    assert "You are Grace" in r.json()["system_prompt"]
    assert "compilers" in r.json()["system_prompt"]


async def test_delete_avatar_removes_everything(client, fake_claude):
    headers = await register_and_login(client)
    avatar = (await create_avatar(client, headers, image=png_bytes())).json()
    image_file = settings.avatar_dir / avatar["image_path"].rsplit("/", 1)[-1]
    session = (await client.post("/api/chat/sessions", json={"avatar_id": avatar["id"]}, headers=headers)).json()
    r = await client.post(
        "/api/chat/stream",
        data={"session_id": session["id"], "message": "read this"},
        files={"files": ("notes.txt", b"photosynthesis converts light to energy " * 20, "text/plain")},
        headers=headers,
    )
    assert r.status_code == 200
    async with AsyncSessionLocal() as db:
        reply = (await db.execute(select(Message).where(Message.role == "assistant"))).scalar_one()
    await client.post(f"/api/feedback/{reply.id}", json={"rating": 1}, headers=headers)
    assert any(settings.chat_files_dir.iterdir())

    r = await client.delete(f"/api/avatars/{avatar['id']}", headers=headers)
    assert r.status_code == 200

    async with AsyncSessionLocal() as db:
        for model in (ChatSession, Message, MessageFeedback, DocumentChunk):
            count = (await db.execute(select(func.count()).select_from(model))).scalar()
            assert count == 0, model.__name__
    assert not image_file.exists()
    assert not any(settings.chat_files_dir.iterdir())


async def test_users_cannot_touch_each_others_avatars(client):
    alice = await register_and_login(client)
    avatar = (await create_avatar(client, alice)).json()
    bob = await register_and_login(client, username="bob", email="bob@example.com")
    assert (await client.get(f"/api/avatars/{avatar['id']}", headers=bob)).status_code == 404
    assert (await client.delete(f"/api/avatars/{avatar['id']}", headers=bob)).status_code == 404
