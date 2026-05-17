"""
依赖注入模块
用于获取当前用户等
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from . import models, schemas, auth
from .database import get_db

# OAuth2密码流
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

ROLE_LEVELS = {
    "user": 1,
    "premium_user": 2,
    "admin": 3,
    "super_admin": 4,
}

def get_role_level(role: str) -> int:
    """获取角色等级，未知角色按普通用户处理。"""
    return ROLE_LEVELS.get(role, ROLE_LEVELS["user"])

def has_min_role(user: models.User, min_role: str) -> bool:
    """判断用户是否达到指定角色等级。"""
    return get_role_level(user.role) >= get_role_level(min_role)

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> models.User:
    """获取当前登录用户"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无法验证凭据",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # 解码token
    username = auth.decode_access_token(token)
    if username is None:
        raise credentials_exception

    # 查询用户
    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="账户已被禁用"
        )

    return user

def require_min_role(min_role: str):
    """生成指定最低角色要求的依赖。"""
    def dependency(current_user: models.User = Depends(get_current_user)) -> models.User:
        if not has_min_role(current_user, min_role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="没有权限访问"
            )
        return current_user

    return dependency

require_premium_user = require_min_role("premium_user")
require_admin = require_min_role("admin")
require_super_admin = require_min_role("super_admin")
