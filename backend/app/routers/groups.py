"""
分组相关API
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from .. import schemas, crud
from ..database import get_db
from ..dependencies import get_current_user, has_min_role
from .. import models

router = APIRouter()

@router.get("/{group_id}/words", response_model=List[schemas.WordDetail])
async def get_group_words(
    group_id: str,
    chapter_no: Optional[str] = Query(None, description="章节编号，用于精准定位分组"),
    detail: bool = Query(True, description="是否返回完整详情"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    获取指定分组下的所有单词
    """
    if not has_min_role(current_user, "premium_user"):
        if not chapter_no:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="普通用户访问分组时需要提供章节编号"
            )

        if not crud.is_group_unlocked_for_user(db, chapter_no, group_id, current_user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="该分组尚未解锁"
            )

    words = crud.get_words_by_group(db, group_id, chapter_no=chapter_no, detail=detail)
    if not words:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"分组 {group_id} 不存在或没有单词"
        )
    return words

@router.get("/random", response_model=List[schemas.GroupInfo])
async def get_random_groups(
    count: int = Query(5, ge=1, le=10, description="返回的分组数量"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    随机返回指定数量的分组
    """
    groups = crud.get_random_groups(
        db,
        count,
        user_id=current_user.id,
        unlock_all=has_min_role(current_user, "premium_user")
    )
    return groups
