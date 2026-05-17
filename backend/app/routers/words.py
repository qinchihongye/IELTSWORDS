"""
单词相关API
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List
from .. import schemas, crud
from ..database import get_db
from ..dependencies import get_current_user, has_min_role
from .. import models

router = APIRouter()

@router.get("/random", response_model=schemas.WordDetail)
async def get_random_word(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    随机返回一个单词
    优先返回当前用户未学过的单词
    """
    word = crud.get_random_word(
        db,
        current_user.id,
        unlocked_only=not has_min_role(current_user, "premium_user")
    )
    if not word:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="没有可用的单词"
        )
    return word

@router.get("/random/batch", response_model=List[schemas.WordDetail])
async def get_random_words_batch(
    count: int = Query(10, ge=1, le=50, description="返回的单词数量"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    随机返回多个单词
    优先返回未学过的单词
    """
    words = crud.get_random_words_batch(
        db,
        current_user.id,
        count,
        unlocked_only=not has_min_role(current_user, "premium_user")
    )

    if not words:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="没有可用的单词"
        )

    return words

@router.get("/{word}", response_model=schemas.WordDetail)
async def get_word_detail(
    word: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    获取单词的完整详细信息
    """
    word_detail = crud.get_word_by_name(db, word)
    if not word_detail:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"单词 '{word}' 不存在"
        )

    if not has_min_role(current_user, "premium_user") and not crud.is_group_unlocked_for_user(
        db,
        word_detail.chapterNo,
        word_detail.groupId,
        current_user.id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="该单词所属分组尚未解锁"
        )

    return word_detail
