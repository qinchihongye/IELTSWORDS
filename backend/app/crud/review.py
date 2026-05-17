"""
CRUD操作模块
数据库操作的封装
"""

from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_
from typing import List, Optional
from datetime import datetime, timedelta, timezone
import random
import re
from .. import models, schemas, auth
from .common import calculate_next_review_date
from .progress import get_word_progress, maybe_upgrade_user_to_premium

from sqlalchemy import desc

# ============ 复习模式相关 ============

def get_words_due_for_review(db: Session, user_id: int) -> List[models.LearningProgress]:
    """获取需要复习的单词（next_review_date <= 今天）"""
    today = datetime.now(timezone.utc)

    return db.query(models.LearningProgress).filter(
        models.LearningProgress.user_id == user_id,
        models.LearningProgress.next_review_date.isnot(None),
        models.LearningProgress.next_review_date <= today
    ).all()

def get_review_stats(db: Session, user_id: int) -> dict:
    """获取复习统计"""
    today = datetime.now(timezone.utc)
    week_later = today + timedelta(days=7)

    # 今天需要复习的
    due_today = db.query(func.count(models.LearningProgress.id)).filter(
        models.LearningProgress.user_id == user_id,
        models.LearningProgress.next_review_date.isnot(None),
        models.LearningProgress.next_review_date <= today
    ).scalar()

    # 本周需要复习的
    due_this_week = db.query(func.count(models.LearningProgress.id)).filter(
        models.LearningProgress.user_id == user_id,
        models.LearningProgress.next_review_date.isnot(None),
        models.LearningProgress.next_review_date <= week_later
    ).scalar()

    # 总共在复习中的
    total_in_review = db.query(func.count(models.LearningProgress.id)).filter(
        models.LearningProgress.user_id == user_id,
        models.LearningProgress.next_review_date.isnot(None)
    ).scalar()

    return {
        "due_today": due_today or 0,
        "due_this_week": due_this_week or 0,
        "total_in_review": total_in_review or 0
    }

def update_word_difficulty(db: Session, user_id: int, word_id: int, difficulty: int) -> models.LearningProgress:
    """更新单词难度并重新安排复习"""
    progress = get_word_progress(db, user_id, word_id)

    if not progress:
        # 创建新的进度记录
        progress = models.LearningProgress(
            user_id=user_id,
            word_id=word_id,
            status='learning',
            difficulty_level=difficulty,
            review_count=1,
            last_reviewed=datetime.now(timezone.utc)
        )
        db.add(progress)
    else:
        # 更新现有记录
        progress.difficulty_level = difficulty
        progress.review_count += 1
        progress.last_reviewed = datetime.now(timezone.utc)

    # 计算下次复习日期
    progress.next_review_date = calculate_next_review_date(
        progress.review_count,
        difficulty,
        progress.last_reviewed
    )

    db.commit()
    db.refresh(progress)
    maybe_upgrade_user_to_premium(db, user_id)
    return progress
