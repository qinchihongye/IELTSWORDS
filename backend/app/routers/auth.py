"""
认证相关API
"""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
import secrets
from ..avatar_storage import (
    delete_uploaded_avatar_file,
    is_vip_only_builtin_avatar,
    save_uploaded_avatar,
    save_builtin_avatar,
    validate_builtin_avatar_key,
)
from .. import schemas, crud, auth
from ..database import get_db
from ..dependencies import get_current_user, has_min_role
from .. import models
from ..rate_limit import auth_rate_limit

router = APIRouter()
password_reset_codes = {}

@router.post("/register", response_model=schemas.User, status_code=status.HTTP_201_CREATED)
async def register(user: schemas.UserCreate, db: Session = Depends(get_db), _rate=Depends(auth_rate_limit)):
    """
    用户注册
    """
    # 检查用户名是否已存在
    db_user = crud.get_user_by_username(db, username=user.username)
    if db_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已被注册"
        )

    # 检查邮箱是否已存在
    db_user = crud.get_user_by_email(db, email=user.email)
    if db_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="邮箱已被注册"
        )

    # 创建用户
    return crud.create_user(db=db, user=user)

@router.post("/login", response_model=schemas.Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
    _rate=Depends(auth_rate_limit),
):
    """
    用户登录
    """
    # 验证用户
    user = crud.authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="账户已被禁用"
        )

    # 更新最后登录时间
    user.last_login = datetime.now(timezone.utc)
    db.commit()

    # 创建访问令牌
    access_token = auth.create_access_token(data={"sub": user.username})

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }

@router.post("/password-reset/verify-email")
async def verify_password_reset_email(
    payload: schemas.PasswordResetEmail,
    db: Session = Depends(get_db),
    _rate=Depends(auth_rate_limit),
):
    """
    验证用于重置密码的邮箱
    """
    user = crud.get_user_by_email(db, email=payload.email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="未找到使用该邮箱注册的账户"
        )

    code = f"{secrets.randbelow(1000000):06d}"
    password_reset_codes[payload.email] = {
        "code": code,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10)
    }

    return {"message": "验证码已生成，请输入验证码继续"}

@router.post("/password-reset")
async def reset_password(
    payload: schemas.PasswordReset,
    db: Session = Depends(get_db),
    _rate=Depends(auth_rate_limit),
):
    """
    根据已验证邮箱重置密码
    """
    reset_record = password_reset_codes.get(payload.email)
    if (
        not reset_record
        or reset_record["code"] != payload.code
        or reset_record["expires_at"] < datetime.now(timezone.utc)
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="验证码错误或已过期"
        )

    user = crud.get_user_by_email(db, email=payload.email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="未找到使用该邮箱注册的账户"
        )

    crud.update_user_password(db, user=user, password=payload.password)
    password_reset_codes.pop(payload.email, None)

    return {"message": "密码已更新，请使用新密码登录"}

@router.get("/me", response_model=schemas.User)
async def get_current_user_info(current_user: models.User = Depends(get_current_user)):
    """
    获取当前登录用户信息
    """
    return current_user

@router.patch("/me", response_model=schemas.User)
async def update_current_user_profile(
    payload: schemas.UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    更新当前用户资料
    """
    existing_username = crud.get_user_by_username(db, username=payload.username)
    if existing_username and existing_username.id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已被注册"
        )

    existing_email = crud.get_user_by_email(db, email=payload.email)
    if existing_email and existing_email.id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="邮箱已被注册"
        )

    return crud.update_user_profile(db, current_user, payload.username, payload.email)


@router.patch("/me/avatar/builtin", response_model=schemas.User)
async def update_current_user_builtin_avatar(
    payload: schemas.UserAvatarBuiltinUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    切换为内置头像
    """
    avatar_key = validate_builtin_avatar_key(payload.avatar_key)
    if is_vip_only_builtin_avatar(avatar_key) and not has_min_role(current_user, "premium_user"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="该头像仅 VIP 用户及以上可使用",
        )

    if current_user.avatar_type == "upload":
        delete_uploaded_avatar_file(current_user.avatar_value)

    return crud.update_user_avatar(db, current_user, "builtin", avatar_key)


@router.post("/me/avatar/upload", response_model=schemas.User)
async def upload_current_user_avatar(
    avatar: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    上传当前用户头像
    """
    if not has_min_role(current_user, "premium_user"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="仅 VIP 用户及以上可上传自定义头像",
        )

    uploaded_avatar_url = await save_uploaded_avatar(current_user.id, avatar)
    if current_user.avatar_type == "upload":
        delete_uploaded_avatar_file(current_user.avatar_value)

    return crud.update_user_avatar(db, current_user, "upload", uploaded_avatar_url)

@router.patch("/me/password")
async def change_current_user_password(
    payload: schemas.PasswordChange,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    当前用户修改密码
    """
    if not auth.verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="当前密码错误"
        )

    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    crud.update_user_password(db, user, payload.new_password)

    return {"message": "密码已更新"}
