from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class TopicMastery(Base):
    __tablename__ = "topic_masteries"
    __table_args__ = (UniqueConstraint("user_id", "avatar_id", "topic", name="uq_user_avatar_topic"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    avatar_id: Mapped[int] = mapped_column(ForeignKey("avatars.id"), nullable=False, index=True)
    topic: Mapped[str] = mapped_column(String(100), nullable=False)
    mastery_score: Mapped[float] = mapped_column(Float, default=0.0)
    interaction_count: Mapped[int] = mapped_column(Integer, default=0)
    last_topics_summary: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user: Mapped["User"] = relationship(back_populates="topic_masteries")
    avatar: Mapped["Avatar"] = relationship(back_populates="topic_masteries")
