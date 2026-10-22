from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

Level = Literal["beginner", "intermediate", "expert"]
Format = Literal["online", "offline", "both"]
Status = Literal["pending", "accepted", "rejected", "completed", "cancelled"]


# ---------- auth / users ----------
class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[A-Za-z0-9_.-]+$")
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class LoginIn(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    bio: str


class UserOut(UserPublic):
    email: str
    role: str
    credits: int
    is_active: bool
    created_at: datetime


class ProfileUpdate(BaseModel):
    email: EmailStr | None = None
    bio: str | None = Field(default=None, max_length=1000)
    password: str | None = Field(default=None, min_length=6, max_length=128)


class AdminUserUpdate(BaseModel):
    role: Literal["user", "admin"] | None = None
    is_active: bool | None = None
    credits: int | None = Field(default=None, ge=0)


# ---------- skills ----------
class SkillBase(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(default="", max_length=3000)
    category: str = Field(min_length=2, max_length=50)
    level: Level = "beginner"
    format: Format = "online"
    hours_cost: int = Field(default=1, ge=1, le=5)


class SkillCreate(SkillBase):
    pass


class SkillUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=120)
    description: str | None = Field(default=None, max_length=3000)
    category: str | None = Field(default=None, min_length=2, max_length=50)
    level: Level | None = None
    format: Format | None = None
    hours_cost: int | None = Field(default=None, ge=1, le=5)
    is_active: bool | None = None


class SkillOut(SkillBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    is_active: bool
    owner: UserPublic
    created_at: datetime
    updated_at: datetime


# ---------- swap requests ----------
class SwapCreate(BaseModel):
    skill_id: int
    message: str = Field(default="", max_length=2000)
    hours: int = Field(default=1, ge=1, le=20)
    scheduled_at: datetime | None = None


class SwapUpdate(BaseModel):
    message: str | None = Field(default=None, max_length=2000)
    hours: int | None = Field(default=None, ge=1, le=20)
    scheduled_at: datetime | None = None
    status: Status | None = None


class SkillShort(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    hours_cost: int
    owner: UserPublic


class SwapOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    skill: SkillShort
    requester: UserPublic
    message: str
    hours: int
    total_cost: int
    status: Status
    scheduled_at: datetime | None
    created_at: datetime
    updated_at: datetime


class StatsOut(BaseModel):
    users: int
    skills: int
    swaps: int
    completed_swaps: int
    hours_exchanged: int
    top_categories: list[dict]
