import json
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class DocumentChunk(Base):
    """One retrievable chunk of a file a user has shared with an avatar.

    Files uploaded in chat are split into overlapping chunks, each embedded
    with a sentence-transformers model (see rag_service). At query time, the
    user's message is embedded the same way and compared against every
    chunk belonging to the avatar via cosine similarity, so only the most
    relevant passages -- not the whole document -- get added to context.
    This is what makes it retrieval-augmented generation rather than just
    pasting the whole file into the prompt (which is what happened before;
    see file_service.build_content_blocks_for_file, still used for
    immediate "here's a file, ask me about it" turns).

    Indexed per avatar (not per session) so a persona's knowledge base is
    permanent: upload a file once, and it's retrievable in every future
    conversation with that avatar, not just the one it was uploaded in.
    """

    __tablename__ = "document_chunks"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    avatar_id: Mapped[int] = mapped_column(ForeignKey("avatars.id"), nullable=False, index=True)
    source_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # Stored as a JSON-encoded list[float] rather than a dedicated vector
    # column -- SQLite has no native vector type, and at this project's
    # scale (a handful of files per avatar) brute-force cosine similarity
    # over a Python list is fast enough not to need one.
    embedding_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    avatar: Mapped["Avatar"] = relationship()

    @property
    def embedding(self) -> list[float]:
        return json.loads(self.embedding_json)
