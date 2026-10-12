"""Retrieval-augmented generation over files a user has shared with an avatar.

Uses sentence-transformers to embed both stored document chunks and each
incoming user message into the same vector space, so a message is matched
against chunks by *meaning*, not keyword overlap. See docs/RAG.md for the
fuller write-up (chunking strategy, why this model, why cosine similarity
over a plain vector column instead of a vector DB).

All model work (loading, encoding) runs in a worker thread so it never
blocks the event loop, and each avatar's vectors are cached in memory as a
single numpy matrix so retrieval is one matrix-vector product rather than
re-reading and re-parsing every chunk from SQLite on every message.
"""

import asyncio
import hashlib
import json
import logging
import threading
from dataclasses import dataclass

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.document_chunk import DocumentChunk

log = logging.getLogger(__name__)

CHUNK_SIZE = 800
CHUNK_OVERLAP = 100
TOP_K = 4
# Cosine similarity floor below which a chunk is treated as irrelevant noise
# rather than actually related to the question.
MIN_SIMILARITY = 0.2

# Multilingual, not the more common "all-MiniLM-L6-v2" -- this app's users
# ask questions in Chinese (and English) about files that are often in
# English (e.g. academic papers), and all-MiniLM-L6-v2 is effectively an
# English-only model: a Chinese query and its relevant English passage don't
# end up close together in its embedding space, so cross-lingual retrieval
# silently returns nothing (see docs/RAG.md).
EMBEDDING_MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"


class EmbeddingUnavailable(Exception):
    """The embedding model could not be loaded (not installed, or the
    download failed -- e.g. huggingface.co unreachable without HF_ENDPOINT)."""


@dataclass(frozen=True)
class RetrievedChunk:
    source_filename: str
    content: str
    score: float


# ---------- model ----------
_model = None
_model_error: str | None = None
_model_lock = threading.Lock()


def _load_model():
    global _model, _model_error
    with _model_lock:
        if _model is not None:
            return _model
        try:
            from sentence_transformers import SentenceTransformer

            _model = SentenceTransformer(EMBEDDING_MODEL_NAME)
            _model_error = None
            log.info("Embedding model %s loaded", EMBEDDING_MODEL_NAME)
            return _model
        except Exception as exc:  # noqa: BLE001
            _model_error = str(exc)
            log.warning("Embedding model failed to load: %s", exc)
            raise EmbeddingUnavailable(str(exc)) from exc


def model_status() -> dict:
    if _model is not None:
        return {"state": "ready"}
    if _model_error:
        return {"state": "error", "detail": _model_error}
    return {"state": "loading" if _model_lock.locked() else "not_loaded"}


def warmup_in_background() -> None:
    """Start loading (and if needed, downloading) the model at startup so the
    first upload doesn't stall waiting for a ~470 MB download."""

    def _run():
        try:
            _load_model()
        except EmbeddingUnavailable:
            pass

    threading.Thread(target=_run, name="embedding-warmup", daemon=True).start()


def _encode(texts: list[str]) -> np.ndarray:
    model = _load_model()
    vectors = model.encode(texts, normalize_embeddings=True, batch_size=32)
    return np.asarray(vectors, dtype=np.float32)


async def embed_many(texts: list[str]) -> np.ndarray:
    return await asyncio.to_thread(_encode, texts)


# ---------- per-avatar vector cache ----------
@dataclass
class _AvatarIndex:
    matrix: np.ndarray  # (n_chunks, dim), unit-length rows
    chunks: list[tuple[str, str]]  # (source_filename, content)


_cache: dict[int, _AvatarIndex] = {}


def invalidate_cache(avatar_id: int) -> None:
    _cache.pop(avatar_id, None)


async def _get_index(db: AsyncSession, avatar_id: int) -> _AvatarIndex | None:
    if avatar_id in _cache:
        return _cache[avatar_id]
    result = await db.execute(
        select(DocumentChunk.source_filename, DocumentChunk.content, DocumentChunk.embedding_json)
        .where(DocumentChunk.avatar_id == avatar_id)
        .order_by(DocumentChunk.id)
    )
    rows = result.all()
    if not rows:
        return None
    matrix = np.asarray([json.loads(r.embedding_json) for r in rows], dtype=np.float32)
    index = _AvatarIndex(matrix=matrix, chunks=[(r.source_filename, r.content) for r in rows])
    _cache[avatar_id] = index
    return index


# ---------- indexing / retrieval ----------
def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Splits text into overlapping character chunks. Overlap keeps a
    sentence that lands on a chunk boundary from being unretrievable in
    either half."""
    text = text.strip()
    if not text:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        if end >= len(text):
            break
        start = end - overlap
    return chunks


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="replace")).hexdigest()


async def index_file_for_avatar(db: AsyncSession, avatar_id: int, filename: str, text: str) -> int:
    """Chunk + embed a file's text and add it to the avatar's permanent
    knowledge base. Returns how many chunks were indexed: 0 if the file had
    no text or this exact content is already indexed for the avatar.
    Raises EmbeddingUnavailable if the model can't be loaded."""
    pieces = chunk_text(text)
    if not pieces:
        return 0
    digest = content_hash(text)
    existing = await db.execute(
        select(DocumentChunk.id)
        .where(DocumentChunk.avatar_id == avatar_id, DocumentChunk.source_hash == digest)
        .limit(1)
    )
    if existing.first() is not None:
        return 0

    vectors = await embed_many(pieces)
    for i, (piece, vector) in enumerate(zip(pieces, vectors)):
        db.add(
            DocumentChunk(
                avatar_id=avatar_id,
                source_filename=filename,
                source_hash=digest,
                chunk_index=i,
                content=piece,
                embedding_json=json.dumps(vector.tolist()),
            )
        )
    await db.commit()
    invalidate_cache(avatar_id)
    return len(pieces)


async def retrieve_relevant_chunks(
    db: AsyncSession, avatar_id: int, query: str, top_k: int = TOP_K
) -> list[RetrievedChunk]:
    """Up to top_k chunks from this avatar's knowledge base that are
    semantically closest to `query`, best first. Empty if nothing is indexed
    or nothing clears the relevance bar."""
    if not query or not query.strip():
        return []
    index = await _get_index(db, avatar_id)
    if index is None:
        return []
    query_vector = (await embed_many([query]))[0]
    # Rows and query are unit-length, so the dot product is cosine similarity.
    scores = index.matrix @ query_vector
    order = np.argsort(-scores)[:top_k]
    return [
        RetrievedChunk(index.chunks[i][0], index.chunks[i][1], float(scores[i]))
        for i in order
        if scores[i] >= MIN_SIMILARITY
    ]
