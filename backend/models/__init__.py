# Importing the package registers every table on Base.metadata (needed by
# Alembic and by anything that resolves relationships by class name).
from models import (  # noqa: F401
    avatar,
    chat_session,
    document_chunk,
    message,
    message_feedback,
    prompt_variant,
    topic_mastery,
    user,
)
