"""
学习进度相关API
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import csv
import io
from .. import schemas, crud
from ..database import get_db
from ..dependencies import get_current_user
from .. import models

router = APIRouter()

@router.get("/leaderboard", response_model=List[schemas.LeaderboardEntry])
async def get_leaderboard(
    limit: int = Query(10, description="获取前N名"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    获取全球排行榜
    """
    leaderboard = crud.get_global_leaderboard(db, current_user.id, limit)
    return leaderboard

@router.get("/stats", response_model=schemas.ProgressStats)
async def get_progress_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    获取当前用户的学习统计
    """
    stats = crud.get_progress_stats(db, current_user.id)
    return stats

@router.get("/chapters", response_model=List[schemas.ChapterProgressStats])
async def get_chapter_progress_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    获取当前用户每个章节的学习进度
    """
    return crud.get_chapter_progress_stats(db, current_user.id)

@router.get("/word/{word_id}", response_model=schemas.Progress)
async def get_word_progress(
    word_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    获取指定单词的学习进度
    """
    progress = crud.get_word_progress(db, current_user.id, word_id)
    if not progress:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="该单词还没有学习记录"
        )
    return progress

@router.post("/word/{word_id}", response_model=schemas.Progress)
async def update_word_progress(
    word_id: int,
    progress_update: schemas.ProgressUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    更新单词的学习状态
    """
    # 验证单词是否存在
    word = crud.get_word_by_id(db, word_id)
    if not word:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="单词不存在"
        )

    # 更新进度
    progress = crud.update_word_progress(
        db, current_user.id, word_id, progress_update.status
    )
    return progress

@router.get("/words", response_model=List[schemas.ProgressWithWord])
async def get_all_progress(
    status: Optional[str] = Query(None, description="筛选特定状态的单词"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    获取用户所有单词的学习进度
    可选：按状态筛选
    """
    if status and status not in ['unlearned', 'learning', 'mastered']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="无效的学习状态"
        )

    progress_list = crud.get_all_progress(db, current_user.id, status)
    return progress_list

@router.get("/export")
async def export_my_progress(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    导出当前用户学习记录
    """
    progress_list = crud.get_all_progress(db, current_user.id)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["word_id", "word", "status", "review_count", "last_reviewed"])
    for item in progress_list:
        writer.writerow([
            item["word_id"],
            item["word"],
            item["status"],
            item["review_count"],
            item["last_reviewed"],
        ])

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=my-progress.csv"}
    )
