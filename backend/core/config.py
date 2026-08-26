from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Anthropic
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"

    # Auth
    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    # Database
    database_url: str = f"sqlite+aiosqlite:///{BASE_DIR / 'app.db'}"

    # Storage
    upload_dir: Path = BASE_DIR / "uploads"
    avatar_dir: Path = BASE_DIR / "uploads" / "avatars"
    chat_files_dir: Path = BASE_DIR / "uploads" / "chat_files"

    # ChromaDB
    chroma_dir: Path = BASE_DIR / "chroma_data"

    # CORS
    frontend_origin: str = "http://localhost:3000"

    # Email (Resend) -- used for the "forgot password" flow. Empty by
    # default so the app still runs without it; forgot-password just returns
    # a clear error until a key is set in .env.
    resend_api_key: str = ""
    email_from: str = "AI Avatars <onboarding@resend.dev>"


settings = Settings()

# Ensure storage directories exist
settings.avatar_dir.mkdir(parents=True, exist_ok=True)
settings.chat_files_dir.mkdir(parents=True, exist_ok=True)
settings.chroma_dir.mkdir(parents=True, exist_ok=True)
