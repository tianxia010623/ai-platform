from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


# ---------- Auth ----------
class UserRegister(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class UserLogin(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    created_at: datetime

    class Config:
        from_attributes = True


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- Avatar ----------
class AvatarCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = ""
    personality: str = ""
    speaking_style: str = ""
    expertise: str = ""
    topic_tags: list[str] = Field(default_factory=list)


class AvatarUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    personality: str | None = None
    speaking_style: str | None = None
    expertise: str | None = None
    topic_tags: list[str] | None = None


class AvatarOut(BaseModel):
    id: int
    user_id: int
    name: str
    description: str
    personality: str
    speaking_style: str
    expertise: str
    topic_tags: list[str]
    image_path: str | None
    system_prompt: str
    created_at: datetime

    class Config:
        from_attributes = True


# ---------- Chat ----------
class ChatSessionCreate(BaseModel):
    avatar_id: int
    title: str = "New Chat"


class ChatSessionOut(BaseModel):
    id: int
    user_id: int
    avatar_id: int
    title: str
    created_at: datetime

    class Config:
        from_attributes = True


class MessageOut(BaseModel):
    id: int
    session_id: int
    role: str
    content: str
    attached_files: list[dict]
    created_at: datetime

    class Config:
        from_attributes = True


# ---------- Mastery ----------
class TopicMasteryOut(BaseModel):
    id: int
    avatar_id: int
    topic: str
    mastery_score: float
    interaction_count: int
    last_topics_summary: str
    updated_at: datetime

    class Config:
        from_attributes = True
