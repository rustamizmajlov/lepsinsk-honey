from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Skill, SwapRequest, User
from ..schemas import SwapCreate, SwapOut, SwapUpdate

router = APIRouter(prefix="/api/swaps", tags=["swaps"])

# Which status changes are allowed and who may perform them:
# "owner" — teacher (owner of the skill), "requester" — student, "any" — either side.
TRANSITIONS: dict[tuple[str, str], str] = {
    ("pending", "accepted"): "owner",
    ("pending", "rejected"): "owner",
    ("pending", "cancelled"): "requester",
    ("accepted", "cancelled"): "any",
    ("accepted", "completed"): "any",
}
DELETABLE = {"pending", "rejected", "cancelled"}


def _get_swap(db: Session, swap_id: int) -> SwapRequest:
    swap = db.get(SwapRequest, swap_id)
    if swap is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Заявка не найдена")
    return swap


def _side(swap: SwapRequest, user: User) -> str | None:
    if swap.requester_id == user.id:
        return "requester"
    if swap.skill.owner_id == user.id:
        return "owner"
    return None


@router.get("", response_model=list[SwapOut])
def list_swaps(
    box: Literal["all", "incoming", "outgoing"] = "all",
    status_filter: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(SwapRequest).join(SwapRequest.skill)
    if box == "incoming":
        stmt = stmt.where(Skill.owner_id == user.id)
    elif box == "outgoing":
        stmt = stmt.where(SwapRequest.requester_id == user.id)
    elif user.role != "admin":
        stmt = stmt.where(or_(Skill.owner_id == user.id, SwapRequest.requester_id == user.id))
    if status_filter:
        stmt = stmt.where(SwapRequest.status == status_filter)
    return db.scalars(stmt.order_by(SwapRequest.created_at.desc())).all()


@router.get("/{swap_id}", response_model=SwapOut)
def get_swap(swap_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    swap = _get_swap(db, swap_id)
    if _side(swap, user) is None and user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет доступа к заявке")
    return swap


@router.post("", response_model=SwapOut, status_code=status.HTTP_201_CREATED)
def create_swap(
    data: SwapCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    skill = db.get(Skill, data.skill_id)
    if skill is None or not skill.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Навык не найден или скрыт")
    if skill.owner_id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Нельзя записаться на собственный навык")
    cost = data.hours * skill.hours_cost
    if user.credits < cost:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Недостаточно тайм-кредитов: нужно {cost}, на балансе {user.credits}",
        )
    duplicate = db.scalar(
        select(SwapRequest).where(
            SwapRequest.skill_id == skill.id,
            SwapRequest.requester_id == user.id,
            SwapRequest.status.in_(["pending", "accepted"]),
        )
    )
    if duplicate:
        raise HTTPException(status.HTTP_409_CONFLICT, "У вас уже есть активная заявка на этот навык")
    swap = SwapRequest(**data.model_dump(), requester_id=user.id)
    db.add(swap)
    db.commit()
    db.refresh(swap)
    return swap


@router.put("/{swap_id}", response_model=SwapOut)
def update_swap(
    swap_id: int,
    data: SwapUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    swap = _get_swap(db, swap_id)
    side = _side(swap, user)
    is_admin = user.role == "admin"
    if side is None and not is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет доступа к заявке")

    changes = data.model_dump(exclude_unset=True)
    new_status = changes.pop("status", None)

    # message and hours belong to the student and can only change before the answer
    if {"message", "hours"} & changes.keys():
        if not is_admin and (side != "requester" or swap.status != "pending"):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Текст и часы можно менять только в ожидающей заявке"
            )
    if "scheduled_at" in changes and swap.status not in ("pending", "accepted") and not is_admin:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Время можно менять только в активной заявке")
    for field, value in changes.items():
        setattr(swap, field, value)

    if new_status and new_status != swap.status:
        who = TRANSITIONS.get((swap.status, new_status))
        if who is None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, f"Переход {swap.status} → {new_status} невозможен"
            )
        if not is_admin and who != "any" and who != side:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Это действие доступно другой стороне")
        if new_status == "completed":
            requester, teacher = swap.requester, swap.skill.owner
            cost = swap.total_cost
            if requester.credits < cost:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST, "У ученика недостаточно кредитов для оплаты"
                )
            requester.credits -= cost
            teacher.credits += cost
        swap.status = new_status

    db.commit()
    db.refresh(swap)
    return swap


@router.delete("/{swap_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_swap(
    swap_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    swap = _get_swap(db, swap_id)
    if user.role != "admin":
        if swap.requester_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Удалить заявку может только её автор")
        if swap.status not in DELETABLE:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Принятые и завершённые заявки удалять нельзя"
            )
    db.delete(swap)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
