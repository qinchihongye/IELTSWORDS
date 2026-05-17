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
import uuid

from .. import models, schemas, auth
from ..avatar_storage import DEFAULT_BUILTIN_AVATAR_KEY, delete_uploaded_avatar_file


from sqlalchemy import desc

# ============ 用户相关 ============

def get_user_by_username(db: Session, username: str) -> Optional[models.User]:
    """根据用户名获取用户"""
    return db.query(models.User).filter(models.User.username == username).first()

def get_user_by_email(db: Session, email: str) -> Optional[models.User]:
    """根据邮箱获取用户"""
    return db.query(models.User).filter(models.User.email == email).first()

def _generate_uid(db: Session) -> str:
    """生成唯一用户ID: U + uuid4最后一段hex"""
    while True:
        candidate = 'U' + str(uuid.uuid4()).split('-')[-1]
        if not db.query(models.User).filter(models.User.uid == candidate).first():
            return candidate


def create_user(db: Session, user: schemas.UserCreate) -> models.User:
    """创建用户"""
    hashed_password = auth.get_password_hash(user.password)
    db_user = models.User(
        uid=_generate_uid(db),
        username=user.username,
        email=user.email,
        hashed_password=hashed_password,
        avatar_type='builtin',
        avatar_value=DEFAULT_BUILTIN_AVATAR_KEY,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def authenticate_user(db: Session, username: str, password: str) -> Optional[models.User]:
    """验证用户"""
    user = get_user_by_username(db, username)
    if not user:
        return None
    if not auth.verify_password(password, user.hashed_password):
        return None
    return user

def update_user_password(db: Session, user: models.User, password: str) -> models.User:
    """更新用户密码"""
    user.hashed_password = auth.get_password_hash(password)
    db.commit()
    db.refresh(user)
    return user

def update_user_profile(db: Session, user: models.User, username: str, email: str) -> models.User:
    """更新用户资料"""
    user.username = username
    user.email = email
    user.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    return user


def update_user_avatar(
    db: Session,
    user: models.User,
    avatar_type: str,
    avatar_value: str
) -> models.User:
    """更新用户头像"""
    user.avatar_type = avatar_type
    user.avatar_value = avatar_value
    user.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    return user


def delete_user_and_related_data(db: Session, user: models.User) -> None:
    """删除用户及其关联学习数据、自定义词书、测试记录等。"""
    user_id = user.id
    uploaded_avatar_value = user.avatar_value if user.avatar_type == "upload" else None

    try:
        quiz_session_ids = [
            session_id
            for session_id, in db.query(models.QuizSession.id).filter(models.QuizSession.user_id == user_id).all()
        ]
        if quiz_session_ids:
            db.query(models.QuizAnswer).filter(
                models.QuizAnswer.session_id.in_(quiz_session_ids)
            ).delete(synchronize_session=False)

        custom_book_ids = [
            book_id
            for book_id, in db.query(models.CustomBook.id).filter(models.CustomBook.user_id == user_id).all()
        ]
        custom_book_word_ids: list[int] = []
        if custom_book_ids:
            custom_book_word_ids = [
                word_id
                for word_id, in db.query(models.CustomBookWord.id).filter(
                    models.CustomBookWord.book_id.in_(custom_book_ids)
                ).all()
            ]

        if custom_book_word_ids:
            db.query(models.CustomBookProgress).filter(
                models.CustomBookProgress.book_word_id.in_(custom_book_word_ids)
            ).delete(synchronize_session=False)

        db.query(models.CustomBookProgress).filter(
            models.CustomBookProgress.user_id == user_id
        ).delete(synchronize_session=False)

        if custom_book_ids:
            db.query(models.CustomBookWord).filter(
                models.CustomBookWord.book_id.in_(custom_book_ids)
            ).delete(synchronize_session=False)
            db.query(models.CustomBookGroup).filter(
                models.CustomBookGroup.book_id.in_(custom_book_ids)
            ).delete(synchronize_session=False)
            db.query(models.CustomBook).filter(
                models.CustomBook.id.in_(custom_book_ids)
            ).delete(synchronize_session=False)

        db.query(models.LearningProgress).filter(
            models.LearningProgress.user_id == user_id
        ).delete(synchronize_session=False)
        db.query(models.CheckInStreak).filter(
            models.CheckInStreak.user_id == user_id
        ).delete(synchronize_session=False)
        db.query(models.DailyCheckIn).filter(
            models.DailyCheckIn.user_id == user_id
        ).delete(synchronize_session=False)

        if quiz_session_ids:
            db.query(models.QuizSession).filter(
                models.QuizSession.id.in_(quiz_session_ids)
            ).delete(synchronize_session=False)

        db.delete(user)
        db.commit()
    except Exception:
        db.rollback()
        raise

    if uploaded_avatar_value:
        delete_uploaded_avatar_file(uploaded_avatar_value)
