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
from ..avatar_unlocks import build_unlocked_avatar_snapshot
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

@router.get("/leaderboard", response_model=List[schemas.LeaderboardEntry])
async def get_leaderboard(
    limit: int = Query(10, ge=1, le=100, description="获取前N名"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    获取全球排行榜
    """
    leaderboard = crud.get_global_leaderboard(db, current_user.id, limit)
    return leaderboard


@router.get("/dashboard", response_model=schemas.ProgressDashboard)
async def get_progress_dashboard(
    leaderboard_limit: int = Query(30, ge=1, le=100, description="排行榜数量"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    获取数据看板聚合数据，减少首页重复请求。
    """
    return {
        "stats": crud.get_progress_stats(db, current_user.id),
        "streakInfo": crud.get_or_create_streak(db, current_user.id),
        "leaderboard": crud.get_global_leaderboard(db, current_user.id, leaderboard_limit),
        "chapterProgress": crud.get_chapter_progress_stats(db, current_user.id),
    }


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
    word = crud.get_word_by_id(db, word_id)
    if not word:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="单词不存在"
        )
    ensure_word_accessible(db, word, current_user)
    return progress

@router.post("/word/{word_id}", response_model=schemas.ProgressUpdateResponse)
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
    ensure_word_accessible(db, word, current_user)

    unlocked_before = {
        item["key"]: item for item in build_unlocked_avatar_snapshot(db, current_user)
    }

    # 更新进度
    progress = crud.update_word_progress(
        db, current_user.id, word_id, progress_update.status, progress_update.quality
    )
    refreshed_user = db.query(models.User).filter(models.User.id == current_user.id).first() or current_user
    unlocked_after = build_unlocked_avatar_snapshot(db, refreshed_user)
    newly_unlocked_avatars = [
        item for item in unlocked_after
        if item["key"] not in unlocked_before
    ]

    response_payload = schemas.ProgressUpdateResponse.model_validate(progress).model_dump()
    response_payload["newly_unlocked_avatars"] = newly_unlocked_avatars
    return response_payload

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
    if not has_min_role(current_user, "premium_user"):
        progress_list = [
            item for item in progress_list
            if (word := crud.get_word_by_id(db, item["word_id"])) and can_access_word(db, word, current_user)
        ]
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
