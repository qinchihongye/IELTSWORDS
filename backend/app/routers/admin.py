"""
管理员相关API
"""

from datetime import datetime, timezone
import csv
import io

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .. import auth, crud, models, schemas
from ..avatar_unlocks import (
    CHAPTER_COMPLETION_UNLOCK,
    GROUP_COMPLETION_UNLOCK,
    load_avatar_unlock_rules,
    save_avatar_unlock_rules,
)
from ..avatar_storage import (
    BUILTIN_AVATAR_URL_PREFIX,
    VIP_ONLY_BUILTIN_AVATAR_KEYS,
    delete_builtin_avatar_file,
    delete_uploaded_avatar_file,
    get_all_builtin_avatar_keys,
    get_preferred_builtin_avatar_filename,
    get_role_default_builtin_avatar_key,
    is_hardcoded_builtin_avatar,
    is_vip_only_builtin_avatar,
    load_builtin_avatar_metadata,
    save_builtin_avatar,
)
from ..database import get_db
from ..dependencies import get_role_level, has_min_role, require_admin, require_super_admin

router = APIRouter()


def get_user_or_404(db: Session, user_id: int) -> models.User:
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    return user


def ensure_can_manage_user(operator: models.User, target: models.User):
    """管理员只能管理低于自己等级的用户。"""
    if operator.id == target.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不能对自己的账户执行该操作"
        )

    if get_role_level(operator.role) <= get_role_level(target.role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="不能管理同级或更高级用户"
        )


@router.get("/users", response_model=list[schemas.User])
async def list_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """
    获取用户列表
    """
    return db.query(models.User).order_by(models.User.id.asc()).all()


@router.post("/users", response_model=schemas.User, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: schemas.AdminUserCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_super_admin)
):
    """
    超级管理员创建指定角色用户
    """
    existing_username = db.query(models.User).filter(models.User.username == payload.username).first()
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已被注册"
        )

    existing_email = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="邮箱已被注册"
        )

    user = crud.create_user(db, payload)
    user.role = payload.role
    user.is_active = True
    user.avatar_value = get_role_default_builtin_avatar_key(payload.role)
    user.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}/active", response_model=schemas.User)
async def update_user_active(
    user_id: int,
    payload: schemas.UserActiveUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """
    启用或禁用用户
    """
    user = get_user_or_404(db, user_id)
    ensure_can_manage_user(current_user, user)

    user.is_active = payload.is_active
    user.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}/password", response_model=schemas.User)
async def reset_user_password(
    user_id: int,
    payload: schemas.AdminPasswordReset,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """
    管理员重置用户密码
    """
    user = get_user_or_404(db, user_id)
    ensure_can_manage_user(current_user, user)

    user.hashed_password = auth.get_password_hash(payload.password)
    user.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}/role", response_model=schemas.User)
async def update_user_role(
    user_id: int,
    payload: schemas.UserRoleUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_super_admin)
):
    """
    超级管理员修改用户角色
    """
    user = get_user_or_404(db, user_id)

    if current_user.id == user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不能修改自己的角色"
        )

    uploaded_avatar_value = user.avatar_value if user.avatar_type == "upload" else None
    user.role = payload.role
    if (
        user.avatar_type == "builtin"
        and is_vip_only_builtin_avatar(user.avatar_value)
        and not has_min_role(user, "premium_user")
    ):
        user.avatar_value = get_role_default_builtin_avatar_key(user.role)
    elif user.avatar_type == "upload" and not has_min_role(user, "premium_user"):
        user.avatar_type = "builtin"
        user.avatar_value = get_role_default_builtin_avatar_key(user.role)

    user.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)

    if uploaded_avatar_value and user.avatar_type != "upload":
        delete_uploaded_avatar_file(uploaded_avatar_value)

    return user


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """
    删除用户
    """
    user = get_user_or_404(db, user_id)
    ensure_can_manage_user(current_user, user)
    username = user.username
    crud.delete_user_and_related_data(db, user)

    return {"message": f"用户 {username} 已删除"}


@router.get("/words", response_model=list[schemas.WordDetail])
async def search_admin_words(
    keyword: str | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """
    管理员搜索单词内容
    """
    safe_limit = min(max(limit, 1), 100)
    return crud.search_words(db, keyword=keyword, limit=safe_limit)


@router.patch("/words/{word_id}", response_model=schemas.WordDetail)
async def update_admin_word(
    word_id: int,
    payload: schemas.WordUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_super_admin)
):
    """
    管理员更新单词内容 (仅限超级管理员验证密码后修改)
    """
    # 验证超级管理员密码
    if not payload.password or not auth.verify_password(payload.password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="超级管理员密码验证失败，操作已拒绝"
        )

    word = crud.get_word_by_id(db, word_id)
    if not word:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="单词不存在"
        )

    # 排除密码字段，然后再交给 CRUD 保存
    payload_dict = payload.model_dump(exclude={"password"}, exclude_unset=True)
    update_payload = schemas.WordUpdate(**payload_dict)
    return crud.update_word_detail(db, word, update_payload)


@router.get("/export/users")
async def export_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """
    导出用户基础数据
    """
    users = db.query(models.User).order_by(models.User.id.asc()).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "username", "email", "role", "is_active", "created_at", "last_login"])
    for user in users:
        writer.writerow([
            user.id,
            user.username,
            user.email,
            user.role,
            int(user.is_active),
            user.created_at,
            user.last_login,
        ])

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=users.csv"}
    )


# ============ 内置头像管理（仅超级管理员） ============

def _get_label(filename: str) -> str:
    return filename.rsplit(".", 1)[0]


def _get_avatar_admin_label(filename: str, metadata: dict[str, dict]) -> str:
    item = metadata.get(filename) or {}
    return str(item.get("avatars_name") or "").strip() or _get_label(filename)


def build_available_unlock_groups(db: Session, chapters: list[dict]) -> list[dict]:
    groups: list[dict] = []
    for chapter in chapters:
        chapter_no = str(chapter["chapterNo"])
        chapter_name = str(chapter["chapterName"] or "")
        for group in crud.get_groups_by_chapter(db, chapter_no, user_id=0, unlock_all=True):
            groups.append({
                "chapterNo": chapter_no,
                "chapterName": chapter_name,
                "groupId": str(group["groupId"]),
                "groupTheme": str(group["groupTheme"] or ""),
            })
    return groups


def build_avatar_unlock_rules_response(db: Session) -> dict:
    metadata = load_builtin_avatar_metadata()
    chapters = crud.get_all_chapters(db)
    groups = build_available_unlock_groups(db, chapters)
    chapter_map = {
        str(chapter["chapterNo"]): str(chapter["chapterName"] or "")
        for chapter in chapters
    }
    group_map = {
        (str(group["chapterNo"]), str(group["groupId"])): str(group["groupTheme"] or "")
        for group in groups
    }

    configured_rules = load_avatar_unlock_rules()
    configured_rule_map = {rule.avatar_key: rule for rule in configured_rules}

    rules = [
        {
            "avatar_key": rule.avatar_key,
            "avatar_label": _get_avatar_admin_label(rule.avatar_key, metadata),
            "variety": str((metadata.get(rule.avatar_key) or {}).get("variety") or "").strip() or "未分类",
            "vip_only": rule.avatar_key in VIP_ONLY_BUILTIN_AVATAR_KEYS,
            "unlock_type": rule.unlock_type,
            "chapter_no": str(rule.chapter_no or ""),
            "chapter_name": chapter_map.get(str(rule.chapter_no or "")) or None,
            "group_id": str(rule.group_id or "") or None,
            "group_theme": group_map.get((str(rule.chapter_no or ""), str(rule.group_id or ""))) or None,
            "min_role": rule.min_role or None,
        }
        for rule in configured_rules
    ]

    available_avatars = [
        {
            "key": key,
            "label": _get_avatar_admin_label(key, metadata),
            "variety": str((metadata.get(key) or {}).get("variety") or "").strip() or "未分类",
            "vip_only": key in VIP_ONLY_BUILTIN_AVATAR_KEYS,
            "url": f"{BUILTIN_AVATAR_URL_PREFIX}/{key}",
            "is_hardcoded": is_hardcoded_builtin_avatar(key),
            "unlock_source": configured_rule_map.get(key).unlock_type if key in configured_rule_map else None,
        }
        for key in get_all_builtin_avatar_keys()
    ]

    return {
        "rules": rules,
        "available_avatars": available_avatars,
        "available_chapters": chapters,
        "available_groups": groups,
    }


@router.get("/avatar-unlock-rules", response_model=schemas.AdminAvatarUnlockRulesResponse)
async def get_avatar_unlock_rules(
    db: Session = Depends(get_db),
    current_user=Depends(require_super_admin),
):
    return build_avatar_unlock_rules_response(db)


@router.put("/avatar-unlock-rules", response_model=schemas.AdminAvatarUnlockRulesResponse)
async def update_avatar_unlock_rules(
    payload: schemas.AdminAvatarUnlockRulesUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_super_admin),
):
    available_avatar_keys = set(get_all_builtin_avatar_keys())
    chapters = crud.get_all_chapters(db)
    chapter_map = {
        str(chapter["chapterNo"]): str(chapter["chapterName"] or "")
        for chapter in chapters
    }
    available_groups = build_available_unlock_groups(db, chapters)
    group_map = {
        (str(group["chapterNo"]), str(group["groupId"])): str(group["groupTheme"] or "")
        for group in available_groups
    }

    seen_avatar_keys: set[str] = set()
    normalized_rules: list[dict] = []

    for item in payload.rules:
        avatar_key = str(item.avatar_key or "").strip()
        chapter_no = str(item.chapter_no or "").strip()
        group_id = str(item.group_id or "").strip()

        if not avatar_key or avatar_key not in available_avatar_keys:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"头像 {avatar_key or '[空]'} 不存在",
            )

        if avatar_key in seen_avatar_keys:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"头像 {avatar_key} 重复配置了解锁规则",
            )
        seen_avatar_keys.add(avatar_key)

        if chapter_no not in chapter_map:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"章节 {chapter_no or '[空]'} 不存在",
            )

        if item.unlock_type == CHAPTER_COMPLETION_UNLOCK:
            normalized_rule = {
                "avatarKey": avatar_key,
                "unlockType": CHAPTER_COMPLETION_UNLOCK,
                "chapterNo": chapter_no,
            }
        elif item.unlock_type == GROUP_COMPLETION_UNLOCK:
            if not group_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"头像 {avatar_key} 缺少 group 配置",
                )
            if (chapter_no, group_id) not in group_map:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"第 {chapter_no} 章的 {group_id} 不存在",
                )
            normalized_rule = {
                "avatarKey": avatar_key,
                "unlockType": GROUP_COMPLETION_UNLOCK,
                "chapterNo": chapter_no,
                "groupId": group_id,
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="不支持的头像解锁类型",
            )

        if item.min_role and item.min_role != "user":
            normalized_rule["minRole"] = item.min_role
        normalized_rules.append(normalized_rule)

    save_avatar_unlock_rules(normalized_rules)
    return build_avatar_unlock_rules_response(db)


@router.get("/builtin-avatars")
async def list_builtin_avatars(
    current_user=Depends(require_super_admin),
):
    keys = get_all_builtin_avatar_keys()
    metadata = load_builtin_avatar_metadata()
    return [
        {
            "key": k,
            "label": _get_label(k),
            "variety": str((metadata.get(k) or {}).get("variety") or "").strip() or "未分类",
            "source_mtime": (metadata.get(k) or {}).get("source_mtime"),
            "vip_only": k in VIP_ONLY_BUILTIN_AVATAR_KEYS,
            "url": f"{BUILTIN_AVATAR_URL_PREFIX}/{get_preferred_builtin_avatar_filename(k)}",
            "is_hardcoded": is_hardcoded_builtin_avatar(k),
        }
        for k in keys
    ]


from fastapi import Form

@router.get("/preset-avatars")
async def list_preset_avatar_files(current_user=Depends(require_super_admin)):
    from ..config.settings import BASE_DIR
    import os
    preset_dir = BASE_DIR / "预设头像"
    if not preset_dir.exists():
        return []

    files_list = []
    for root, _, files in os.walk(preset_dir):
        for file in files:
            file_lower = file.lower()
            if file_lower.endswith(('.png', '.jpg', '.jpeg')):
                rel_dir = os.path.relpath(root, preset_dir)
                variety = rel_dir if rel_dir != "." else "默认分类"
                avatars_name = file.rsplit('.', 1)[0]
                
                # We need the relative path to build the URL
                preferred_file = f"{avatars_name}.webp"
                preferred_path = os.path.join(root, preferred_file)
                display_file = preferred_file if os.path.exists(preferred_path) else file
                url_path = f"{rel_dir}/{display_file}" if rel_dir != "." else display_file
                source_mtime = os.path.getmtime(os.path.join(root, file))
                files_list.append({
                    "url": f"/preset-avatars/{url_path}",
                    "variety": variety,
                    "avatars_name": avatars_name,
                    "source_mtime": source_mtime
                })
    return files_list

@router.post("/builtin-avatars/upload")
async def upload_builtin_avatar(
    file: UploadFile = File(...),
    variety: str | None = Form(None),
    avatars_name: str | None = Form(None),
    source_mtime: float | None = Form(None),
    current_user=Depends(require_super_admin),
):
    url = await save_builtin_avatar(file, variety=variety, avatars_name=avatars_name, source_mtime=source_mtime)
    return {"url": url, "filename": file.filename}


@router.delete("/builtin-avatars/{filename}")
async def remove_builtin_avatar(
    filename: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_super_admin),
):
    delete_builtin_avatar_file(filename)

    affected_users = db.query(models.User).filter(
        models.User.avatar_type == "builtin",
        models.User.avatar_value == filename,
    ).all()
    for user in affected_users:
        user.avatar_value = get_role_default_builtin_avatar_key(user.role)
        user.updated_at = datetime.now(timezone.utc)

    if affected_users:
        db.commit()

    return {"message": f"内置头像 {filename} 已删除"}
