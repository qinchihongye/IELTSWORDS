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
from .progress import get_word_progress, maybe_upgrade_user_to_premium


from sqlalchemy import desc

# ============ 错题本相关 ============

def get_mistake_words(db: Session, user_id: int) -> List[models.WordDetail]:
    """获取错题本中的单词（is_mistake_marked=True 或 status='learning'）"""
    results = db.query(models.WordDetail).join(
        models.LearningProgress,
        models.LearningProgress.word_id == models.WordDetail.id
    ).filter(
        models.LearningProgress.user_id == user_id,
        or_(
            models.LearningProgress.is_mistake_marked == True,
            models.LearningProgress.status == 'learning'
        )
    ).all()

    return results


def get_mistake_review_plan(db: Session, user_id: int) -> List[dict]:
    """获取错词复习计划，优先复习标记错词、困难词和到期词。"""
    now = datetime.now(timezone.utc)
    rows = db.query(
        models.WordDetail,
        models.LearningProgress
    ).join(
        models.LearningProgress,
        models.LearningProgress.word_id == models.WordDetail.id
    ).filter(
        models.LearningProgress.user_id == user_id,
        or_(
            models.LearningProgress.is_mistake_marked == True,
            models.LearningProgress.status == 'learning'
        )
    ).all()

    plan = []
    for word, progress in rows:
        next_review_date = progress.next_review_date
        if next_review_date and next_review_date.tzinfo is None:
            next_review_date = next_review_date.replace(tzinfo=timezone.utc)
        is_due = next_review_date is None or next_review_date <= now
        difficulty = progress.difficulty_level or 3
        if progress.is_mistake_marked or difficulty >= 5:
            priority = "high"
            reason = "重点错词，建议今天优先复习"
        elif is_due:
            priority = "medium"
            reason = "已到复习时间"
        else:
            priority = "low"
            reason = "保持在计划中，稍后复习"

        priority_score = {"high": 0, "medium": 1, "low": 2}[priority]
        plan.append({
            "word_id": word.id,
            "word": word.word,
            "explanation": word.explanation,
            "priority": priority,
            "reason": reason,
            "review_count": progress.review_count,
            "difficulty_level": difficulty,
            "next_review_date": next_review_date,
            "_sort": (priority_score, next_review_date or now, -progress.review_count),
        })

    plan.sort(key=lambda item: item["_sort"])
    for item in plan:
        item.pop("_sort", None)

    return plan

def toggle_mistake_mark(db: Session, user_id: int, word_id: int) -> models.LearningProgress:
    """切换单词的错题标记"""
    progress = get_word_progress(db, user_id, word_id)

    if not progress:
        # 创建新记录并标记为错题
        progress = models.LearningProgress(
            user_id=user_id,
            word_id=word_id,
            status='learning',
            is_mistake_marked=True,
            review_count=0
        )
        db.add(progress)
    else:
        # 切换标记
        progress.is_mistake_marked = not progress.is_mistake_marked
        # 取消错词标记时，同时将状态设为已掌握
        if not progress.is_mistake_marked:
            progress.status = 'mastered'

    db.commit()
    db.refresh(progress)
    if progress.status in ['learning', 'mastered']:
        maybe_upgrade_user_to_premium(db, user_id)
    return progress
