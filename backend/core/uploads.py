"""Shared upload handling: size-limited reads, content validation and safe
storage names. Never trust the client's filename or Content-Type -- the
stored extension is derived from what the bytes actually are."""

import asyncio
import io
import re
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile
from PIL import Image

# Refuse absurd dimensions up front (decompression bombs).
Image.MAX_IMAGE_PIXELS = 40_000_000

READ_CHUNK = 1024 * 1024

IMAGE_FORMATS = {"PNG": ".png", "JPEG": ".jpg", "WEBP": ".webp", "GIF": ".gif"}
IMAGE_MEDIA_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
}

TEXT_EXTENSIONS = {
    ".py", ".js", ".ts", ".tsx", ".jsx", ".java", ".c", ".cpp", ".h", ".hpp",
    ".go", ".rs", ".rb", ".php", ".cs", ".swift", ".kt", ".sql", ".sh",
    ".json", ".yaml", ".yml", ".md", ".txt", ".html", ".css", ".xml", ".csv",
}
CHAT_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
CHAT_ALLOWED_EXTENSIONS = TEXT_EXTENSIONS | CHAT_IMAGE_EXTENSIONS | {".pdf"}

# Stored names are always <32 hex chars><known extension>; anything else
# (path separators, "..", odd extensions) is rejected before touching disk.
_STORED_NAME_RE = re.compile(r"^[0-9a-f]{32}\.[A-Za-z0-9]{1,5}$")


def is_safe_stored_name(name: str) -> bool:
    return bool(_STORED_NAME_RE.fullmatch(name))


def resolve_stored_file(directory: Path, name: str) -> Path | None:
    """Return the path of a stored upload, or None if the name is not one we
    could have generated or it resolves outside `directory`."""
    if not is_safe_stored_name(name):
        return None
    base = directory.resolve()
    path = (base / name).resolve()
    if path.parent != base:
        return None
    return path


def new_stored_name(ext: str) -> str:
    return f"{uuid.uuid4().hex}{ext}"


async def read_limited(file: UploadFile, max_bytes: int) -> bytes:
    """Read an upload, failing with 413 as soon as it exceeds max_bytes
    rather than buffering an arbitrarily large body."""
    buf = bytearray()
    while True:
        chunk = await file.read(READ_CHUNK)
        if not chunk:
            break
        buf.extend(chunk)
        if len(buf) > max_bytes:
            limit_mb = max_bytes // (1024 * 1024)
            raise HTTPException(
                status_code=413,
                detail=f"“{file.filename}” is too large (max {limit_mb} MB).",
            )
    return bytes(buf)


def detect_image_ext(data: bytes) -> str | None:
    """Return the canonical extension if `data` is a real PNG/JPEG/WEBP/GIF."""
    try:
        with Image.open(io.BytesIO(data)) as img:
            fmt = img.format
            img.verify()
    except Exception:  # noqa: BLE001 - any decode failure means "not an image"
        return None
    return IMAGE_FORMATS.get(fmt or "")


async def write_file(path: Path, data: bytes) -> None:
    await asyncio.to_thread(path.write_bytes, data)


def delete_quietly(path: Path | None) -> None:
    if path is None:
        return
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass
