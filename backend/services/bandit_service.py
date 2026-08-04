"""Thompson Sampling over an avatar's active PromptVariants.

Why Thompson Sampling instead of a fixed A/B split or epsilon-greedy:
our real feedback volume per avatar is tiny (a handful of thumbs up/down a
day), so we need an algorithm that behaves sensibly from round one. Thompson
Sampling draws a random sample from each variant's Beta(alpha, beta)
posterior and picks whichever sample is highest. Early on, when alpha/beta
are close to the uniform 1/1 prior, the draws are noisy and every variant
gets picked roughly as often as the others (exploration). As real feedback
accumulates, the posteriors tighten around each variant's true win rate and
the sampled draws increasingly favor the best one (exploitation) — without
ever needing a hand-tuned exploration rate like epsilon-greedy does.

See backend/scripts/simulate_bandit.py for a synthetic demo of this
convergence, and docs/PROMPT_VARIANTS.md for the full write-up.
"""

import random

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.prompt_variant import PromptVariant


async def get_active_variants(db: AsyncSession, avatar_id: int) -> list[PromptVariant]:
    result = await db.execute(
        select(PromptVariant).where(
            PromptVariant.avatar_id == avatar_id,
            PromptVariant.is_active.is_(True),
        )
    )
    return list(result.scalars().all())


def thompson_sample_best(variants: list[PromptVariant]) -> PromptVariant:
    """Draw one sample per variant from Beta(alpha, beta) and return the
    variant with the highest draw."""
    best_variant = variants[0]
    best_sample = -1.0
    for v in variants:
        sample = random.betavariate(v.alpha, v.beta)
        if sample > best_sample:
            best_sample = sample
            best_variant = v
    return best_variant


async def select_variant_for_avatar(db: AsyncSession, avatar_id: int) -> PromptVariant | None:
    """Returns None if the avatar has no prompt variants configured yet —
    callers should fall back to the avatar's base system_prompt untouched,
    so this feature is opt-in per avatar and doesn't change behavior for
    avatars nobody has set up variants for."""
    variants = await get_active_variants(db, avatar_id)
    if not variants:
        return None
    return thompson_sample_best(variants)


async def record_impression(db: AsyncSession, variant: PromptVariant) -> None:
    variant.times_shown += 1
    await db.commit()


async def apply_reward(db: AsyncSession, variant: PromptVariant, reward: int) -> None:
    """reward: 1 for thumbs up, 0 for thumbs down."""
    if reward == 1:
        variant.alpha += 1
        variant.times_positive += 1
    else:
        variant.beta += 1
        variant.times_negative += 1
    await db.commit()


async def revert_reward(db: AsyncSession, variant: PromptVariant, reward: int) -> None:
    """Undo a previously applied reward — used when a user changes an
    existing rating (feedback is upsert, so the old effect must be removed
    before the new one is applied). Floors at 1.0 so alpha/beta never drop
    below the original prior even if bookkeeping ever gets out of sync."""
    if reward == 1:
        variant.alpha = max(1.0, variant.alpha - 1)
        variant.times_positive = max(0, variant.times_positive - 1)
    else:
        variant.beta = max(1.0, variant.beta - 1)
        variant.times_negative = max(0, variant.times_negative - 1)
    await db.commit()
