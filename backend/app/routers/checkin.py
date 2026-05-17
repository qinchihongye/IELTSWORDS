"""
打卡相关API
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List
from .. import schemas, crud
from ..database import get_db
from ..dependencies import get_current_user
from .. import models

router = APIRouter()

@router.get("/streak", response_model=schemas.CheckInStreakInfo)
async def get_streak_info(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    获取当前用户的打卡连续记录
    """
    streak = crud.get_or_create_streak(db, current_user.id)
    return streak

@router.post("/today", response_model=schemas.CheckInStreakInfo)
async def update_today_checkin(
    checkin: schemas.CheckInRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    更新今日打卡记录
    """
    if checkin.words_learned < 0 or checkin.words_reviewed < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="学习和复习的单词数不能为负数"
        )

    streak = crud.update_check_in(
        db, current_user.id, checkin.words_learned, checkin.words_reviewed
    )

    return streak

@router.get("/history", response_model=List[schemas.DailyCheckInInfo])
async def get_checkin_history(
    days: int = Query(30, ge=1, le=365, description="获取最近N天的打卡历史"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    获取打卡历史记录
    """
    history = crud.get_check_in_history(db, current_user.id, days)
    return history
