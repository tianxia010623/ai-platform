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
