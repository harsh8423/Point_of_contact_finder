"""Auth router — register, login, logout, me, change-password."""
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, Request, status
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import User
from dependencies import get_current_user, get_usage_today
import auth_utils

router = APIRouter(prefix="/api/auth", tags=["auth"])

ACCESS_TOKEN_DAYS = 7


# ─────────────────────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    username: str
    email: EmailStr
    password: str

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        # Don't strip — a username with spaces should fail clearly
        if " " in v:
            raise ValueError("Username cannot contain spaces. Use underscores instead (e.g. john_doe)")
        v = v.strip()
        if len(v) < 3 or len(v) > 30:
            raise ValueError("Username must be 3–30 characters long")
        if not re.match(r"^[a-zA-Z0-9_]+$", v):
            raise ValueError("Username may only contain letters (a-z), digits (0-9), and underscores (_)")
        return v

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def pw_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("New password must be at least 8 characters")
        return v


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def _set_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="poc_token",
        value=token,
        httponly=True,
        samesite="none",
        secure=True,
        max_age=ACCESS_TOKEN_DAYS * 86400,
        path="/",
    )


def _user_dict(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "plan": user.plan,
        "is_admin": user.is_admin,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat(),
    }


# ─────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────

@router.post("/register", status_code=201)
async def register(req: RegisterRequest, response: Response, db: AsyncSession = Depends(get_db)):
    # Check username uniqueness
    existing = await db.execute(select(User).where(User.username == req.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already taken")

    # Check email uniqueness
    existing = await db.execute(select(User).where(User.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Check if this is the very first user → make them admin
    count_res = await db.execute(select(User))
    is_first = count_res.first() is None

    user = User(
        username=req.username,
        email=req.email,
        password_hash=auth_utils.hash_password(req.password),
        plan="free_trial",
        is_admin=is_first,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = auth_utils.create_access_token(user.id, user.username, user.is_admin)
    _set_cookie(response, token)
    return {"user": _user_dict(user), "token": token}


@router.post("/login")
async def login(req: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()

    if not user or not auth_utils.verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    token = auth_utils.create_access_token(user.id, user.username, user.is_admin)
    _set_cookie(response, token)
    return {"user": _user_dict(user), "token": token}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("poc_token", path="/", samesite="none", secure=True)
    return {"message": "Logged out"}


@router.get("/me")
async def me(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    usage = await get_usage_today(current_user, db)
    return {
        "user": _user_dict(current_user),
        "usage": usage,
    }


@router.post("/change-password")
async def change_password(
    req: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not auth_utils.verify_password(req.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    current_user.password_hash = auth_utils.hash_password(req.new_password)
    await db.commit()
    return {"message": "Password changed successfully"}
