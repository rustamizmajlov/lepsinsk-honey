from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_admin
from ..models import Skill, SwapRequest, User
from ..schemas import AdminUserUpdate, StatsOut, UserOut, UserPublic

router = APIRouter(prefix="/api", tags=["users & admin"])


@router.get("/users/{user_id}/public", response_model=UserPublic)
def public_profile(user_id: int, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Пользователь не найден")
    return user


@router.get("/admin/users", response_model=list[UserOut])
def list_users(
    q: str | None = None, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    stmt = select(User).order_by(User.id)
    if q:
        stmt = stmt.where(func.lower(User.username).like(f"%{q.lower()}%"))
    return db.scalars(stmt).all()


@router.patch("/admin/users/{user_id}", response_model=UserOut)
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


@router.delete("/admin/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Пользователь не найден")
    if user.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Нельзя удалить самого себя")
    db.delete(user)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/admin/stats", response_model=StatsOut)
def stats(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    completed = select(SwapRequest).where(SwapRequest.status == "completed").subquery()
    top = db.execute(
        select(Skill.category, func.count(Skill.id).label("count"))
        .group_by(Skill.category)
        .order_by(func.count(Skill.id).desc())
        .limit(5)
    ).all()
    return StatsOut(
        users=db.scalar(select(func.count(User.id))) or 0,
        skills=db.scalar(select(func.count(Skill.id))) or 0,
        swaps=db.scalar(select(func.count(SwapRequest.id))) or 0,
        completed_swaps=db.scalar(select(func.count()).select_from(completed)) or 0,
        hours_exchanged=db.scalar(select(func.coalesce(func.sum(completed.c.hours), 0))) or 0,
        top_categories=[{"category": c, "count": n} for c, n in top],
    )
