"""Sends transactional email via Resend's HTTP API.

We call Resend's REST endpoint directly with httpx instead of adding their
SDK as a dependency -- it's one POST request, and this project already pulls
in httpx transitively through the anthropic client.
"""

import httpx

from core.config import settings

RESEND_API_URL = "https://api.resend.com/emails"


class EmailNotConfigured(Exception):
    """Raised when RESEND_API_KEY isn't set -- lets callers turn this into a
    clear 500 instead of a confusing httpx auth error."""


async def send_password_reset_email(to_email: str, reset_url: str) -> None:
    if not settings.resend_api_key:
        raise EmailNotConfigured(
            "RESEND_API_KEY is not set in backend/.env -- forgot-password can't send email yet."
        )

    html = f"""
    <p>Someone (hopefully you) requested a password reset for your AI Avatars account.</p>
    <p><a href="{reset_url}">Click here to choose a new password</a>. This link expires in 1 hour.</p>
    <p>If you didn't request this, you can safely ignore this email.</p>
    """

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            RESEND_API_URL,
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={
                "from": settings.email_from,
                "to": [to_email],
                "subject": "Reset your AI Avatars password",
                "html": html,
            },
        )
        response.raise_for_status()
