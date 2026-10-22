from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_optional_user, require_admin
from ..models import Product, User
from ..schemas import ProductCreate, ProductOut, ProductUpdate

router = APIRouter(prefix="/api/products", tags=["products"])

SORTS = {
    "new": Product.created_at.desc(),
    "price_asc": Product.price.asc(),
    "price_desc": Product.price.desc(),
    "name": Product.name.asc(),
}


def _get_product(db: Session, product_id: int) -> Product:
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Товар не найден")
    return product


@router.get("", response_model=list[ProductOut])
def list_products(
    q: str | None = None,
    variety: str | None = None,
    min_price: int | None = Query(None, ge=0),
    max_price: int | None = Query(None, ge=0),
    in_stock: bool = False,
    include_inactive: bool = False,
    sort: Literal["new", "price_asc", "price_desc", "name"] = "name",
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    stmt = select(Product)
    # hidden products are visible only in the admin panel
    if not (include_inactive and user and user.role == "admin"):
        stmt = stmt.where(Product.is_active.is_(True))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(
            Product.name.ilike(like), Product.description.ilike(like), Product.taste.ilike(like)
        ))
    if variety:
        stmt = stmt.where(Product.variety.ilike(variety))
    if min_price is not None:
        stmt = stmt.where(Product.price >= min_price)
    if max_price is not None:
        stmt = stmt.where(Product.price <= max_price)
    if in_stock:
        stmt = stmt.where(Product.stock > 0)
    return db.scalars(stmt.order_by(SORTS[sort], Product.id)).all()


@router.get("/varieties", response_model=list[str])
def list_varieties(db: Session = Depends(get_db)):
    stmt = select(Product.variety).where(Product.is_active.is_(True)).distinct()
    return sorted(db.scalars(stmt).all())


@router.get("/{product_id}", response_model=ProductOut)
def get_product(
    product_id: int,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    product = _get_product(db, product_id)
    if not product.is_active and not (user and user.role == "admin"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Товар не найден")
    return product


@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def create_product(
    data: ProductCreate, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    product = Product(**data.model_dump())
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.put("/{product_id}", response_model=ProductOut)
def update_product(
    product_id: int,
    data: ProductUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    product = _get_product(db, product_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(product, field, value)
    db.commit()
    db.refresh(product)
    return product


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(
    product_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    db.delete(_get_product(db, product_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
