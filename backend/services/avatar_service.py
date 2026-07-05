from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.avatar import Avatar
from schemas import AvatarCreate, AvatarUpdate


def build_system_prompt(
    name: str,
    description: str,
    personality: str,
    speaking_style: str,
    expertise: str,
    topic_tags: list[str],
) -> str:
    """Assemble a role-play system prompt from the avatar's traits."""
    tags = ", ".join(topic_tags) if topic_tags else "general topics"

    parts = [
        f"You are {name}, an AI persona in a conversational learning platform.",
    ]
    if description:
        parts.append(f"Background: {description}")
    if personality:
        parts.append(f"Personality: {personality}")
    if speaking_style:
        parts.append(f"Speaking style: {speaking_style}. Stay consistent with this voice in every reply.")
    if expertise:
        parts.append(f"Areas of expertise: {expertise}")
    parts.append(f"Core topics you help the user explore and master: {tags}.")
    parts.append(
        "Stay in character at all times. Be engaging, ask clarifying questions when useful, "
        "and naturally guide the conversation toward deepening the user's understanding of the "
        "topics above. When the user uploads a file, incorporate its content into your reasoning. "
        "Keep responses conversational and appropriately concise unless asked for depth."
    )
    return "\n".join(parts)


async def create_avatar(
    db: AsyncSession,
    user_id: int,
    data: AvatarCreate,
    image_path: str | None,
) -> Avatar:
    system_prompt = build_system_prompt(
        data.name, data.description, data.personality, data.speaking_style, data.expertise, data.topic_tags
    )
    avatar = Avatar(
        user_id=user_id,
        name=data.name,
        description=data.description,
        personality=data.personality,
        speaking_style=data.speaking_style,
        expertise=data.expertise,
        topic_tags=data.topic_tags,
        image_path=image_path,
        system_prompt=system_prompt,
    )
    db.add(avatar)
    await db.commit()
    await db.refresh(avatar)
    return avatar


async def list_avatars(db: AsyncSession, user_id: int) -> list[Avatar]:
    result = await db.execute(
        select(Avatar).where(Avatar.user_id == user_id).order_by(Avatar.created_at.desc())
    )
    return list(result.scalars().all())


async def get_avatar(db: AsyncSession, user_id: int, avatar_id: int) -> Avatar | None:
    result = await db.execute(
        select(Avatar).where(Avatar.id == avatar_id, Avatar.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def update_avatar(db: AsyncSession, avatar: Avatar, data: AvatarUpdate) -> Avatar:
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(avatar, field, value)

    # Regenerate system prompt if any trait changed
    if update_data:
        avatar.system_prompt = build_system_prompt(
            avatar.name,
            avatar.description,
            avatar.personality,
            avatar.speaking_style,
            avatar.expertise,
            avatar.topic_tags,
        )

    await db.commit()
    await db.refresh(avatar)
    return avatar


async def delete_avatar(db: AsyncSession, avatar: Avatar) -> None:
    await db.delete(avatar)
    await db.commit()
