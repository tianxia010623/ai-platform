from anthropic import AsyncAnthropic

from core.config import settings

anthropic_client = AsyncAnthropic(api_key=settings.anthropic_api_key)
