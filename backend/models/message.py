from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("chat_sessions.id"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # "user" | "assistant"
    content: Mapped[str] = mapped_column(Text, default="")
    attached_files: Mapped[list] = mapped_column(JSON, default=list)
    # Which PromptVariant produced this reply (assistant messages only; None
    # for user messages and for avatars that don't use prompt variants yet).
    # Lets feedback on this message be attributed back to the variant that
    # generated it, which is what the bandit uses to update its stats.
    prompt_variant_id: Mapped[int | None] = mapped_column(
        ForeignKey("prompt_variants.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    session: Mapped["ChatSession"] = relationship(back_populates="messages")
    feedback: Mapped[list["MessageFeedback"]] = relationship(back_populates="message")
    prompt_variant: Mapped["PromptVariant | None"] = relationship(back_populates="messages")
