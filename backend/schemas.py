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


class UserProfileUpdate(BaseModel):
    """All fields optional -- send only what you want to change. Changing
    the password requires the current one, verified server-side."""

    username: str | None = Field(default=None, min_length=3, max_length=64)
    email: EmailStr | None = None
    current_password: str | None = None
    new_password: str | None = Field(default=None, min_length=6, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=6, max_length=128)


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


class ChatSessionUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=60)


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
    prompt_variant_id: int | None
    created_at: datetime
    # The current user's own feedback on this message, if any (1 / -1 / None).
    # Not a DB column — populated on the Message instance by the route before
    # serialization, so the frontend can restore 👍/👎 button state on reload.
    user_feedback: int | None = None

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


# ---------- Feedback ----------
class MessageFeedbackCreate(BaseModel):
    rating: int = Field(ge=-1, le=1)


class MessageFeedbackOut(BaseModel):
    id: int
    message_id: int
    user_id: int
    rating: int
    created_at: datetime

    class Config:
        from_attributes = True


class FeedbackSummaryOut(BaseModel):
    avatar_id: int
    avatar_name: str
    total: int
    thumbs_up: int
    thumbs_down: int
    approval_rate: float | None


# ---------- Prompt Variants (bandit) ----------
class PromptVariantCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    prompt_modifier: str = Field(min_length=1)


class PromptVariantUpdate(BaseModel):
    is_active: bool


class PromptVariantOut(BaseModel):
    id: int
    avatar_id: int
    name: str
    prompt_modifier: str
    is_baseline: bool
    is_active: bool
    alpha: float
    beta: float
    times_shown: int
    times_positive: int
    times_negative: int
    estimated_win_rate: float
    created_at: datetime

    class Config:
        from_attributes = True
