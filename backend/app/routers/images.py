"""
图片相关API
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from urllib.parse import quote
from typing import List
from .. import schemas, crud
from ..database import get_db
from ..dependencies import get_current_user, has_min_role
from ..local_images import (
    get_local_group_image_numbers,
    get_local_group_image_path,
    get_local_word_image_path,
    get_local_image_media_type,
)
from .. import models

router = APIRouter()


def _build_versioned_image_url(chapter_no: str, group_id: str, image_number: int) -> str:
    image_path = get_local_group_image_path(chapter_no, group_id, image_number)
    if not image_path:
        return f"/api/images/{chapter_no}/{group_id}/{image_number}"

    try:
        stat = image_path.stat()
        version = f"{image_path.suffix.lower().lstrip('.')}-{stat.st_mtime_ns}-{stat.st_size}"
    except OSError:
        version = image_path.suffix.lower().lstrip('.') or "image"

    return f"/api/images/{chapter_no}/{group_id}/{image_number}?v={quote(version)}"


@router.get("/{group_id}", response_model=List[schemas.ImageInfo])
async def get_group_images(
    group_id: str,
    chapter_no: str = Query(..., description="章节编号"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    获取指定分组的所有配图信息
    """
    if not has_min_role(current_user, "premium_user") and not crud.is_group_unlocked_for_user(
        db,
        chapter_no,
        group_id,
        current_user.id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="该分组尚未解锁"
        )

    image_numbers = get_local_group_image_numbers(chapter_no, group_id)
    if not image_numbers:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"分组 {group_id} 没有配图"
        )

    image_list = [
        {
            "imageNumber": image_number,
            "imageUrl": _build_versioned_image_url(chapter_no, group_id, image_number),
            "chapterNo": chapter_no,
            "groupId": group_id,
        }
        for image_number in image_numbers
    ]

    return image_list


@router.get("/{chapter_no}/{group_id}/{image_number}")
async def get_image(
    chapter_no: str,
    group_id: str,
    image_number: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    直接返回图片二进制流
    """
    if not has_min_role(current_user, "premium_user") and not crud.is_group_unlocked_for_user(
        db,
        chapter_no,
        group_id,
        current_user.id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="该分组尚未解锁"
        )

    local_image_path = get_local_group_image_path(chapter_no, group_id, image_number)
    if local_image_path and local_image_path.exists():
        return FileResponse(
            path=local_image_path,
            media_type=get_local_image_media_type(local_image_path),
            headers={"Cache-Control": "private, max-age=604800"},
        )

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="图片不存在"
    )


@router.get("/word/{chapter_no}/{group_id}/{word}")
async def get_word_image(
    chapter_no: str,
    group_id: str,
    word: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    直接返回单词图片二进制流
    """
    if not has_min_role(current_user, "premium_user") and not crud.is_group_unlocked_for_user(
        db,
        chapter_no,
        group_id,
        current_user.id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="该分组尚未解锁"
        )

    local_image_path = get_local_word_image_path(chapter_no, group_id, word)
    if local_image_path and local_image_path.exists():
        return FileResponse(
            path=local_image_path,
            media_type=get_local_image_media_type(local_image_path),
            headers={"Cache-Control": "private, max-age=604800"},
        )

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="单词图片不存在"
    )
