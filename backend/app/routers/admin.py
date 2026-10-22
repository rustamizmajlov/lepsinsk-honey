from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_admin
from ..models import Order, OrderItem, Product, User
from ..schemas import AdminUserUpdate, StatsOut, UserOut

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


@router.get("/users", response_model=list[UserOut])
def list_users(q: str | None = None, db: Session = Depends(get_db)):
    stmt = select(User).order_by(User.id)
    if q:
        stmt = stmt.where(User.username.ilike(f"%{q}%"))
    return db.scalars(stmt).all()


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    data: AdminUserUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Пользователь не найден")
    if user.id == admin.id and (data.role == "user" or data.is_active is False):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Нельзя понизить или заблокировать себя")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Пользователь не найден")
    if user.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Нельзя удалить самого себя")
    db.delete(user)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/stats", response_model=StatsOut)
def stats(db: Session = Depends(get_db)):
    paid = Order.status != "cancelled"
    by_status = dict(db.execute(select(Order.status, func.count(Order.id)).group_by(Order.status)).all())
    revenue = db.scalar(
        select(func.coalesce(func.sum(Order.items_total + Order.delivery_price), 0)).where(paid)
    )
    grams = db.scalar(
        select(func.coalesce(func.sum(OrderItem.quantity * Product.weight_g), 0))
        .join(Order, OrderItem.order_id == Order.id)
        .join(Product, OrderItem.product_id == Product.id)
        .where(paid)
    )
    top = db.execute(
        select(OrderItem.product_name, func.sum(OrderItem.quantity).label("qty"))
        .join(Order, OrderItem.order_id == Order.id)
        .where(paid)
        .group_by(OrderItem.product_name)
        .order_by(func.sum(OrderItem.quantity).desc())
        .limit(5)
    ).all()
    low = db.execute(
        select(Product.id, Product.name, Product.stock)
        .where(Product.is_active.is_(True), Product.stock < 5)
        .order_by(Product.stock)
    ).all()
    return StatsOut(
        users=db.scalar(select(func.count(User.id))) or 0,
        products=db.scalar(select(func.count(Product.id))) or 0,
        orders=sum(by_status.values()),
        orders_by_status=by_status,
        revenue=revenue or 0,
        honey_sold_kg=round((grams or 0) / 1000, 1),
        low_stock=[{"id": i, "name": n, "stock": s} for i, n, s in low],
        top_products=[{"name": n, "quantity": int(q)} for n, q in top],
    )
