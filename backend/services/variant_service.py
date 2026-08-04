from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.prompt_variant import PromptVariant


async def list_variants(db: AsyncSession, avatar_id: int) -> list[PromptVariant]:
    result = await db.execute(
        select(PromptVariant)
        .where(PromptVariant.avatar_id == avatar_id)
        .order_by(PromptVariant.created_at.asc())
    )
    return list(result.scalars().all())


async def get_variant(db: AsyncSession, avatar_id: int, variant_id: int) -> PromptVariant | None:
    result = await db.execute(
        select(PromptVariant).where(
            PromptVariant.id == variant_id, PromptVariant.avatar_id == avatar_id
        )
    )
    return result.scalar_one_or_none()


async def create_variant(
    db: AsyncSession, avatar_id: int, name: str, prompt_modifier: str
) -> PromptVariant:
    """Create a new prompt variant for an avatar.

    The first variant ever created for an avatar automatically brings along
    a "Baseline (original)" control variant with an empty modifier — i.e.
    the avatar's original prompt, unchanged. That way the bandit is always
    choosing between the original prompt and the new idea, rather than
    silently replacing the original the moment someone adds one variant.
    """
    existing = await list_variants(db, avatar_id)
    if not existing:
        baseline = PromptVariant(
            avatar_id=avatar_id,
            name="Baseline (original)",
            prompt_modifier="",
            is_baseline=True,
        )
        db.add(baseline)

    variant = PromptVariant(avatar_id=avatar_id, name=name, prompt_modifier=prompt_modifier)
    db.add(variant)
    await db.commit()
    await db.refresh(variant)
    return variant


async def set_variant_active(db: AsyncSession, variant: PromptVariant, is_active: bool) -> PromptVariant:
    variant.is_active = is_active
    await db.commit()
    await db.refresh(variant)
    return variant
