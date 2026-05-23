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
    get_all_builtin_avatar_keys,
    is_hardcoded_builtin_avatar,
    load_builtin_avatar_metadata,
)
from .config.settings import BASE_DIR
from .dependencies import has_min_role

AVATAR_UNLOCK_RULES_PATH = BASE_DIR / "data" / "avatar-unlocks.json"
CHAPTER_COMPLETION_UNLOCK = "chapter_completion"


@dataclass(frozen=True)
class AvatarUnlockRule:
    avatar_key: str
    unlock_type: str
    chapter_no: Optional[str] = None
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

    rules.sort(key=lambda rule: (_chapter_sort_key(rule.chapter_no), rule.avatar_key))
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


def _get_rule_map() -> dict[str, AvatarUnlockRule]:
    return {rule.avatar_key: rule for rule in get_chapter_completion_unlock_rules()}


def get_builtin_avatar_access_source(
    db: Session,
    user: models.User,
    avatar_key: str,
    completed_chapters: Optional[set[str]] = None,
    rule_map: Optional[dict[str, AvatarUnlockRule]] = None,
) -> Optional[str]:
    if user.role == "super_admin":
        return "super_admin"

    active_rule_map = rule_map or _get_rule_map()
    rule = active_rule_map.get(avatar_key)
    if rule:
        if rule.min_role and not has_min_role(user, rule.min_role):
            return None
        active_completed_chapters = completed_chapters
        if active_completed_chapters is None:
            active_completed_chapters = get_completed_chapter_numbers(db, user.id)
        return CHAPTER_COMPLETION_UNLOCK if rule.chapter_no in active_completed_chapters else None

    if avatar_key in VIP_ONLY_BUILTIN_AVATAR_KEYS:
        return "vip" if has_min_role(user, "premium_user") else None

    return "public"


def can_user_select_builtin_avatar(db: Session, user: models.User, avatar_key: str) -> bool:
    return bool(get_builtin_avatar_access_source(db, user, avatar_key))


def build_current_user_avatar_catalog(db: Session, user: models.User) -> dict:
    metadata = load_builtin_avatar_metadata()
    avatar_keys = get_all_builtin_avatar_keys()
    chapter_rules = get_chapter_completion_unlock_rules()
    rule_map = {rule.avatar_key: rule for rule in chapter_rules}
    completed_chapters = (
        set()
        if user.role == "super_admin"
        else get_completed_chapter_numbers(db, user.id)
    )

    visible_avatars = []
    for avatar_key in avatar_keys:
        access_source = get_builtin_avatar_access_source(
            db,
            user,
            avatar_key,
            completed_chapters=completed_chapters,
            rule_map=rule_map,
        )
        if not access_source:
            continue

        item = metadata.get(avatar_key) or {}
        visible_avatars.append({
            "key": avatar_key,
            "label": _avatar_label(avatar_key, metadata),
            "variety": str(item.get("variety") or "").strip() or "未分类",
            "vip_only": avatar_key in VIP_ONLY_BUILTIN_AVATAR_KEYS,
            "url": f"{BUILTIN_AVATAR_URL_PREFIX}/{avatar_key}",
            "is_hardcoded": is_hardcoded_builtin_avatar(avatar_key),
            "unlock_source": access_source,
        })

    def avatar_sort_key(item: dict) -> tuple:
        if item["unlock_source"] == CHAPTER_COMPLETION_UNLOCK:
            rule = rule_map.get(item["key"])
            return (0, _chapter_sort_key(rule.chapter_no if rule else None), item["label"])
        if item["vip_only"]:
            return (1, item["label"])
        return (2, item["label"])

    visible_avatars.sort(key=avatar_sort_key)

    next_unlock_condition = None
    if user.role != "super_admin":
        for rule in chapter_rules:
            if rule.min_role and not has_min_role(user, rule.min_role):
                continue
            if rule.chapter_no not in completed_chapters:
                next_unlock_condition = f"完成第 {rule.chapter_no} 章学习后解锁新的章节头像"
                break

    return {
        "avatars": visible_avatars,
        "next_unlock_condition": next_unlock_condition,
    }
