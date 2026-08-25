import base64
import mimetypes
from pathlib import Path

from PyPDF2 import PdfReader

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


def extract_pdf_text(file_path: Path) -> str:
    try:
        reader = PdfReader(str(file_path))
        text_parts = []
        for page in reader.pages:
            text_parts.append(page.extract_text() or "")
            if sum(len(p) for p in text_parts) >= MAX_PDF_CHARS:
                break
        text = "\n".join(text_parts)
        return text[:MAX_PDF_CHARS]
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
            reader = PdfReader(str(file_path))
            parts = []
            total = 0
            for page in reader.pages:
                text = page.extract_text() or ""
                parts.append(text)
                total += len(text)
                if total >= MAX_INDEX_CHARS:
                    break
            return "\n".join(parts)[:MAX_INDEX_CHARS]
        except Exception:  # noqa: BLE001
            return None
    try:
        return file_path.read_text(encoding="utf-8", errors="replace")[:MAX_INDEX_CHARS]
    except Exception:  # noqa: BLE001
        return None
