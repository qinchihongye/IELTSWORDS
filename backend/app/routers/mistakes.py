"""
错题本相关API
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from .. import schemas, crud
from ..database import get_db
from ..dependencies import get_current_user, has_min_role
from .. import models

router = APIRouter()


def can_access_word(db: Session, word: models.WordDetail, current_user: models.User) -> bool:
    if has_min_role(current_user, "premium_user"):
        return True

    return crud.is_group_unlocked_for_user(db, word.chapterNo, word.groupId, current_user.id)


def ensure_word_accessible(db: Session, word: models.WordDetail, current_user: models.User):
    if not can_access_word(db, word, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="该单词所属分组尚未解锁",
        )

@router.get("/", response_model=List[schemas.WordDetail])
async def get_mistake_words(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    获取错题本中的所有单词
    包括标记为错题的和状态为'learning'的单词
    """
    words = crud.get_mistake_words(db, current_user.id)
    if not has_min_role(current_user, "premium_user"):
        words = [word for word in words if can_access_word(db, word, current_user)]
    return words

@router.get("/review-plan", response_model=List[schemas.MistakeReviewPlanItem])
async def get_mistake_review_plan(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    获取错词复习计划
    """
    plan = crud.get_mistake_review_plan(db, current_user.id)
    if has_min_role(current_user, "premium_user"):
        return plan

    filtered_plan = []
    for item in plan:
        word = crud.get_word_by_id(db, item["word_id"])
        if word and can_access_word(db, word, current_user):
            filtered_plan.append(item)
    return filtered_plan

@router.post("/word/{word_id}/toggle")
async def toggle_mistake_mark(
    word_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    切换单词的错题标记
    """
    # 验证单词是否存在
    word = crud.get_word_by_id(db, word_id)
    if not word:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="单词不存在"
        )
    ensure_word_accessible(db, word, current_user)

    progress = crud.toggle_mistake_mark(db, current_user.id, word_id)

    return {
        "word_id": word_id,
        "is_mistake_marked": progress.is_mistake_marked,
        "message": "已添加到错题本" if progress.is_mistake_marked else "已从错题本移除"
    }
