from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

Delivery = Literal["pickup", "post", "courier"]
Status = Literal["new", "confirmed", "shipped", "delivered", "cancelled"]


# ---------- auth / users ----------
class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[A-Za-z0-9_.-]+$")
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    full_name: str = Field(default="", max_length=120)


class LoginIn(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    email: str
    role: str
    full_name: str
    phone: str
    address: str
    is_active: bool
    created_at: datetime


class ProfileUpdate(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=30)
    address: str | None = Field(default=None, max_length=300)
    password: str | None = Field(default=None, min_length=6, max_length=128)


class AdminUserUpdate(BaseModel):
    role: Literal["user", "admin"] | None = None
    is_active: bool | None = None


# ---------- products ----------
class ProductBase(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    variety: str = Field(min_length=2, max_length=50)
    description: str = Field(default="", max_length=3000)
    taste: str = Field(default="", max_length=200)
    color: str = Field(default="#E9A23B", pattern=r"^#[0-9A-Fa-f]{6}$")
    weight_g: int = Field(default=1000, ge=10, le=10000)
    price: int = Field(ge=1, le=1_000_000)
    stock: int = Field(default=0, ge=0, le=100_000)
    harvest_year: int = Field(default=2026, ge=2000, le=2100)
    altitude_m: int = Field(default=1000, ge=0, le=5000)
    sweetness: int = Field(default=3, ge=1, le=5)
    intensity: int = Field(default=3, ge=1, le=5)
    is_active: bool = True


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    variety: str | None = Field(default=None, min_length=2, max_length=50)
    description: str | None = Field(default=None, max_length=3000)
    taste: str | None = Field(default=None, max_length=200)
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    weight_g: int | None = Field(default=None, ge=10, le=10000)
    price: int | None = Field(default=None, ge=1, le=1_000_000)
    stock: int | None = Field(default=None, ge=0, le=100_000)
    harvest_year: int | None = Field(default=None, ge=2000, le=2100)
    altitude_m: int | None = Field(default=None, ge=0, le=5000)
    sweetness: int | None = Field(default=None, ge=1, le=5)
    intensity: int | None = Field(default=None, ge=1, le=5)
    is_active: bool | None = None


class ProductOut(ProductBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    updated_at: datetime


# ---------- orders ----------
class ItemIn(BaseModel):
    product_id: int
    quantity: int = Field(ge=1, le=50)


class OrderCreate(BaseModel):
    items: list[ItemIn] = Field(min_length=1, max_length=30)
    customer_name: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=5, max_length=30)
    address: str = Field(default="", max_length=300)
    delivery: Delivery = "post"
    comment: str = Field(default="", max_length=1000)


class OrderUpdate(BaseModel):
    items: list[ItemIn] | None = Field(default=None, min_length=1, max_length=30)
    customer_name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, min_length=5, max_length=30)
    address: str | None = Field(default=None, max_length=300)
    delivery: Delivery | None = None
    comment: str | None = Field(default=None, max_length=1000)
    status: Status | None = None


class ItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    product_id: int | None
    product_name: str
    price: int
    quantity: int


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    status: Status
    customer_name: str
    phone: str
    address: str
    delivery: Delivery
    comment: str
    items: list[ItemOut]
    items_total: int
    delivery_price: int
    total: int
    created_at: datetime
    updated_at: datetime


class StatsOut(BaseModel):
    users: int
    products: int
    orders: int
    orders_by_status: dict[str, int]
    revenue: int
    honey_sold_kg: float
    low_stock: list[dict]
    top_products: list[dict]
