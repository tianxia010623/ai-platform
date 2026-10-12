import json

import anthropic
import httpx
from sqlalchemy import select

from core.config import settings
from core.database import AsyncSessionLocal
from models.message import Message
from services.chat_service import build_api_messages, friendly_error
from tests.conftest import png_bytes, register_and_login
from tests.test_avatars import create_avatar


def events(body: str) -> list[dict]:
    return [json.loads(line[len("data: "):]) for line in body.split("\n\n") if line.startswith("data: ")]


async def setup_session(client):
    headers = await register_and_login(client)
    avatar = (await create_avatar(client, headers)).json()
    session = (await client.post("/api/chat/sessions", json={"avatar_id": avatar["id"]}, headers=headers)).json()
    return headers, avatar, session


async def all_messages():
    async with AsyncSessionLocal() as db:
        return list((await db.execute(select(Message).order_by(Message.id))).scalars().all())


async def test_stream_saves_both_messages_and_titles_session(client, fake_claude):
    headers, _, session = await setup_session(client)
    r = await client.post("/api/chat/stream", data={"session_id": session["id"], "message": "What is a matrix?"}, headers=headers)
    evs = events(r.text)
    types = [e["type"] for e in evs]
    assert types[0] == "user_saved"
    assert "".join(e["content"] for e in evs if e["type"] == "delta") == "Hello there"
    done = next(e for e in evs if e["type"] == "message_done")
    assert done["session_title"] == "What is a matrix?"
    assert types[-1] == "done"
    msgs = await all_messages()
    assert [(m.role, m.content) for m in msgs] == [("user", "What is a matrix?"), ("assistant", "Hello there")]


async def test_request_uses_caching_and_effort(client, fake_claude):
    headers, _, session = await setup_session(client)
    await client.post("/api/chat/stream", data={"session_id": session["id"], "message": "one"}, headers=headers)
    await client.post("/api/chat/stream", data={"session_id": session["id"], "message": "two"}, headers=headers)
    call = fake_claude.calls[-1]
    assert call["model"] == settings.anthropic_model
    assert call["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert call["messages"][-2]["content"][-1]["cache_control"] == {"type": "ephemeral"}
    assert call["extra_body"]["output_config"]["effort"] == settings.chat_effort


async def test_attachment_text_is_kept_for_later_turns(client, fake_claude):
    headers, _, session = await setup_session(client)
    await client.post(
        "/api/chat/stream",
        data={"session_id": session["id"], "message": "summarize"},
        files={"files": ("notes.md", b"# Mitochondria are the powerhouse", "text/markdown")},
        headers=headers,
    )
    await client.post("/api/chat/stream", data={"session_id": session["id"], "message": "and again?"}, headers=headers)
    first_turn = fake_claude.calls[-1]["messages"][0]
    assert any("Mitochondria" in b.get("text", "") for b in first_turn["content"])


async def test_regenerate_replaces_last_reply(client, fake_claude):
    headers, _, session = await setup_session(client)
    await client.post("/api/chat/stream", data={"session_id": session["id"], "message": "hi"}, headers=headers)
    fake_claude.chunks = ["Second", " try"]
    r = await client.post("/api/chat/stream", data={"session_id": session["id"], "regenerate": "true"}, headers=headers)
    assert r.status_code == 200
    msgs = await all_messages()
    assert [(m.role, m.content) for m in msgs] == [("user", "hi"), ("assistant", "Second try")]


async def test_api_errors_become_friendly_messages(client, fake_claude):
    headers, _, session = await setup_session(client)
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    fake_claude.error = anthropic.AuthenticationError(
        "invalid x-api-key", response=httpx.Response(401, request=request), body=None
    )
    r = await client.post("/api/chat/stream", data={"session_id": session["id"], "message": "hi"}, headers=headers)
    err = next(e for e in events(r.text) if e["type"] == "error")
    assert "API key" in err["message"]
    assert "x-api-key" not in err["message"]


def test_friendly_error_for_billing():
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    exc = anthropic.BadRequestError(
        "Your credit balance is too low", response=httpx.Response(400, request=request), body=None
    )
    assert "out of credits" in friendly_error(exc)


async def test_upload_validation(client, fake_claude):
    headers, _, session = await setup_session(client)
    sid = session["id"]
    r = await client.post("/api/chat/stream", data={"session_id": sid, "message": "x"}, files={"files": ("run.exe", b"MZ", "application/octet-stream")}, headers=headers)
    assert r.status_code == 400
    r = await client.post("/api/chat/stream", data={"session_id": sid, "message": "x"}, files={"files": ("fake.png", b"not an image", "image/png")}, headers=headers)
    assert r.status_code == 400
    r = await client.post("/api/chat/stream", data={"session_id": sid, "message": "x"}, files={"files": ("doc.pdf", b"hello", "application/pdf")}, headers=headers)
    assert r.status_code == 400
    r = await client.post("/api/chat/stream", data={"session_id": sid, "message": "   "}, headers=headers)
    assert r.status_code == 400
    assert not any(settings.chat_files_dir.iterdir())


async def test_image_attachment_is_sent_as_image(client, fake_claude):
    headers, _, session = await setup_session(client)
    await client.post(
        "/api/chat/stream",
        data={"session_id": session["id"], "message": "what is this"},
        files={"files": ("pic.png", png_bytes((2000, 1000)), "image/png")},
        headers=headers,
    )
    blocks = fake_claude.calls[-1]["messages"][-1]["content"]
    assert blocks[0]["type"] == "image"


async def test_delete_session(client, fake_claude):
    headers, _, session = await setup_session(client)
    await client.post("/api/chat/stream", data={"session_id": session["id"], "message": "hi"}, headers=headers)
    r = await client.delete(f"/api/chat/sessions/{session['id']}", headers=headers)
    assert r.status_code == 200
    assert await all_messages() == []
    r = await client.get("/api/chat/sessions", headers=headers)
    assert r.json() == []


async def test_feedback_only_on_own_messages(client, fake_claude):
    headers, _, session = await setup_session(client)
    await client.post("/api/chat/stream", data={"session_id": session["id"], "message": "hi"}, headers=headers)
    user_msg, reply = await all_messages()
    bob = await register_and_login(client, username="bob", email="bob@example.com")
    assert (await client.post(f"/api/feedback/{reply.id}", json={"rating": 1}, headers=bob)).status_code == 404
    assert (await client.post(f"/api/feedback/{user_msg.id}", json={"rating": 1}, headers=headers)).status_code == 404
    assert (await client.post(f"/api/feedback/{reply.id}", json={"rating": 1}, headers=headers)).status_code == 200


def _msg(i, role, content, files=None, ctx=None):
    return Message(id=i, session_id=1, role=role, content=content, attached_files=files or [], attachment_context=ctx)


def test_history_truncation_drops_oldest_and_starts_with_user():
    history = [
        _msg(1, "user", "a" * 100),
        _msg(2, "assistant", "b" * 100),
        _msg(3, "user", "c" * 100),
        _msg(4, "assistant", "d" * 100),
        _msg(5, "user", "latest"),
    ]
    out = build_api_messages(history, max_chars=250)
    assert out[0]["role"] == "user"
    assert out[-1]["content"][-1]["text"] == "latest"
    assert all("a" * 100 != b.get("text") for m in out for b in m["content"])


async def test_rag_dedupes_and_retrieves():
    from services import rag_service

    async with AsyncSessionLocal() as db:
        n1 = await rag_service.index_file_for_avatar(db, 1, "a.txt", "same text " * 50)
        n2 = await rag_service.index_file_for_avatar(db, 1, "a-copy.txt", "same text " * 50)
        assert n1 > 0 and n2 == 0
        chunks = await rag_service.retrieve_relevant_chunks(db, 1, ("same text " * 50).strip(), top_k=1)
        assert chunks and chunks[0].source_filename == "a.txt"
