"""
章节相关API
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from .. import schemas, crud
from ..database import get_db
from ..dependencies import get_current_user, has_min_role
from .. import models

router = APIRouter()

@router.get("", response_model=List[schemas.ChapterInfo], include_in_schema=False)
@router.get("/", response_model=List[schemas.ChapterInfo])
async def get_all_chapters(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    获取所有章节列表
    """
    chapters = crud.get_all_chapters(db)
    return chapters

@router.get("/{chapter_no}/groups", response_model=List[schemas.GroupInfo])
async def get_chapter_groups(
    chapter_no: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    获取指定章节下的所有分组
    """
    groups = crud.get_groups_by_chapter(
        db,
        chapter_no,
        current_user.id,
        unlock_all=has_min_role(current_user, "premium_user")
    )
    if not groups:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"章节 {chapter_no} 不存在或没有分组"
        )
    return groups
