from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Skill, User
from ..schemas import SkillCreate, SkillOut, SkillUpdate

router = APIRouter(prefix="/api/skills", tags=["skills"])


def _get_skill(db: Session, skill_id: int) -> Skill:
    skill = db.get(Skill, skill_id)
    if skill is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Навык не найден")
    return skill


def _check_owner(skill: Skill, user: User) -> None:
    if skill.owner_id != user.id and user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Можно изменять только свои навыки")


@router.get("", response_model=list[SkillOut])
def list_skills(
    q: str | None = None,
    category: str | None = None,
    level: str | None = None,
    format: str | None = None,
    owner_id: int | None = None,
    include_inactive: bool = False,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    stmt = select(Skill).join(Skill.owner).where(User.is_active.is_(True))
    if not include_inactive:
        stmt = stmt.where(Skill.is_active.is_(True))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Skill.title.ilike(like), Skill.description.ilike(like)))
    if category:
        stmt = stmt.where(Skill.category.ilike(category))
    if level:
        stmt = stmt.where(Skill.level == level)
    if format:
        stmt = stmt.where(or_(Skill.format == format, Skill.format == "both"))
    if owner_id:
        stmt = stmt.where(Skill.owner_id == owner_id)
    stmt = stmt.order_by(Skill.created_at.desc()).limit(limit).offset(offset)
    return db.scalars(stmt).all()


@router.get("/categories", response_model=list[str])
def list_categories(db: Session = Depends(get_db)):
    return db.scalars(select(Skill.category).distinct().order_by(Skill.category)).all()


@router.get("/{skill_id}", response_model=SkillOut)
def get_skill(skill_id: int, db: Session = Depends(get_db)):
    return _get_skill(db, skill_id)


@router.post("", response_model=SkillOut, status_code=status.HTTP_201_CREATED)
def create_skill(
    data: SkillCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    skill = Skill(**data.model_dump(), owner_id=user.id)
    db.add(skill)
    db.commit()
    db.refresh(skill)
    return skill


@router.put("/{skill_id}", response_model=SkillOut)
def update_skill(
    skill_id: int,
    data: SkillUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    skill = _get_skill(db, skill_id)
    _check_owner(skill, user)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(skill, field, value)
    db.commit()
    db.refresh(skill)
    return skill


@router.delete("/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_skill(
    skill_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    skill = _get_skill(db, skill_id)
    _check_owner(skill, user)
    db.delete(skill)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
