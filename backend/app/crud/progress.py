"""
CRUD操作模块
数据库操作的封装
"""

from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_, case
from typing import List, Optional
from datetime import datetime, timedelta, timezone
import random
import re
import time
from .. import models, schemas, auth
from ..config.settings import LEADERBOARD_CACHE_TTL_SECONDS
from .common import calculate_next_review_date
from .sm2 import calculate_sm2


from sqlalchemy import desc

_leaderboard_cache: dict[int, tuple[float, list[dict]]] = {}


def clear_global_leaderboard_cache() -> None:
    _leaderboard_cache.clear()

# ============ 学习进度相关 ============

def get_progress_stats(db: Session, user_id: int) -> dict:
    """获取学习统计"""
    total_words = db.query(func.count(models.WordDetail.id)).scalar()

    # 统计各状态的单词数
    progress_counts = db.query(
        models.LearningProgress.status,
        func.count(models.LearningProgress.id)
    ).filter(
        models.LearningProgress.user_id == user_id
    ).group_by(models.LearningProgress.status).all()

    stats = {
        'unlearned': 0,
        'learning': 0,
        'mastered': 0
    }

    for status, count in progress_counts:
        stats[status] = count

    # 未学习的单词数 = 总数 - 已有进度的单词数
    learned_count = sum(stats.values())
    stats['unlearned'] = total_words - learned_count

    return {
        "totalWords": total_words,
        "unlearnedCount": stats['unlearned'],
        "learningCount": stats['learning'],
        "masteredCount": stats['mastered']
    }

def get_chapter_progress_stats(db: Session, user_id: int) -> List[dict]:
    """获取每个章节的学习进度统计。"""
    rows = db.query(
        models.WordDetail.chapterNo,
        models.WordDetail.chapterName,
        func.count(models.WordDetail.id).label("total_words"),
        func.sum(
            case(
                (models.LearningProgress.status.in_(["learning", "mastered"]), 1),
                else_=0
            )
        ).label("learned_count"),
        func.sum(
            case(
                (models.LearningProgress.status == "mastered", 1),
                else_=0
            )
        ).label("mastered_count"),
        func.sum(
            case(
                (models.LearningProgress.status == "learning", 1),
                else_=0
            )
        ).label("learning_count"),
    ).outerjoin(
        models.LearningProgress,
        and_(
            models.LearningProgress.word_id == models.WordDetail.id,
            models.LearningProgress.user_id == user_id
        )
    ).group_by(
        models.WordDetail.chapterNo,
        models.WordDetail.chapterName
    ).all()

    sorted_rows = sorted(
        rows,
        key=lambda row: int(row.chapterNo) if str(row.chapterNo).isdigit() else str(row.chapterNo)
    )

    chapter_stats = []
    for row in sorted_rows:
        total_words = row.total_words or 0
        learned_count = row.learned_count or 0
        mastered_count = row.mastered_count or 0
        learning_count = row.learning_count or 0

        chapter_stats.append({
            "chapterNo": row.chapterNo,
            "chapterName": row.chapterName,
            "totalWords": total_words,
            "learnedCount": learned_count,
            "masteredCount": mastered_count,
            "learningCount": learning_count,
            "learnedPercent": round((learned_count / total_words) * 100, 1) if total_words else 0,
            "masteredPercent": round((mastered_count / total_words) * 100, 1) if total_words else 0,
        })

    return chapter_stats

def get_word_progress(db: Session, user_id: int, word_id: int) -> Optional[models.LearningProgress]:
    """获取单词学习进度"""
    return db.query(models.LearningProgress).filter(
        models.LearningProgress.user_id == user_id,
        models.LearningProgress.word_id == word_id
    ).first()


def maybe_upgrade_user_to_premium(db: Session, user_id: int) -> Optional[models.User]:
    """普通用户学完全部内置词汇后自动升级为 VIP 用户。"""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user or user.role != 'user':
        return None

    total_builtin_words = db.query(func.count(models.WordDetail.id)).scalar() or 0
    if total_builtin_words <= 0:
        return None

    learned_builtin_words = db.query(
        func.count(func.distinct(models.LearningProgress.word_id))
    ).filter(
        models.LearningProgress.user_id == user_id,
        models.LearningProgress.status.in_(['learning', 'mastered'])
    ).scalar() or 0

    if learned_builtin_words < total_builtin_words:
        return None

    user.role = 'premium_user'
    user.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    return user

def update_word_progress(db: Session, user_id: int, word_id: int, status: str, quality: Optional[int] = None) -> models.LearningProgress:
    """更新单词学习状态"""
    progress = get_word_progress(db, user_id, word_id)
    now = datetime.now(timezone.utc)

    if progress:
        # 更新现有进度
        progress.status = status
        progress.last_reviewed = now
        progress.review_count += 1
    else:
        # 创建新进度
        progress = models.LearningProgress(
            user_id=user_id,
            word_id=word_id,
            status=status,
            last_reviewed=now,
            review_count=1,
            easiness_factor=2.5,
            interval=0,
            repetitions=0
        )
        db.add(progress)

    if status in ['learning', 'mastered']:
        if quality is not None and 0 <= quality <= 5:
            new_reps, new_ef, new_interval = calculate_sm2(
                quality=quality,
                repetitions=progress.repetitions,
                easiness_factor=progress.easiness_factor,
                interval=progress.interval
            )
            progress.repetitions = new_reps
            progress.easiness_factor = new_ef
            progress.interval = new_interval
            progress.next_review_date = now + timedelta(days=new_interval)
            
            # Map quality (0-5) back to old difficulty scale (1-5) roughly for backward compatibility
            # Quality 5 (Easy) -> Diff 1
            # Quality 4 (Good) -> Diff 2
            # Quality 3 (Hard) -> Diff 3
            # Quality 0-2 (Fail) -> Diff 4-5
            progress.difficulty_level = max(1, min(5, round(5.5 - quality)))
        else:
            difficulty_level = progress.difficulty_level or 3
            progress.difficulty_level = difficulty_level
            progress.next_review_date = calculate_next_review_date(
                progress.review_count,
                difficulty_level,
                progress.last_reviewed
            )
    else:
        progress.next_review_date = None

    progress.updated_at = now
    db.commit()
    db.refresh(progress)
    if status in ['learning', 'mastered']:
        maybe_upgrade_user_to_premium(db, user_id)
    clear_global_leaderboard_cache()
    return progress

def get_all_progress(db: Session, user_id: int, status: Optional[str] = None) -> List[dict]:
    """获取用户所有学习进度"""
    query = db.query(
        models.LearningProgress,
        models.WordDetail.word
    ).join(
        models.WordDetail,
        models.LearningProgress.word_id == models.WordDetail.id
    ).filter(
        models.LearningProgress.user_id == user_id
    )

    if status:
        query = query.filter(models.LearningProgress.status == status)

    results = query.all()

    return [
        {
            "word_id": p.word_id,
            "word": word,
            "status": p.status,
            "last_reviewed": p.last_reviewed,
            "review_count": p.review_count
        }
        for p, word in results
    ]


def get_global_leaderboard(db: Session, current_user_id: int, limit: int = 10) -> List[dict]:
    """获取全球排行榜，计算多维度积分"""
    normalized_limit = max(1, min(int(limit or 10), 100))
    now = time.monotonic()
    cached = _leaderboard_cache.get(normalized_limit)
    if cached and now - cached[0] <= LEADERBOARD_CACHE_TTL_SECONDS:
        base_rows = cached[1]
    else:
        base_rows = _query_global_leaderboard(db, normalized_limit)
        if LEADERBOARD_CACHE_TTL_SECONDS > 0:
            _leaderboard_cache[normalized_limit] = (now, base_rows)

    return [
        {
            "rank": row["rank"],
            "username": row["username"],
            "role": row["role"],
            "avatar_type": row["avatar_type"],
            "avatar_value": row["avatar_value"],
            "score": row["score"],
            "is_user": row["user_id"] == current_user_id,
        }
        for row in base_rows
    ]


def _query_global_leaderboard(db: Session, limit: int) -> List[dict]:
    score_expr = (
        func.coalesce(func.sum(case((models.LearningProgress.status == 'mastered', 1), else_=0)), 0) * 10 +
        func.coalesce(func.sum(case((models.LearningProgress.status == 'learning', 1), else_=0)), 0) * 2 +
        func.coalesce(func.max(models.CheckInStreak.total_check_ins), 0) * 5 +
        func.coalesce(func.max(models.CheckInStreak.longest_streak), 0) * 10
    ).label('total_score')

    results = db.query(
        models.User.username,
        models.User.id,
        models.User.role,
        models.User.avatar_type,
        models.User.avatar_value,
        score_expr
    ).outerjoin(
        models.LearningProgress, 
        models.User.id == models.LearningProgress.user_id
    ).outerjoin(
        models.CheckInStreak,
        models.User.id == models.CheckInStreak.user_id
    ).group_by(
        models.User.id
    ).order_by(
        desc('total_score'), models.User.id
    ).limit(limit).all()

    leaderboard = []
    for rank, (username, user_id, role, avatar_type, avatar_value, score) in enumerate(results, start=1):
        leaderboard.append({
            "rank": rank,
            "username": username,
            "user_id": user_id,
            "role": role,
            "avatar_type": avatar_type,
            "avatar_value": avatar_value,
            "score": score,
        })
    return leaderboard


# ============ 打卡相关 ============

def get_or_create_streak(db: Session, user_id: int) -> models.CheckInStreak:
    """获取或创建打卡记录"""
    streak = db.query(models.CheckInStreak).filter(
        models.CheckInStreak.user_id == user_id
    ).first()

    if not streak:
        streak = models.CheckInStreak(user_id=user_id)
        db.add(streak)
        db.commit()
        db.refresh(streak)

    return streak

def update_check_in(db: Session, user_id: int, words_learned: int, words_reviewed: int) -> models.CheckInStreak:
    """更新今日打卡"""
    today = datetime.now(timezone.utc).date()
    streak = get_or_create_streak(db, user_id)

    # 检查今天是否已打卡
    today_checkin = db.query(models.DailyCheckIn).filter(
        models.DailyCheckIn.user_id == user_id,
        func.date(models.DailyCheckIn.check_in_date) == today
    ).first()

    if today_checkin:
        # 更新今天的记录
        today_checkin.words_learned = words_learned
        today_checkin.words_reviewed = words_reviewed
    else:
        # 创建新的打卡记录
        today_checkin = models.DailyCheckIn(
            user_id=user_id,
            check_in_date=datetime.now(timezone.utc),
            words_learned=words_learned,
            words_reviewed=words_reviewed
        )
        db.add(today_checkin)

        # 更新连续打卡天数
        if streak.last_check_in_date:
            last_date = streak.last_check_in_date.date()
            yesterday = today - timedelta(days=1)

            if last_date == yesterday:
                # 连续打卡
                streak.current_streak += 1
            elif last_date == today:
                # 今天已经打卡过
                pass
            else:
                # 中断了，重新开始
                streak.current_streak = 1
        else:
            # 第一次打卡
            streak.current_streak = 1

        # 更新最长连续记录
        if streak.current_streak > streak.longest_streak:
            streak.longest_streak = streak.current_streak

        # 更新最后打卡日期和总次数
        streak.last_check_in_date = datetime.now(timezone.utc)
        streak.total_check_ins += 1
        streak.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(streak)
    clear_global_leaderboard_cache()
    return streak

def get_check_in_history(db: Session, user_id: int, days: int = 30) -> List[models.DailyCheckIn]:
    """获取打卡历史"""
    start_date = datetime.now(timezone.utc) - timedelta(days=days)

    return db.query(models.DailyCheckIn).filter(
        models.DailyCheckIn.user_id == user_id,
        models.DailyCheckIn.check_in_date >= start_date
    ).order_by(models.DailyCheckIn.check_in_date.desc()).all()
