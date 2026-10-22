from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..models import Order, OrderItem, Product, User
from ..schemas import ItemIn, OrderCreate, OrderOut, OrderUpdate

router = APIRouter(prefix="/api/orders", tags=["orders"])

# Status changes the apiary (admin) may make; a buyer may only cancel a new order.
ADMIN_TRANSITIONS = {
    ("new", "confirmed"), ("new", "cancelled"),
    ("confirmed", "shipped"), ("confirmed", "cancelled"),
    ("shipped", "delivered"),
}
USER_TRANSITIONS = {("new", "cancelled")}
# In these statuses the honey is still on the shelf, so cancelling returns it to stock
RESERVED = {"new", "confirmed"}


def _get_order(db: Session, order_id: int, user: User) -> Order:
    order = db.get(Order, order_id)
    if order is None or (order.user_id != user.id and user.role != "admin"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Заказ не найден")
    return order


def _reserve(db: Session, items: list[ItemIn]) -> list[OrderItem]:
    """Take products from stock and return order lines with frozen name and price."""
    quantities: dict[int, int] = {}
    for item in items:
        quantities[item.product_id] = quantities.get(item.product_id, 0) + item.quantity
    lines = []
    for product_id, quantity in quantities.items():
        product = db.get(Product, product_id)
        if product is None or not product.is_active:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Товар #{product_id} недоступен")
        if product.stock < quantity:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"«{product.name}»: в наличии {product.stock} шт., а заказано {quantity}",
            )
        product.stock -= quantity
        lines.append(OrderItem(
            product_id=product.id, product_name=product.name, price=product.price, quantity=quantity
        ))
    return lines


def _release(db: Session, order: Order) -> None:
    for line in order.items:
        product = db.get(Product, line.product_id) if line.product_id else None
        if product is not None:
            product.stock += line.quantity


def _recalculate(order: Order) -> None:
    order.items_total = sum(line.price * line.quantity for line in order.items)
    free = order.items_total >= settings.free_delivery_from
    order.delivery_price = 0 if free else settings.delivery_prices[order.delivery]


@router.get("", response_model=list[OrderOut])
def list_orders(
    status_filter: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(Order)
    if user.role != "admin":
        stmt = stmt.where(Order.user_id == user.id)
    if status_filter:
        stmt = stmt.where(Order.status == status_filter)
    return db.scalars(stmt.order_by(Order.created_at.desc(), Order.id.desc())).all()


@router.get("/{order_id}", response_model=OrderOut)
def get_order(order_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _get_order(db, order_id, user)


@router.post("", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def create_order(
    data: OrderCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    if data.delivery != "pickup" and not data.address.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Укажите адрес доставки")
    order = Order(user_id=user.id, **data.model_dump(exclude={"items"}))
    order.items = _reserve(db, data.items)
    _recalculate(order)
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


@router.put("/{order_id}", response_model=OrderOut)
def update_order(
    order_id: int,
    data: OrderUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = _get_order(db, order_id, user)
    is_admin = user.role == "admin"
    changes = data.model_dump(exclude_unset=True)
    new_status = changes.pop("status", None)
    new_items = changes.pop("items", None)

    if (changes or new_items) and order.status != "new" and not is_admin:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Изменить можно только новый, ещё не подтверждённый заказ"
        )
    for field, value in changes.items():
        setattr(order, field, value)
    if new_items is not None:
        if order.status != "new":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Состав меняется только у нового заказа")
        _release(db, order)
        order.items.clear()
        db.flush()
        order.items.extend(_reserve(db, data.items))
    if order.delivery != "pickup" and not order.address.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Укажите адрес доставки")

    if new_status and new_status != order.status:
        allowed = ADMIN_TRANSITIONS if is_admin else USER_TRANSITIONS
        if (order.status, new_status) not in allowed:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, f"Нельзя перевести заказ из «{order.status}» в «{new_status}»"
            )
        if new_status == "cancelled" and order.status in RESERVED:
            _release(db, order)
        order.status = new_status

    _recalculate(order)
    db.commit()
    db.refresh(order)
    return order


@router.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_order(order_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    order = _get_order(db, order_id, user)
    if user.role != "admin" and order.status not in ("new", "cancelled"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Удалить можно только новый или отменённый заказ"
        )
    if order.status in RESERVED:
        _release(db, order)
    db.delete(order)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
