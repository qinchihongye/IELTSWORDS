"""
复习模式相关API
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

@router.get("/due", response_model=List[schemas.ReviewWordInfo])
async def get_review_due_words(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    获取今天需要复习的单词
    """
    progress_list = crud.get_words_due_for_review(db, current_user.id)

    result = []
    for progress in progress_list:
        word = crud.get_word_by_id(db, progress.word_id)
        if word and can_access_word(db, word, current_user):
            result.append({
                "word_id": word.id,
                "word": word.word,
                "explanation": word.explanation,
                "next_review_date": progress.next_review_date,
                "difficulty_level": progress.difficulty_level,
                "review_count": progress.review_count,
                "status": progress.status
            })

    return result

@router.post("/word/{word_id}/difficulty", response_model=schemas.Progress)
async def update_word_difficulty(
    word_id: int,
    difficulty_update: schemas.DifficultyUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    更新单词难度并重新安排复习
    difficulty: 1=简单, 3=中等, 5=困难
    """
    # 验证难度值
    if difficulty_update.difficulty not in [1, 3, 5]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="难度值必须是 1(简单), 3(中等), 或 5(困难)"
        )

    # 验证单词是否存在
    word = crud.get_word_by_id(db, word_id)
    if not word:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="单词不存在"
        )
    ensure_word_accessible(db, word, current_user)

    # 更新难度和复习计划
    progress = crud.update_word_difficulty(
        db, current_user.id, word_id, difficulty_update.difficulty
    )

    return progress

@router.get("/stats", response_model=schemas.ReviewStats)
async def get_review_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    获取复习统计信息
    """
    stats = crud.get_review_stats(db, current_user.id)
    return stats
