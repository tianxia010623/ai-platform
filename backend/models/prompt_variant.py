from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class PromptVariant(Base):
    """A candidate system-prompt tweak for one avatar, plus the running
    Thompson Sampling (Beta-Bernoulli) posterior used to pick winners.

    alpha/beta start at 1/1 (a uniform prior = "no opinion yet"). Every
    thumbs-up on a message generated with this variant increments alpha;
    every thumbs-down increments beta. alpha / (alpha + beta) is the
    variant's current estimated win rate.
    """

    __tablename__ = "prompt_variants"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    avatar_id: Mapped[int] = mapped_column(ForeignKey("avatars.id"), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # Appended to the avatar's base system_prompt when this variant is chosen.
    # Empty string == the baseline / original prompt, unchanged.
    prompt_modifier: Mapped[str] = mapped_column(Text, default="")
    is_baseline: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    alpha: Mapped[float] = mapped_column(Float, default=1.0)
    beta: Mapped[float] = mapped_column(Float, default=1.0)

    times_shown: Mapped[int] = mapped_column(Integer, default=0)
    times_positive: Mapped[int] = mapped_column(Integer, default=0)
    times_negative: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    avatar: Mapped["Avatar"] = relationship(back_populates="prompt_variants")
    messages: Mapped[list["Message"]] = relationship(back_populates="prompt_variant")

    @property
    def estimated_win_rate(self) -> float:
        return round(self.alpha / (self.alpha + self.beta), 3)
