import pytest

from core.config import Settings, validate_settings
from tests.conftest import register_and_login


async def test_login_is_by_email_and_case_insensitive(client):
    await register_and_login(client, email="Alice@Example.com")
    r = await client.post("/api/auth/login", json={"email": "ALICE@example.COM", "password": "password123"})
    assert r.status_code == 200
    assert r.json()["user"]["username"] == "alice"
    assert r.json()["user"]["email"] == "alice@example.com"


async def test_login_rejects_wrong_password_and_username_payload(client):
    await register_and_login(client)
    r = await client.post("/api/auth/login", json={"email": "alice@example.com", "password": "nope-nope"})
    assert r.status_code == 401
    assert r.json()["detail"] == "Incorrect email or password"
    r = await client.post("/api/auth/login", json={"username": "alice", "password": "password123"})
    assert r.status_code == 422


async def test_register_reports_which_field_is_taken(client):
    await register_and_login(client)
    r = await client.post("/api/auth/register", json={"username": "bob", "email": "ALICE@example.com", "password": "password123"})
    assert r.status_code == 400 and "email" in r.json()["detail"]
    r = await client.post("/api/auth/register", json={"username": "alice", "email": "new@example.com", "password": "password123"})
    assert r.status_code == 400 and "username" in r.json()["detail"]


async def test_login_is_rate_limited(client):
    for _ in range(10):
        await client.post("/api/auth/login", json={"email": "x@example.com", "password": "whatever1"})
    r = await client.post("/api/auth/login", json={"email": "x@example.com", "password": "whatever1"})
    assert r.status_code == 429
    assert "Retry-After" in r.headers


@pytest.mark.parametrize("secret", ["", "change-me-in-production", "change-me-to-a-random-secret", "short"])
def test_weak_jwt_secrets_are_rejected(secret):
    with pytest.raises(RuntimeError):
        validate_settings(Settings(jwt_secret_key=secret))


def test_strong_jwt_secret_is_accepted():
    validate_settings(Settings(jwt_secret_key="k" * 48))
