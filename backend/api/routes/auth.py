import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user
from core.config import settings
from core.database import get_db
from core.security import create_access_token, hash_password, verify_password
from models.user import User
from schemas import (
    ForgotPasswordRequest,
    ResetPasswordRequest,
    TokenOut,
    UserLogin,
    UserOut,
    UserProfileUpdate,
    UserRegister,
)
from services.email_service import EmailNotConfigured, send_password_reset_email

router = APIRouter(prefix="/api/auth", tags=["auth"])

RESET_TOKEN_TTL = timedelta(hours=1)


@router.post("/register", response_model=TokenOut)
async def register(data: UserRegister, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where((User.username == data.username) | (User.email == data.email))
    )
    if result.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="Username or email already registered")

    user = User(
        username=data.username,
        email=data.email,
        hashed_password=hash_password(data.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(str(user.id))
    return TokenOut(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserOut)
async def update_profile(
    data: UserProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.new_password:
        if not data.current_password or not verify_password(
            data.current_password, current_user.hashed_password
        ):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        current_user.hashed_password = hash_password(data.new_password)

    if data.username and data.username != current_user.username:
        result = await db.execute(
            select(User).where(User.username == data.username, User.id != current_user.id)
        )
        if result.scalar_one_or_none() is not None:
            raise HTTPException(status_code=400, detail="Username already taken")
        current_user.username = data.username

    if data.email and data.email != current_user.email:
        result = await db.execute(
            select(User).where(User.email == data.email, User.id != current_user.id)
        )
        if result.scalar_one_or_none() is not None:
            raise HTTPException(status_code=400, detail="Email already registered")
        current_user.email = data.email

    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post("/login", response_model=TokenOut)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == data.username))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    token = create_access_token(str(user.id))
    return TokenOut(access_token=token, user=UserOut.model_validate(user))


@router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Always returns a generic success message, whether or not the email is
    registered -- this is deliberate: telling an attacker "that email isn't
    registered" is a classic account-enumeration leak. If the email exists,
    a one-time reset link is emailed; the token is single-use and expires
    in an hour."""
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if user is not None:
        token = secrets.token_urlsafe(32)
        user.reset_token = token
        user.reset_token_expires = datetime.now(timezone.utc) + RESET_TOKEN_TTL
        await db.commit()

        reset_url = f"{settings.frontend_origin}/reset-password?token={token}"
        try:
            await send_password_reset_email(user.email, reset_url)
        except EmailNotConfigured as exc:
            # Surface this one loudly -- it means the whole feature is
            # unconfigured, not that the user did anything wrong.
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=f"Failed to send reset email: {exc}") from exc

    return {"message": "If that email is registered, a reset link has been sent."}


@router.post("/reset-password")
async def reset_password(data: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.reset_token == data.token))
    user = result.scalar_one_or_none()

    if (
        user is None
        or user.reset_token_expires is None
        or user.reset_token_expires.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc)
    ):
        raise HTTPException(status_code=400, detail="Reset link is invalid or has expired")

    user.hashed_password = hash_password(data.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    await db.commit()

    return {"message": "Password has been reset. You can now log in."}
