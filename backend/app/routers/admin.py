"""
管理员相关API
"""

from datetime import datetime, timezone
import csv
import io

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .. import auth, crud, models, schemas
from ..avatar_storage import (
    DEFAULT_BUILTIN_AVATAR_KEY,
    delete_uploaded_avatar_file,
    is_vip_only_builtin_avatar,
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

    user = models.User(
        username=payload.username,
        email=payload.email,
        hashed_password=auth.get_password_hash(payload.password),
        role=payload.role,
        is_active=True,
        updated_at=datetime.now(timezone.utc)
    )
    db.add(user)
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
        user.avatar_value = DEFAULT_BUILTIN_AVATAR_KEY
    elif user.avatar_type == "upload" and not has_min_role(user, "premium_user"):
        user.avatar_type = "builtin"
        user.avatar_value = DEFAULT_BUILTIN_AVATAR_KEY

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
    current_user: models.User = Depends(require_admin)
):
    """
    管理员更新单词内容
    """
    word = crud.get_word_by_id(db, word_id)
    if not word:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="单词不存在"
        )

    return crud.update_word_detail(db, word, payload)


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
