from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(10), default="user")  # user | admin
    bio: Mapped[str] = mapped_column(Text, default="")
    credits: Mapped[int] = mapped_column(Integer, default=3)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    skills: Mapped[list["Skill"]] = relationship(back_populates="owner", cascade="all, delete-orphan")
    requests: Mapped[list["SwapRequest"]] = relationship(
        back_populates="requester", cascade="all, delete-orphan"
    )


class Skill(Base):
    """A skill a member offers to teach."""

    __tablename__ = "skills"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(120), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(50), index=True)
    level: Mapped[str] = mapped_column(String(20), default="beginner")  # beginner | intermediate | expert
    format: Mapped[str] = mapped_column(String(20), default="online")  # online | offline | both
    hours_cost: Mapped[int] = mapped_column(Integer, default=1)  # credits per hour of lessons
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    owner: Mapped[User] = relationship(back_populates="skills")
    requests: Mapped[list["SwapRequest"]] = relationship(
        back_populates="skill", cascade="all, delete-orphan"
    )


class SwapRequest(Base):
    """A request from one member to learn another member's skill for time credits."""

    __tablename__ = "swap_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    skill_id: Mapped[int] = mapped_column(ForeignKey("skills.id", ondelete="CASCADE"))
    requester_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    message: Mapped[str] = mapped_column(Text, default="")
    hours: Mapped[int] = mapped_column(Integer, default=1)
    # pending | accepted | rejected | completed | cancelled
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    skill: Mapped[Skill] = relationship(back_populates="requests")
    requester: Mapped[User] = relationship(back_populates="requests")

    @property
    def total_cost(self) -> int:
        return self.hours * self.skill.hours_cost
