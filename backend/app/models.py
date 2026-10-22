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
    full_name: Mapped[str] = mapped_column(String(120), default="")
    phone: Mapped[str] = mapped_column(String(30), default="")
    address: Mapped[str] = mapped_column(String(300), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    orders: Mapped[list["Order"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Product(Base):
    """A honey or bee product sold by the apiary."""

    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    variety: Mapped[str] = mapped_column(String(50), index=True)  # Горный, Луговой, Соты…
    description: Mapped[str] = mapped_column(Text, default="")
    taste: Mapped[str] = mapped_column(String(200), default="")
    color: Mapped[str] = mapped_column(String(7), default="#E9A23B")  # jar colour in the UI
    weight_g: Mapped[int] = mapped_column(Integer, default=1000)
    price: Mapped[int] = mapped_column(Integer)  # tenge
    stock: Mapped[int] = mapped_column(Integer, default=0)
    harvest_year: Mapped[int] = mapped_column(Integer, default=2026)
    altitude_m: Mapped[int] = mapped_column(Integer, default=1000)
    sweetness: Mapped[int] = mapped_column(Integer, default=3)  # 1..5, used by the honey picker
    intensity: Mapped[int] = mapped_column(Integer, default=3)  # 1..5, how bold the taste is
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    # new | confirmed | shipped | delivered | cancelled
    status: Mapped[str] = mapped_column(String(20), default="new", index=True)
    customer_name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(30))
    address: Mapped[str] = mapped_column(String(300), default="")
    delivery: Mapped[str] = mapped_column(String(20), default="post")  # pickup | post | courier
    comment: Mapped[str] = mapped_column(Text, default="")
    items_total: Mapped[int] = mapped_column(Integer, default=0)
    delivery_price: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped[User] = relationship(back_populates="orders")
    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )

    @property
    def total(self) -> int:
        return self.items_total + self.delivery_price

    @property
    def username(self) -> str:
        return self.user.username


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"))
    # Name and price are copied so the order survives product edits and deletion
    product_id: Mapped[int | None] = mapped_column(
        ForeignKey("products.id", ondelete="SET NULL"), nullable=True
    )
    product_name: Mapped[str] = mapped_column(String(120))
    price: Mapped[int] = mapped_column(Integer)
    quantity: Mapped[int] = mapped_column(Integer)

    order: Mapped[Order] = relationship(back_populates="items")
