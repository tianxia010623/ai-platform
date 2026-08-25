import base64
import mimetypes
import re
from pathlib import Path

import fitz  # PyMuPDF

CODE_EXTENSIONS = {
    ".py", ".js", ".ts", ".tsx", ".jsx", ".java", ".c", ".cpp", ".h", ".hpp",
    ".go", ".rs", ".rb", ".php", ".cs", ".swift", ".kt", ".sql", ".sh",
    ".json", ".yaml", ".yml", ".md", ".txt", ".html", ".css", ".xml",
}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
PDF_EXTENSIONS = {".pdf"}

MAX_PDF_CHARS = 3000
MAX_CODE_CHARS = 8000
# Higher cap used only when indexing a file into the RAG knowledge base
# (backend/services/rag_service.py) -- unlike the single-turn "paste the
# whole file into this message" caps above, an indexed file gets chunked and
# only the most relevant pieces are retrieved later, so it can afford to
# keep a lot more of the document without bloating every future prompt.
MAX_INDEX_CHARS = 20000


def classify_file(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext in PDF_EXTENSIONS:
        return "pdf"
    if ext in IMAGE_EXTENSIONS:
        return "image"
    return "code"


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
    on multi-column academic-paper layouts. (PyPDF2 would turn "A two-stage
    approach" into "Atwo-stage approach"; that glued text made for garbled,
    low-similarity RAG embeddings -- see rag_service.py.)"""
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
    except Exception as exc:  # noqa: BLE001
        return f"[Could not extract PDF text: {exc}]"


def read_code_file(file_path: Path) -> str:
    try:
        text = file_path.read_text(encoding="utf-8", errors="replace")
        return text[:MAX_CODE_CHARS]
    except Exception as exc:  # noqa: BLE001
        return f"[Could not read file: {exc}]"


def image_to_base64_block(file_path: Path) -> dict:
    media_type = mimetypes.guess_type(str(file_path))[0] or "image/png"
    data = base64.standard_b64encode(file_path.read_bytes()).decode("utf-8")
    return {
        "type": "image",
        "source": {"type": "base64", "media_type": media_type, "data": data},
    }


def build_content_blocks_for_file(file_path: Path, original_filename: str) -> list[dict]:
    """Convert a stored file into Anthropic Messages API content blocks."""
    kind = classify_file(original_filename)

    if kind == "image":
        return [image_to_base64_block(file_path)]

    if kind == "pdf":
        text = extract_pdf_text(file_path)
        return [{"type": "text", "text": f"[Attached PDF: {original_filename}]\n{text}"}]

    # code / plain text
    text = read_code_file(file_path)
    return [{"type": "text", "text": f"[Attached file: {original_filename}]\n```\n{text}\n```"}]


def extract_full_text(file_path: Path, original_filename: str) -> str | None:
    """Extracts as much text as reasonable from a PDF or code/text file for
    RAG indexing (see rag_service.index_file_for_avatar). Returns None for
    file types with no meaningful text to index (currently just images)."""
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
    except Exception:  # noqa: BLE001
        return None
