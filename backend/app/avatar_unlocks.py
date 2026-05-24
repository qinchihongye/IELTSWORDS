"""
内置头像解锁规则与可见性计算
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from sqlalchemy import and_, case, func
from sqlalchemy.orm import Session

from . import models
from .avatar_storage import (
    BUILTIN_AVATAR_URL_PREFIX,
    VIP_ONLY_BUILTIN_AVATAR_KEYS,
    PUBLIC_DEFAULT_BUILTIN_AVATAR_KEYS,
    get_all_builtin_avatar_keys,
    is_hardcoded_builtin_avatar,
    load_builtin_avatar_metadata,
)
from .config.settings import BASE_DIR
from .dependencies import has_min_role

AVATAR_UNLOCK_RULES_PATH = BASE_DIR / "data" / "avatar-unlocks.json"
CHAPTER_COMPLETION_UNLOCK = "chapter_completion"
WORDS_MASTERED_UNLOCK = "words_mastered"

_total_words_cache = None

def get_total_words(db: Session) -> int:
    global _total_words_cache
    if _total_words_cache is None:
        _total_words_cache = db.query(models.WordDetail).count()
    return _total_words_cache


@dataclass(frozen=True)
class AvatarUnlockRule:
    avatar_key: str
    unlock_type: str
    chapter_no: Optional[str] = None
    target_value: Optional[int] = None
    min_role: Optional[str] = None


def _avatar_label(filename: str, metadata: dict[str, dict]) -> str:
    item = metadata.get(filename) or {}
    label = str(item.get("avatars_name") or "").strip()
    return label or filename.rsplit(".", 1)[0]


def _chapter_sort_key(chapter_no: str | None) -> tuple[int, str]:
    value = str(chapter_no or "").strip()
    if value.isdigit():
        return (0, f"{int(value):08d}")
    return (1, value)


def load_avatar_unlock_rules() -> list[AvatarUnlockRule]:
    if not AVATAR_UNLOCK_RULES_PATH.exists():
        return []

    try:
        payload = json.loads(AVATAR_UNLOCK_RULES_PATH.read_text(encoding="utf-8"))
    except Exception:
        return []

    raw_rules = payload.get("rules") if isinstance(payload, dict) else None
    if not isinstance(raw_rules, list):
        return []

    available_keys = set(get_all_builtin_avatar_keys())
    rules: list[AvatarUnlockRule] = []

    for item in raw_rules:
        if not isinstance(item, dict):
            continue

        avatar_key = str(item.get("avatarKey") or "").strip()
        unlock_type = str(item.get("unlockType") or "").strip()
        chapter_no = str(item.get("chapterNo") or "").strip() or None
        min_role = str(item.get("minRole") or "").strip() or None

        if avatar_key not in available_keys:
            continue

        if unlock_type == CHAPTER_COMPLETION_UNLOCK and chapter_no:
            rules.append(
                AvatarUnlockRule(
                    avatar_key=avatar_key,
                    unlock_type=unlock_type,
                    chapter_no=chapter_no,
                    min_role=min_role,
                )
            )

    return rules


def get_all_active_unlock_rules(db: Session = None) -> list[AvatarUnlockRule]:
    rules = load_avatar_unlock_rules()
    
    if not db:
        return rules
        
    all_keys = get_all_builtin_avatar_keys()
    static_locked_keys = {r.avatar_key for r in rules}
    vip_locked_keys = set(VIP_ONLY_BUILTIN_AVATAR_KEYS)
    public_default_keys = set(PUBLIC_DEFAULT_BUILTIN_AVATAR_KEYS)
    
    locked_keys = static_locked_keys.union(vip_locked_keys).union(public_default_keys)
    
    # Dynamic pool (avatars that are not VIP, not public defaults, and not in JSON)
    dynamic_keys = [k for k in all_keys if k not in locked_keys]
    if dynamic_keys:
        dynamic_keys.sort() # Predictable sort
        
        total_words = get_total_words(db)
        if total_words > 0:
            step = total_words / len(dynamic_keys)
            for i, key in enumerate(dynamic_keys):
                target_value = max(1, int(round((i + 1) * step)))
                rules.append(
                    AvatarUnlockRule(
                        avatar_key=key,
                        unlock_type=WORDS_MASTERED_UNLOCK,
                        target_value=target_value,
                    )
                )
                
    def sort_key(rule):
        if rule.unlock_type == CHAPTER_COMPLETION_UNLOCK:
            return (0, _chapter_sort_key(rule.chapter_no), rule.avatar_key)
        if rule.unlock_type == WORDS_MASTERED_UNLOCK:
            return (1, rule.target_value or 0, rule.avatar_key)
        return (2, 0, rule.avatar_key)

    rules.sort(key=sort_key)
    return rules


def get_chapter_completion_unlock_rules() -> list[AvatarUnlockRule]:
    return [
        rule for rule in load_avatar_unlock_rules()
        if rule.unlock_type == CHAPTER_COMPLETION_UNLOCK and rule.chapter_no
    ]


def save_avatar_unlock_rules(raw_rules: list[dict]) -> None:
    available_keys = set(get_all_builtin_avatar_keys())
    normalized_rules: list[dict] = []

    for item in raw_rules:
        if not isinstance(item, dict):
            continue

        avatar_key = str(item.get("avatarKey") or "").strip()
        unlock_type = str(item.get("unlockType") or "").strip()
        chapter_no = str(item.get("chapterNo") or "").strip()
        min_role = str(item.get("minRole") or "").strip()

        if not avatar_key or avatar_key not in available_keys:
            continue
        if unlock_type != CHAPTER_COMPLETION_UNLOCK or not chapter_no:
            continue

        payload = {
            "avatarKey": avatar_key,
            "unlockType": CHAPTER_COMPLETION_UNLOCK,
            "chapterNo": chapter_no,
        }
        if min_role:
            payload["minRole"] = min_role
        normalized_rules.append(payload)

    normalized_rules.sort(
        key=lambda item: (
            _chapter_sort_key(item.get("chapterNo")),
            str(item.get("avatarKey") or ""),
        )
    )

    AVATAR_UNLOCK_RULES_PATH.write_text(
        json.dumps({"rules": normalized_rules}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def get_completed_chapter_numbers(db: Session, user_id: int) -> set[str]:
    rows = db.query(
        models.WordDetail.chapterNo,
        func.count(models.WordDetail.id).label("total_words"),
        func.sum(
            case(
                (models.LearningProgress.status.in_(["learning", "mastered"]), 1),
                else_=0,
            )
        ).label("learned_words"),
    ).outerjoin(
        models.LearningProgress,
        and_(
            models.LearningProgress.word_id == models.WordDetail.id,
            models.LearningProgress.user_id == user_id,
        ),
    ).group_by(
        models.WordDetail.chapterNo,
    ).all()

    completed: set[str] = set()
    for row in rows:
        total_words = int(row.total_words or 0)
        learned_words = int(row.learned_words or 0)
        if total_words > 0 and learned_words >= total_words:
            completed.add(str(row.chapterNo))

    return completed


def get_user_unlock_stats(db: Session, user_id: int) -> dict:
    words_mastered = db.query(func.count(models.LearningProgress.id)).filter(
        models.LearningProgress.user_id == user_id,
        models.LearningProgress.status.in_(["learning", "mastered"])
    ).scalar() or 0

    return {
        WORDS_MASTERED_UNLOCK: words_mastered,
    }


def get_builtin_avatar_access_source(
    db: Session,
    user: models.User,
    avatar_key: str,
    completed_chapters: Optional[set[str]] = None,
    user_stats: Optional[dict] = None,
    rule_map: Optional[dict[str, AvatarUnlockRule]] = None,
) -> Optional[str]:
    if user.role == "super_admin":
        return "super_admin"

    # Fallback to empty map if None, but we should always have it now.
    active_rule_map = rule_map or {}
    rule = active_rule_map.get(avatar_key)
    
    if rule:
        if rule.min_role and not has_min_role(user, rule.min_role):
            return None
            
        if rule.unlock_type == CHAPTER_COMPLETION_UNLOCK:
            active_completed_chapters = completed_chapters
            if active_completed_chapters is None:
                active_completed_chapters = get_completed_chapter_numbers(db, user.id)
            return rule.unlock_type if rule.chapter_no in active_completed_chapters else None
            
        if rule.unlock_type == WORDS_MASTERED_UNLOCK:
            active_stats = user_stats
            if active_stats is None:
                active_stats = get_user_unlock_stats(db, user.id)
            if active_stats.get(rule.unlock_type, 0) >= (rule.target_value or 0):
                return rule.unlock_type
            return None

    if avatar_key in VIP_ONLY_BUILTIN_AVATAR_KEYS:
        return "vip" if has_min_role(user, "premium_user") else None

    # Note: Because of dynamic assignment, there will likely be no "public" avatars 
    # except super_admin or if total_words=0
    return "public"


def can_user_select_builtin_avatar(db: Session, user: models.User, avatar_key: str) -> bool:
    # Build active rules including dynamic ones
    all_rules = get_all_active_unlock_rules(db)
    rule_map = {rule.avatar_key: rule for rule in all_rules}
    return bool(get_builtin_avatar_access_source(db, user, avatar_key, rule_map=rule_map))


def build_current_user_avatar_catalog(db: Session, user: models.User) -> dict:
    metadata = load_builtin_avatar_metadata()
    avatar_keys = get_all_builtin_avatar_keys()
    
    all_rules = get_all_active_unlock_rules(db)
    rule_map = {rule.avatar_key: rule for rule in all_rules}
    
    completed_chapters = set()
    user_stats = {}
    if user.role != "super_admin":
        completed_chapters = get_completed_chapter_numbers(db, user.id)
        user_stats = get_user_unlock_stats(db, user.id)

    visible_avatars = []
    unlocked_normal_count = 0
    total_normal_count = 0
    is_vip_or_above = has_min_role(user, "premium_user")

    for avatar_key in avatar_keys:
        # Determine if it's a normal/stage-unlocked avatar
        is_vip = avatar_key in VIP_ONLY_BUILTIN_AVATAR_KEYS
        rule = rule_map.get(avatar_key)
        is_chapter = rule and rule.unlock_type == CHAPTER_COMPLETION_UNLOCK
        is_normal = not is_vip and not is_chapter

        access_source = get_builtin_avatar_access_source(
            db,
            user,
            avatar_key,
            completed_chapters=completed_chapters,
            user_stats=user_stats,
            rule_map=rule_map,
        )

        if is_normal:
            total_normal_count += 1
            if access_source:
                unlocked_normal_count += 1

        # VIP and above users see all avatars (even if locked)
        should_show = bool(access_source) or is_vip_or_above

        if not should_show:
            continue

        is_locked = not bool(access_source)
        item = metadata.get(avatar_key) or {}
        visible_avatars.append({
            "key": avatar_key,
            "label": _avatar_label(avatar_key, metadata),
            "variety": str(item.get("variety") or "").strip() or "未分类",
            "vip_only": is_vip,
            "url": f"{BUILTIN_AVATAR_URL_PREFIX}/{avatar_key}",
            "is_hardcoded": is_hardcoded_builtin_avatar(avatar_key),
            "unlock_source": "chapter_completion" if is_chapter else ("vip" if is_vip else "words_mastered"),
            "is_locked": is_locked,
        })

    def avatar_sort_key(item: dict) -> tuple:
        rule = rule_map.get(item["key"])
        if item["unlock_source"] == CHAPTER_COMPLETION_UNLOCK:
            return (0, _chapter_sort_key(rule.chapter_no if rule else None), item["label"])
        if item["unlock_source"] == WORDS_MASTERED_UNLOCK:
            return (1, rule.target_value if rule else 0, item["label"])
        if item["vip_only"]:
            return (2, 0, item["label"])
        return (3, 0, item["label"])

    visible_avatars.sort(key=avatar_sort_key)

    next_unlock_condition = None
    if user.role != "super_admin":
        for rule in all_rules:
            if rule.min_role and not has_min_role(user, rule.min_role):
                continue
            if rule.unlock_type == CHAPTER_COMPLETION_UNLOCK and rule.chapter_no not in completed_chapters:
                next_unlock_condition = f"完成第 {rule.chapter_no} 章学习后解锁精美头像"
                break
            if rule.unlock_type == WORDS_MASTERED_UNLOCK:
                if user_stats.get(rule.unlock_type, 0) < (rule.target_value or 0):
                    next_unlock_condition = f"累计掌握 {rule.target_value} 词后解锁精美头像"
                    break

    return {
        "avatars": visible_avatars,
        "next_unlock_condition": next_unlock_condition,
        "unlocked_normal_count": unlocked_normal_count,
        "total_normal_count": total_normal_count,
    }
