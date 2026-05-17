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
from ..local_images import get_local_image_count_map, get_local_image_count_map_for_chapter


from sqlalchemy import desc

# ============ 章节相关 ============

def get_all_chapters(db: Session) -> List[dict]:
    """获取所有章节"""
    chapters = db.query(
        models.Word.chapterNo,
        models.Word.chapterName,
        func.count(models.Word.id).label('wordCount'),
        func.count(func.distinct(models.Word.groupId)).label('groupCount')
    ).group_by(
        models.Word.chapterNo,
        models.Word.chapterName
    ).all()

    sorted_chapters = sorted(
        chapters,
        key=lambda chapter: int(chapter.chapterNo) if str(chapter.chapterNo).isdigit() else str(chapter.chapterNo)
    )

    return [
        {
            "chapterNo": ch.chapterNo,
            "chapterName": ch.chapterName,
            "wordCount": ch.wordCount,
            "groupCount": ch.groupCount
        }
        for ch in sorted_chapters
    ]

def is_group_completed(group: dict) -> bool:
    """判断分组是否已学完。"""
    return group["wordCount"] > 0 and group["learnedCount"] >= group["wordCount"]


def apply_group_unlock_state(groups: List[dict], unlock_all: bool = False) -> List[dict]:
    """为分组列表补充完成与解锁状态。"""
    previous_completed = True
    enriched_groups = []

    for index, group in enumerate(groups):
        is_completed = is_group_completed(group)
        is_unlocked = unlock_all or index == 0 or previous_completed
        enriched_groups.append({
            **group,
            "isCompleted": is_completed,
            "isUnlocked": is_unlocked,
        })
        previous_completed = is_completed

    return enriched_groups


def get_groups_by_chapter(db: Session, chapter_no: str, user_id: int, unlock_all: bool = False) -> List[dict]:
    """获取指定章节的所有分组（单次查询，含图片数量和学习进度）"""
    local_image_count_map = get_local_image_count_map_for_chapter(chapter_no)
    progress_subq = db.query(
        models.WordDetail.groupId,
        models.WordDetail.chapterNo,
        func.count(models.LearningProgress.id).label('learned_count')
    ).join(
        models.LearningProgress,
        and_(
            models.WordDetail.id == models.LearningProgress.word_id,
            models.LearningProgress.user_id == user_id,
            models.LearningProgress.status.in_(['learning', 'mastered'])
        )
    ).filter(
        models.WordDetail.chapterNo == chapter_no
    ).group_by(
        models.WordDetail.groupId, models.WordDetail.chapterNo
    ).subquery()

    rows = db.query(
        models.Word.groupId,
        models.Word.groupTheme,
        models.Word.chapterNo,
        models.Word.chapterName,
        func.count(models.Word.id).label('wordCount'),
        func.coalesce(progress_subq.c.learned_count, 0).label('learnedCount')
    ).outerjoin(
        progress_subq,
        and_(
            models.Word.groupId == progress_subq.c.groupId,
            models.Word.chapterNo == progress_subq.c.chapterNo
        )
    ).filter(
        models.Word.chapterNo == chapter_no
    ).group_by(
        models.Word.groupId, models.Word.groupTheme,
        models.Word.chapterNo, models.Word.chapterName,
        progress_subq.c.learned_count
    ).all()

    def group_sort_key(r):
        match = re.search(r"(\d+)$", r.groupId)
        if match:
            return (int(match.group(1)), r.groupId)
        return (float("inf"), r.groupId)

    rows = sorted(rows, key=group_sort_key)

    groups = [
        {
            "groupId": r.groupId,
            "groupTheme": r.groupTheme,
            "chapterNo": r.chapterNo,
            "chapterName": r.chapterName,
            "wordCount": r.wordCount,
            "imageCount": local_image_count_map.get(r.groupId, 0),
            "learnedCount": r.learnedCount
        }
        for r in rows
    ]

    return apply_group_unlock_state(groups, unlock_all=unlock_all)


def is_group_unlocked_for_user(db: Session, chapter_no: str, group_id: str, user_id: int) -> bool:
    """判断普通用户是否已解锁指定分组。"""
    groups = get_groups_by_chapter(db, chapter_no, user_id, unlock_all=False)
    return any(group["groupId"] == group_id and group["isUnlocked"] for group in groups)


def get_unlocked_group_filters(db: Session, user_id: int):
    """获取普通用户已解锁分组的 SQL 过滤条件。"""
    unlocked_groups = []
    for chapter in get_all_chapters(db):
        unlocked_groups.extend(
            group for group in get_groups_by_chapter(db, chapter["chapterNo"], user_id, unlock_all=False)
            if group["isUnlocked"]
        )

    if not unlocked_groups:
        return None

    return or_(*[
        and_(
            models.WordDetail.chapterNo == group["chapterNo"],
            models.WordDetail.groupId == group["groupId"]
        )
        for group in unlocked_groups
    ])


# ============ 分组相关 ============

def get_words_by_group(
    db: Session,
    group_id: str,
    chapter_no: Optional[str] = None,
    detail: bool = False
) -> List[models.WordDetail]:
    """获取指定分组的所有单词"""
    filters = [models.WordDetail.groupId == group_id] if detail else [models.Word.groupId == group_id]

    if chapter_no:
        if detail:
            filters.append(models.WordDetail.chapterNo == chapter_no)
        else:
            filters.append(models.Word.chapterNo == chapter_no)

    if detail:
        return db.query(models.WordDetail).filter(
            *filters
        ).order_by(models.WordDetail.wordNo).all()
    else:
        return db.query(models.Word).filter(
            *filters
        ).order_by(models.Word.wordNo).all()

def get_random_groups(db: Session, count: int = 5, user_id: Optional[int] = None, unlock_all: bool = True) -> List[dict]:
    """随机获取分组（单次查询，含图片数量）"""
    local_image_count_map = get_local_image_count_map()
    if not unlock_all and user_id is not None:
        groups = []
        for chapter in get_all_chapters(db):
            groups.extend(
                group for group in get_groups_by_chapter(db, chapter["chapterNo"], user_id, unlock_all=False)
                if group["isUnlocked"]
            )
        return random.sample(groups, min(count, len(groups)))

    rows = db.query(
        models.Word.groupId,
        models.Word.groupTheme,
        models.Word.chapterNo,
        models.Word.chapterName,
        func.count(models.Word.id).label('wordCount')
    ).group_by(
        models.Word.groupId, models.Word.groupTheme,
        models.Word.chapterNo, models.Word.chapterName
    ).all()

    selected = random.sample(rows, min(count, len(rows)))

    groups = [
        {
            "groupId": g.groupId,
            "groupTheme": g.groupTheme,
            "chapterNo": g.chapterNo,
            "chapterName": g.chapterName,
            "wordCount": g.wordCount,
            "imageCount": local_image_count_map.get((g.chapterNo, g.groupId), 0),
            "learnedCount": 0,
            "isCompleted": False,
            "isUnlocked": True
        }
        for g in selected
    ]

    return groups


# ============ 单词相关 ============

def get_word_by_name(db: Session, word: str) -> Optional[models.WordDetail]:
    """根据单词名称获取详情"""
    return db.query(models.WordDetail).filter(models.WordDetail.word == word).first()

def get_word_by_id(db: Session, word_id: int) -> Optional[models.WordDetail]:
    """根据ID获取单词详情"""
    return db.query(models.WordDetail).filter(models.WordDetail.id == word_id).first()


def search_words(db: Session, keyword: Optional[str] = None, limit: int = 50) -> List[models.WordDetail]:
    """按关键词搜索单词详情。"""
    query = db.query(models.WordDetail)
    if keyword:
        pattern = f"%{keyword}%"
        query = query.filter(
            or_(
                models.WordDetail.word.ilike(pattern),
                models.WordDetail.explanation.ilike(pattern),
                models.WordDetail.chapterName.ilike(pattern),
                models.WordDetail.groupTheme.ilike(pattern),
            )
        )

    return query.order_by(models.WordDetail.chapterNo, models.WordDetail.groupId, models.WordDetail.wordNo).limit(limit).all()


def update_word_detail(db: Session, word: models.WordDetail, payload: schemas.WordUpdate) -> models.WordDetail:
    """更新单词内容字段。"""
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(word, key, value)
    db.commit()
    db.refresh(word)
    return word

def get_random_word(db: Session, user_id: int, unlocked_only: bool = False) -> Optional[models.WordDetail]:
    """随机获取单词，优先返回未学过的（数据库层随机）"""
    unlocked_filter = get_unlocked_group_filters(db, user_id) if unlocked_only else None
    if unlocked_only and unlocked_filter is None:
        return None

    word = db.query(models.WordDetail).outerjoin(
        models.LearningProgress,
        and_(
            models.LearningProgress.word_id == models.WordDetail.id,
            models.LearningProgress.user_id == user_id
        )
    ).filter(
        or_(
            models.LearningProgress.id == None,
            models.LearningProgress.status == 'unlearned'
        )
    )

    if unlocked_filter is not None:
        word = word.filter(unlocked_filter)

    word = word.order_by(func.random()).first()

    if word:
        return word

    fallback = db.query(models.WordDetail)
    if unlocked_filter is not None:
        fallback = fallback.filter(unlocked_filter)

    return fallback.order_by(func.random()).first()


def get_random_words_batch(db: Session, user_id: int, count: int, unlocked_only: bool = False) -> List[models.WordDetail]:
    """批量随机获取单词，优先未学过的，单次查询"""
    unlocked_filter = get_unlocked_group_filters(db, user_id) if unlocked_only else None
    if unlocked_only and unlocked_filter is None:
        return []

    words = db.query(models.WordDetail).outerjoin(
        models.LearningProgress,
        and_(
            models.LearningProgress.word_id == models.WordDetail.id,
            models.LearningProgress.user_id == user_id
        )
    ).filter(
        or_(
            models.LearningProgress.id == None,
            models.LearningProgress.status == 'unlearned'
        )
    )

    if unlocked_filter is not None:
        words = words.filter(unlocked_filter)

    words = words.order_by(func.random()).limit(count).all()

    if len(words) < count:
        existing_ids = {w.id for w in words}
        extra = db.query(models.WordDetail)
        if existing_ids:
            extra = extra.filter(models.WordDetail.id.notin_(existing_ids))
        if unlocked_filter is not None:
            extra = extra.filter(unlocked_filter)
        extra = extra.order_by(func.random()).limit(count - len(words)).all()
        words.extend(extra)

    return words


# ============ 图片相关 ============

def get_images_by_group(db: Session, chapter_no: str, group_id: str) -> List[models.Image]:
    """获取指定分组的所有图片"""
    return db.query(models.Image).filter(
        models.Image.chapterNo == chapter_no,
        models.Image.groupId == group_id
    ).order_by(models.Image.image_number).all()

def get_image(db: Session, chapter_no: str, group_id: str, image_number: int) -> Optional[models.Image]:
    """获取指定图片"""
    return db.query(models.Image).filter(
        models.Image.chapterNo == chapter_no,
        models.Image.groupId == group_id,
        models.Image.image_number == image_number
    ).first()
