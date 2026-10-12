import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent

# Secrets that have ever shipped in this repo (code defaults, .env.example).
# Anyone who has read the repo knows them, so a token signed with one of
# these can be forged -- refuse to start rather than run "secured" by them.
KNOWN_WEAK_SECRETS = {
    "",
    "change-me-in-production",
    "change-me-to-a-random-secret",
    "secret",
    "changeme",
}
MIN_SECRET_LENGTH = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    # Anthropic
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-5-5"
    # Cheaper model for the per-message topic-mastery grading, which runs in
    # the background after every reply and doesn't need the chat model.
    mastery_model: str = "claude-haiku-5-5"
    # Reasoning effort for chat replies (low | medium | high | xhigh | max).
    chat_effort: str = "medium"
    chat_max_tokens: int = 16000
    # Rough budget for how much prior conversation is resent each turn
    # (characters, ~4 chars per token). Oldest turns are dropped past this.
    max_history_chars: int = 400_000

    # Auth
    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    # Database
    database_url: str = f"sqlite+aiosqlite:///{BASE_DIR / 'app.db'}"

    # Storage
    upload_dir: Path = BASE_DIR / "uploads"
    avatar_dir: Path = BASE_DIR / "uploads" / "avatars"
    chat_files_dir: Path = BASE_DIR / "uploads" / "chat_files"

    # Upload limits
    max_avatar_image_bytes: int = 5 * 1024 * 1024
    max_chat_file_bytes: int = 20 * 1024 * 1024
    max_chat_files_per_message: int = 5

    # CORS
    frontend_origin: str = "http://localhost:3000"

    # Optional HuggingFace mirror for downloading the embedding model, e.g.
    # https://hf-mirror.com when huggingface.co is unreachable.
    hf_endpoint: str = ""

    # Email (Resend) -- used for the "forgot password" flow. Empty by
    # default so the app still runs without it; forgot-password just returns
    # a clear error until a key is set in .env.
    resend_api_key: str = ""
    email_from: str = "AI Avatars <onboarding@resend.dev>"


settings = Settings()


def validate_settings(s: Settings) -> None:
    secret = s.jwt_secret_key.strip()
    if secret in KNOWN_WEAK_SECRETS or len(secret) < MIN_SECRET_LENGTH:
        raise RuntimeError(
            "JWT_SECRET_KEY in backend/.env is missing, too short, or a publicly known "
            "default. Generate one with:\n"
            '  python -c "import secrets; print(secrets.token_urlsafe(48))"\n'
            "and put it in backend/.env as JWT_SECRET_KEY=<value>."
        )


validate_settings(settings)

if settings.hf_endpoint:
    # Must be set before huggingface_hub is imported (lazily, by rag_service).
    os.environ.setdefault("HF_ENDPOINT", settings.hf_endpoint)

# Ensure storage directories exist
settings.avatar_dir.mkdir(parents=True, exist_ok=True)
settings.chat_files_dir.mkdir(parents=True, exist_ok=True)
