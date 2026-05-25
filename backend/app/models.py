"""
SQLAlchemy模型定义
"""

from sqlalchemy import Column, Integer, String, LargeBinary, DateTime, ForeignKey, CheckConstraint, Text, Boolean, Index, UniqueConstraint, Float
from sqlalchemy.sql import func
from .database import Base
from .avatar_storage import DEFAULT_BUILTIN_AVATAR_KEY

class User(Base):
    """用户表"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    uid = Column(String, unique=True, nullable=True, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False, default="user")
    is_active = Column(Boolean, nullable=False, default=True)
    avatar_type = Column(String, nullable=False, default="builtin")
    avatar_value = Column(String, nullable=False, default=DEFAULT_BUILTIN_AVATAR_KEY)
    ai_base_url = Column(String, nullable=True)
    ai_api_key_encrypted = Column(Text, nullable=True)
    ai_model = Column(String, nullable=True)
    ai_model_display_name = Column(String, nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    last_login = Column(DateTime)

    @property
    def avatar_url(self):
        from .avatar_storage import get_user_avatar_url

        return get_user_avatar_url(self.avatar_type, self.avatar_value)

class Image(Base):
    """图片表"""
    __tablename__ = "images"

    id = Column(Integer, primary_key=True)
    chapterNo = Column(String, index=True)
    chapterName = Column(String)
    groupId = Column(String, index=True)
    groupTheme = Column(String)
    image_number = Column("配图number", Integer)
    image_data = Column(LargeBinary)
    created_at = Column(DateTime)

class Word(Base):
    """单词表"""
    __tablename__ = "words"

    id = Column(Integer, primary_key=True)
    word = Column(String, index=True)
    chapterNo = Column(String, index=True)
    chapterName = Column(String)
    groupId = Column(String, index=True)
    groupTheme = Column(String)
    wordNo = Column(String)
    explanation = Column(String)
    created_at = Column(DateTime)

class WordDetail(Base):
    """单词详情表"""
    __tablename__ = "word_details"

    id = Column(Integer, primary_key=True)
    word = Column(String, index=True)
    chapterNo = Column(String, index=True)
    chapterName = Column(String)
    groupId = Column(String, index=True)
    groupTheme = Column(String)
    wordNo = Column(String)
    explanation = Column(String)
    candidateWords = Column(String)
    json = Column(Text)
    roots_affixes = Column(String)
    derivatives = Column(String)
    exampleSentence = Column(Text)
    sentenceMeaning = Column(String)
    group = Column(String)
    photo_prompt = Column(Text)
    new_prompt = Column(Text)
    group_words = Column(Text)
    word_note = Column("单词备注", String)
    phonetics_uk = Column("phonetics_uk", String)
    phonetics_us = Column("phonetics_us", String)
    created_at = Column(DateTime)

class LearningProgress(Base):
    """学习进度表"""
    __tablename__ = "learning_progress"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    word_id = Column(Integer, ForeignKey("word_details.id"), nullable=False)
    status = Column(String, nullable=False)  # 'unlearned', 'learning', 'mastered'
    last_reviewed = Column(DateTime)
    review_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # 新增字段 - 用于复习模式和错题本
    next_review_date = Column(DateTime, nullable=True)  # 下次复习日期
    difficulty_level = Column(Integer, default=3)  # 难度等级 1-5 (1=简单, 3=中等, 5=困难)
    is_mistake_marked = Column(Boolean, default=False)  # 是否标记为错题

    # SM-2 算法核心字段
    easiness_factor = Column(Float, default=2.5, nullable=False)
    interval = Column(Integer, default=0, nullable=False)
    repetitions = Column(Integer, default=0, nullable=False)

    __table_args__ = (
        CheckConstraint("status IN ('unlearned', 'learning', 'mastered')", name='check_status'),
        Index('idx_user_word', 'user_id', 'word_id'),
        Index('idx_user_status', 'user_id', 'status'),
    )

class CheckInStreak(Base):
    """打卡连续记录表"""
    __tablename__ = "check_in_streaks"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)
    current_streak = Column(Integer, default=0)  # 当前连续打卡天数
    longest_streak = Column(Integer, default=0)  # 最长连续打卡天数
    last_check_in_date = Column(DateTime, nullable=True)  # 最后打卡日期
    total_check_ins = Column(Integer, default=0)  # 总打卡次数
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

class DailyCheckIn(Base):
    """每日打卡记录表"""
    __tablename__ = "daily_check_ins"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    check_in_date = Column(DateTime, nullable=False)  # 打卡日期
    words_learned = Column(Integer, default=0)  # 当天学习的单词数
    words_reviewed = Column(Integer, default=0)  # 当天复习的单词数
    quiz_score = Column(Integer, nullable=True)  # 当天测试得分
    created_at = Column(DateTime, default=func.now())

    __table_args__ = (
        Index('idx_user_date', 'user_id', 'check_in_date'),
    )

class QuizSession(Base):
    """测试会话表"""
    __tablename__ = "quiz_sessions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    quiz_type = Column(String, nullable=False)  # 'multiple_choice', 'spelling', 'listening'
    total_questions = Column(Integer, default=0)  # 总题数
    correct_answers = Column(Integer, default=0)  # 正确答案数
    score = Column(Integer, default=0)  # 得分（百分比）
    question_payload = Column(Text, nullable=True)  # 固定本次会话的题目集合
    completed_at = Column(DateTime, nullable=True)  # 完成时间
    created_at = Column(DateTime, default=func.now())

class QuizAnswer(Base):
    """测试答案记录表"""
    __tablename__ = "quiz_answers"

    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("quiz_sessions.id"), nullable=False, index=True)
    word_id = Column(Integer, ForeignKey("word_details.id"), nullable=False)
    user_answer = Column(String, nullable=True)  # 用户的答案
    is_correct = Column(Boolean, default=False)  # 是否正确
    created_at = Column(DateTime, default=func.now())


class CustomBook(Base):
    """自定义词书"""
    __tablename__ = "custom_books"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    source_filename = Column(String, nullable=True)
    source_format = Column(String, nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


class CustomBookGroup(Base):
    """自定义词书分组"""
    __tablename__ = "custom_book_groups"

    id = Column(Integer, primary_key=True)
    book_id = Column(Integer, ForeignKey("custom_books.id"), nullable=False, index=True)
    group_key = Column(String, nullable=False)
    group_name = Column(String, nullable=False)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=func.now())

    __table_args__ = (
        UniqueConstraint("book_id", "group_key", name="uq_custom_book_group_key"),
    )


class CustomBookWord(Base):
    """自定义词书单词"""
    __tablename__ = "custom_book_words"

    id = Column(Integer, primary_key=True)
    book_id = Column(Integer, ForeignKey("custom_books.id"), nullable=False, index=True)
    group_id = Column(Integer, ForeignKey("custom_book_groups.id"), nullable=False, index=True)
    word = Column(String, nullable=False, index=True)
    explanation = Column(String, nullable=False)
    wordNo = Column(String, nullable=True)
    candidateWords = Column(String, nullable=True)
    roots_affixes = Column(String, nullable=True)
    derivatives = Column(String, nullable=True)
    exampleSentence = Column(Text, nullable=True)
    sentenceMeaning = Column(String, nullable=True)
    word_note = Column(String, nullable=True)
    phonetics_uk = Column(String, nullable=True)
    phonetics_us = Column(String, nullable=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=func.now())


class CustomBookProgress(Base):
    """自定义词书学习进度"""
    __tablename__ = "custom_book_progress"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    book_word_id = Column(Integer, ForeignKey("custom_book_words.id"), nullable=False, index=True)
    status = Column(String, nullable=False)
    last_reviewed = Column(DateTime)
    review_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # 新增字段 - 用于复习模式
    next_review_date = Column(DateTime, nullable=True)  # 下次复习日期
    easiness_factor = Column(Float, default=2.5, nullable=False)
    interval = Column(Integer, default=0, nullable=False)
    repetitions = Column(Integer, default=0, nullable=False)

    __table_args__ = (
        CheckConstraint("status IN ('unlearned', 'learning', 'mastered')", name="check_custom_book_status"),
        UniqueConstraint("user_id", "book_word_id", name="uq_custom_book_progress_user_word"),
    )
