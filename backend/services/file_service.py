import base64
import io
import re
from pathlib import Path

import fitz  # PyMuPDF
from PIL import Image

from core.uploads import CHAT_IMAGE_EXTENSIONS, IMAGE_MEDIA_TYPES

PDF_EXTENSIONS = {".pdf"}

MAX_PDF_CHARS = 3000
MAX_CODE_CHARS = 8000
# Higher cap used only when indexing a file into the RAG knowledge base
# (backend/services/rag_service.py) -- unlike the single-turn "paste the
# whole file into this message" caps above, an indexed file gets chunked and
# only the most relevant pieces are retrieved later, so it can afford to
# keep a lot more of the document without bloating every future prompt.
MAX_INDEX_CHARS = 20000

# The API rejects images over 5 MB (base64 grows data by 4/3) and downsizes
# anything past ~1568px on the long edge anyway, so shrink before sending.
MAX_IMAGE_EDGE = 1568
MAX_IMAGE_BYTES = 3_700_000


def classify_file(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext in PDF_EXTENSIONS:
        return "pdf"
    if ext in CHAT_IMAGE_EXTENSIONS:
        return "image"
    return "text"


def _fix_glued_words(text: str) -> str:
    """Belt-and-suspenders cleanup on top of PyMuPDF's extraction (which is
    already layout-aware and usually gets word spacing right, unlike the
    PyPDF2 extractor this used to use). Inserts a space wherever a
    lowercase letter or digit is immediately followed by an uppercase
    letter, and wherever sentence-ending punctuation is immediately
    followed by a letter with no space -- catches the occasional residual
    glued word without needing a dictionary."""
    text = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", text)
    text = re.sub(r"(?<=[.,;:])(?=[A-Za-z])", " ", text)
    return text


def _extract_pdf_raw(file_path: Path, max_chars: int) -> str:
    """Extracts text page by page via PyMuPDF, which -- unlike the PyPDF2
    extractor this used to use -- reliably preserves word-boundary spaces
    on multi-column academic-paper layouts."""
    doc = fitz.open(str(file_path))
    try:
        parts = []
        total = 0
        for page in doc:
            text = page.get_text() or ""
            parts.append(text)
            total += len(text)
            if total >= max_chars:
                break
        return _fix_glued_words("\n".join(parts))[:max_chars]
    finally:
        doc.close()


def extract_pdf_text(file_path: Path) -> str:
    try:
        return _extract_pdf_raw(file_path, MAX_PDF_CHARS)
    except Exception:  # noqa: BLE001
        return "[The PDF's text could not be extracted -- it may be scanned or encrypted.]"


def read_text_file(file_path: Path) -> str:
    try:
        return file_path.read_text(encoding="utf-8", errors="replace")[:MAX_CODE_CHARS]
    except OSError:
        return "[The file could not be read.]"


def attachment_text(file_path: Path, original_filename: str) -> str | None:
    """Text form of a non-image attachment as it is shown to the model, or
    None for images. Stored on the message so later turns keep it."""
    kind = classify_file(original_filename)
    if kind == "image":
        return None
    if kind == "pdf":
        return f"[Attached PDF: {original_filename}]\n{extract_pdf_text(file_path)}"
    return f"[Attached file: {original_filename}]\n```\n{read_text_file(file_path)}\n```"


def _prepare_image(file_path: Path) -> tuple[bytes, str]:
    data = file_path.read_bytes()
    media_type = IMAGE_MEDIA_TYPES.get(file_path.suffix.lower(), "image/png")
    with Image.open(io.BytesIO(data)) as img:
        too_big = max(img.size) > MAX_IMAGE_EDGE or len(data) > MAX_IMAGE_BYTES
        if not too_big:
            return data, media_type
        img.thumbnail((MAX_IMAGE_EDGE, MAX_IMAGE_EDGE))
        out = io.BytesIO()
        if img.mode in ("RGBA", "LA", "P"):
            img.save(out, format="PNG", optimize=True)
            media_type = "image/png"
        else:
            img.convert("RGB").save(out, format="JPEG", quality=85)
            media_type = "image/jpeg"
        result = out.getvalue()
        if len(result) > MAX_IMAGE_BYTES:
            out = io.BytesIO()
            img.convert("RGB").save(out, format="JPEG", quality=70)
            result, media_type = out.getvalue(), "image/jpeg"
        return result, media_type


def image_block(file_path: Path) -> dict | None:
    try:
        data, media_type = _prepare_image(file_path)
    except (OSError, ValueError):
        return None
    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": media_type,
            "data": base64.standard_b64encode(data).decode("utf-8"),
        },
    }


def extract_full_text(file_path: Path, original_filename: str) -> str | None:
    """Extracts as much text as reasonable from a PDF or text file for RAG
    indexing (see rag_service.index_file_for_avatar). Returns None for file
    types with no meaningful text to index (images)."""
    kind = classify_file(original_filename)
    if kind == "image":
        return None
    if kind == "pdf":
        try:
            return _extract_pdf_raw(file_path, MAX_INDEX_CHARS)
        except Exception:  # noqa: BLE001
            return None
    try:
        return file_path.read_text(encoding="utf-8", errors="replace")[:MAX_INDEX_CHARS]
    except OSError:
        return None
