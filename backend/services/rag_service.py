"""Retrieval-augmented generation over files a user has shared with an avatar.

Uses sentence-transformers (all-MiniLM-L6-v2) to embed both stored document
chunks and each incoming user message into the same 384-dim vector space, so
a message is matched against chunks by *meaning*, not keyword overlap. This
is what distinguishes it from the older behavior in file_service.py, which
just pastes an entire uploaded file's text into that one message's context.
See docs/RAG.md for the fuller write-up (chunking strategy, why this model,
why cosine similarity over a plain vector column instead of a vector DB).
"""

import json
from functools import lru_cache

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.document_chunk import DocumentChunk

CHUNK_SIZE = 800
CHUNK_OVERLAP = 100
TOP_K = 4
# Cosine similarity floor below which a chunk is treated as irrelevant noise
# rather than actually related to the question.
MIN_SIMILARITY = 0.2


@lru_cache(maxsize=1)
def _get_model():
    # Imported lazily so nothing else in the app pays sentence-transformers'
    # import/load cost unless a file is actually uploaded or a message needs
    # retrieval run against it.
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer("all-MiniLM-L6-v2")


def embed(text: str) -> list[float]:
    model = _get_model()
    vector = model.encode(text, normalize_embeddings=True)
    return vector.tolist()


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


async def index_file_for_avatar(
    db: AsyncSession, avatar_id: int, filename: str, text: str
) -> int:
    """Chunk + embed a file's text and add it to the avatar's permanent
    knowledge base. Returns how many chunks were indexed (0 if the file had
    no extractable text)."""
    pieces = chunk_text(text)
    for i, piece in enumerate(pieces):
        vector = embed(piece)
        db.add(
            DocumentChunk(
                avatar_id=avatar_id,
                source_filename=filename,
                chunk_index=i,
                content=piece,
                embedding_json=json.dumps(vector),
            )
        )
    if pieces:
        await db.commit()
    return len(pieces)


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    # Both vectors come out of SentenceTransformer.encode(normalize_embeddings=True),
    # i.e. already unit-length, so a plain dot product IS cosine similarity —
    # no need to divide by ||a|| * ||b||.
    return sum(x * y for x, y in zip(a, b))


async def retrieve_relevant_chunks(
    db: AsyncSession, avatar_id: int, query: str, top_k: int = TOP_K
) -> list[DocumentChunk]:
    """Returns up to top_k chunks from this avatar's knowledge base that are
    semantically closest to `query`, best first. Empty list if the avatar
    has no indexed files yet, or nothing clears the relevance bar — callers
    should treat that as "no extra context", not an error."""
    if not query or not query.strip():
        return []
    result = await db.execute(select(DocumentChunk).where(DocumentChunk.avatar_id == avatar_id))
    chunks = list(result.scalars().all())
    if not chunks:
        return []

    query_vector = embed(query)
    scored = [(c, _cosine_similarity(query_vector, c.embedding)) for c in chunks]
    scored.sort(key=lambda pair: pair[1], reverse=True)
    return [c for c, score in scored[:top_k] if score >= MIN_SIMILARITY]
