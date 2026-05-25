"""
Pydantic schemas定义
用于请求和响应的数据验证
"""

from pydantic import BaseModel, EmailStr, field_validator, ConfigDict, Field
from typing import Any, Optional, List, Literal
from datetime import datetime
from .avatar_storage import DEFAULT_BUILTIN_AVATAR_KEY

# ============ 用户相关 ============

UserRole = Literal['user', 'premium_user', 'admin', 'super_admin']
AvatarType = Literal['builtin', 'upload']
AvatarUnlockType = Literal['chapter_completion', 'group_completion']

class UserBase(BaseModel):
    username: str
    email: EmailStr

class UserCreate(UserBase):
    password: str

    @field_validator('password')
    @classmethod
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('密码长度至少为8位')
        return v

class UserLogin(BaseModel):
    username: str
    password: str

class UserProfileUpdate(BaseModel):
    username: str
    email: EmailStr


class UserAvatarBuiltinUpdate(BaseModel):
    avatar_key: str

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

    @field_validator('new_password')
    @classmethod
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('密码长度至少为8位')
        return v

class PasswordResetEmail(BaseModel):
    email: EmailStr

class PasswordReset(BaseModel):
    email: EmailStr
    code: str
    password: str

    @field_validator('password')
    @classmethod
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('密码长度至少为8位')
        return v

class User(UserBase):
    id: int
    uid: Optional[str] = None
    role: UserRole = 'user'
    is_active: bool = True
    avatar_type: AvatarType = 'builtin'
    avatar_value: str = DEFAULT_BUILTIN_AVATAR_KEY
    avatar_url: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True


class BuiltinAvatarOption(BaseModel):
    key: str
    label: str
    variety: str
    vip_only: bool = False
    url: str
    is_hardcoded: bool = False
    unlock_source: Optional[str] = None
    is_locked: bool = False


class CurrentUserAvatarCatalog(BaseModel):
    avatars: List[BuiltinAvatarOption]
    next_unlock_condition: Optional[str] = None
    unlocked_normal_count: Optional[int] = None
    total_normal_count: Optional[int] = None


class AvatarUnlockNoticeItem(BaseModel):
    key: str
    label: str
    variety: str
    vip_only: bool = False
    url: str
    unlock_source: Optional[str] = None

class UserRoleUpdate(BaseModel):
    role: UserRole

class UserActiveUpdate(BaseModel):
    is_active: bool

class AdminPasswordReset(BaseModel):
    password: str

    @field_validator('password')
    @classmethod
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('密码长度至少为8位')
        return v

class AdminUserCreate(UserCreate):
    role: UserRole = 'user'

class Token(BaseModel):
    access_token: str
    token_type: str
    user: User

class TokenData(BaseModel):
    username: Optional[str] = None

# ============ 单词相关 ============

class WordBase(BaseModel):
    word: str
    chapterNo: str
    chapterName: str
    groupId: str
    groupTheme: str
    explanation: str

class WordSimple(WordBase):
    id: int
    wordNo: str

    class Config:
        from_attributes = True

class WordDetail(WordBase):
    id: int
    wordNo: str
    candidateWords: Optional[str] = None
    roots_affixes: Optional[str] = None
    derivatives: Optional[str] = None

    exampleSentence: Optional[str] = None
    sentenceMeaning: Optional[str] = None
    word_note: Optional[str] = None
    phonetics_uk: Optional[str] = None
    phonetics_us: Optional[str] = None

    class Config:
        from_attributes = True

class WordUpdate(BaseModel):
    explanation: Optional[str] = None
    exampleSentence: Optional[str] = None
    sentenceMeaning: Optional[str] = None
    word_note: Optional[str] = None
    phonetics_uk: Optional[str] = None
    phonetics_us: Optional[str] = None
    password: Optional[str] = None

# ============ 章节和分组相关 ============

class ChapterInfo(BaseModel):
    chapterNo: str
    chapterName: str
    wordCount: int
    groupCount: int

class GroupInfo(BaseModel):
    groupId: str
    groupTheme: str
    chapterNo: str
    chapterName: str
    wordCount: int
    imageCount: int
    learnedCount: int = 0
    isCompleted: bool = False
    isUnlocked: bool = True


class AdminAvatarUnlockRuleItem(BaseModel):
    avatar_key: str
    avatar_label: str
    variety: str
    vip_only: bool = False
    unlock_type: AvatarUnlockType = 'chapter_completion'
    chapter_no: str
    chapter_name: Optional[str] = None
    group_id: Optional[str] = None
    group_theme: Optional[str] = None
    min_role: Optional[UserRole] = None


class AdminAvatarUnlockRuleUpdateItem(BaseModel):
    avatar_key: str
    unlock_type: AvatarUnlockType = 'chapter_completion'
    chapter_no: str
    group_id: Optional[str] = None
    min_role: Optional[UserRole] = None


class AdminAvatarUnlockRulesUpdate(BaseModel):
    rules: List[AdminAvatarUnlockRuleUpdateItem]


class AdminAvatarUnlockAvailableGroup(BaseModel):
    chapterNo: str
    chapterName: str
    groupId: str
    groupTheme: str


class AdminAvatarUnlockRulesResponse(BaseModel):
    rules: List[AdminAvatarUnlockRuleItem]
    available_avatars: List[BuiltinAvatarOption]
    available_chapters: List[ChapterInfo]
    available_groups: List[AdminAvatarUnlockAvailableGroup]

# ============ 图片相关 ============

class ImageInfo(BaseModel):
    imageNumber: int
    imageUrl: str
    chapterNo: str
    groupId: str

# ============ 学习进度相关 ============

class ProgressBase(BaseModel):
    status: Literal['unlearned', 'learning', 'mastered']

class ProgressCreate(ProgressBase):
    word_id: int

class ProgressUpdate(BaseModel):
    status: Literal['unlearned', 'learning', 'mastered']
    quality: Optional[int] = None

class Progress(ProgressBase):
    id: int
    user_id: int
    word_id: int
    last_reviewed: Optional[datetime] = None
    review_count: int
    next_review_date: Optional[datetime] = None
    difficulty_level: int
    is_mistake_marked: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ProgressUpdateResponse(Progress):
    newly_unlocked_avatars: List[AvatarUnlockNoticeItem] = Field(default_factory=list)

class ProgressWithWord(BaseModel):
    word_id: int
    word: str
    status: str
    last_reviewed: Optional[datetime] = None
    review_count: int

class ProgressStats(BaseModel):
    totalWords: int
    unlearnedCount: int
    learningCount: int
    masteredCount: int

class ChapterProgressStats(BaseModel):
    chapterNo: str
    chapterName: str
    totalWords: int
    learnedCount: int
    masteredCount: int
    learningCount: int
    learnedPercent: float
    masteredPercent: float

class LeaderboardEntry(BaseModel):
    rank: int
    username: str
    role: UserRole = 'user'
    avatar_type: Optional[AvatarType] = 'builtin'
    avatar_value: Optional[str] = DEFAULT_BUILTIN_AVATAR_KEY
    score: int
    is_user: bool

class MistakeReviewPlanItem(BaseModel):
    word_id: int
    word: str
    explanation: str
    priority: str
    reason: str
    review_count: int
    difficulty_level: int
    next_review_date: Optional[datetime] = None


# ============ 自定义词书相关 ============

class CustomBookWordBase(BaseModel):
    word: str
    explanation: str
    wordNo: Optional[str] = None
    candidateWords: Optional[str] = None
    roots_affixes: Optional[str] = None
    derivatives: Optional[str] = None
    exampleSentence: Optional[str] = None
    sentenceMeaning: Optional[str] = None
    word_note: Optional[str] = None
    phonetics_uk: Optional[str] = None
    phonetics_us: Optional[str] = None


class CustomBookWordDetail(CustomBookWordBase):
    id: int
    book_id: int
    group_id: int
    sort_order: int = 0

    class Config:
        from_attributes = True


class CustomBookGroupInfo(BaseModel):
    id: int
    group_key: str
    group_name: str
    sort_order: int
    wordCount: int
    learnedCount: int = 0
    learningCount: int = 0
    masteredCount: int = 0
    isCompleted: bool = False
    progressPercent: float = 0.0


class CustomBookSummary(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    source_filename: Optional[str] = None
    source_format: Optional[str] = None
    wordCount: int
    groupCount: int
    learnedCount: int = 0
    learningCount: int = 0
    masteredCount: int = 0
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CustomBookDetail(CustomBookSummary):
    groups: List[CustomBookGroupInfo]


class CustomBookImportResponse(BaseModel):
    book: CustomBookDetail
    importedWords: int


class CustomBookProgressBase(BaseModel):
    status: Literal['unlearned', 'learning', 'mastered']


class CustomBookProgressUpdate(CustomBookProgressBase):
    quality: Optional[int] = None


class CustomBookProgress(CustomBookProgressBase):
    id: int
    user_id: int
    book_word_id: int
    last_reviewed: Optional[datetime] = None
    review_count: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# ============ 复习模式相关 ============

class ReviewWordInfo(BaseModel):
    word_id: int
    word: str
    explanation: str
    next_review_date: Optional[datetime] = None
    difficulty_level: int
    review_count: int
    status: str

    class Config:
        from_attributes = True

class ReviewStats(BaseModel):
    due_today: int
    due_this_week: int
    total_in_review: int

class DifficultyUpdate(BaseModel):
    difficulty: int  # 1=简单, 3=中等, 5=困难

# ============ 错题本相关 ============

class MistakeWordInfo(BaseModel):
    word_id: int
    word: str
    explanation: str
    review_count: int
    is_mistake_marked: bool

    class Config:
        from_attributes = True

# ============ 打卡相关 ============

class CheckInStreakInfo(BaseModel):
    current_streak: int
    longest_streak: int
    last_check_in_date: Optional[datetime] = None
    total_check_ins: int

    class Config:
        from_attributes = True


class ProgressDashboard(BaseModel):
    stats: ProgressStats
    streakInfo: CheckInStreakInfo
    leaderboard: List[LeaderboardEntry]
    chapterProgress: List[ChapterProgressStats]

class DailyCheckInInfo(BaseModel):
    check_in_date: datetime
    words_learned: int
    words_reviewed: int
    quiz_score: Optional[int] = None

    class Config:
        from_attributes = True

class CheckInRequest(BaseModel):
    words_learned: int
    words_reviewed: int

# ============ 测试相关 ============

class QuizStartRequest(BaseModel):
    quiz_type: str  # 'multiple_choice', 'spelling'
    count: int = 10

class QuizQuestion(BaseModel):
    word_id: int
    question_type: str
    question_text: str
    options: Optional[List[str]] = None  # For multiple choice
    hint: Optional[str] = None  # Single unified hint skeleton that dynamically matches difficulty
    correct_answer: Optional[str] = None  # 仅用于后端验证，不返回给前端

class QuizAnswerRequest(BaseModel):
    word_id: int
    user_answer: str

class QuizAnswerResponse(BaseModel):
    is_correct: bool
    correct_answer: str

class QuizSavedAnswer(BaseModel):
    word_id: int
    user_answer: str
    is_correct: bool
    correct_answer: str

class QuizSessionResult(BaseModel):
    id: int  # 修复：数据库模型使用 id，不是 session_id
    quiz_type: str
    total_questions: int
    correct_answers: int
    score: int
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class QuizSessionSnapshot(BaseModel):
    session: QuizSessionResult
    questions: List[QuizQuestion]
    answers: List[QuizSavedAnswer]


# ============ Berry 相关 ============

class AIChatMessage(BaseModel):
    role: Literal['system', 'user', 'assistant']
    content: str

    @field_validator('content')
    @classmethod
    def validate_content(cls, v):
        value = v.strip()
        if not value:
            raise ValueError('消息内容不能为空')
        return value


class AICustomConfig(BaseModel):
    provider: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None

class AIChatRequest(BaseModel):
    messages: List[AIChatMessage]
    context: Optional[dict[str, Any]] = None
    model: Optional[str] = None
    enable_thinking: Optional[bool] = None
    enable_web_search: Optional[bool] = None
    web_search_freshness: Optional[Literal['noLimit', 'oneDay', 'oneWeek', 'oneMonth', 'oneYear']] = None
    custom_config: Optional[AICustomConfig] = None

    @field_validator('messages')
    @classmethod
    def validate_messages(cls, v):
        if not v:
            raise ValueError('至少需要一条消息')
        return v[-12:]

    @field_validator('model')
    @classmethod
    def validate_model(cls, v):
        if v is None:
            return None

        value = v.strip()
        if not value:
            return None

        if len(value) > 120:
            raise ValueError('模型名称过长')

        return value


class AIChatResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    answer: str
    model: str
    provider: str
    provider_name: Optional[str] = None
    model_display_name: Optional[str] = None
    system_model_key: Optional[str] = None
    reasoning: Optional[str] = None
    active_source: Literal['system', 'custom'] = 'system'


class AISettingsUpdate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    base_url: Optional[str] = None
    model: Optional[str] = None
    model_display_name: Optional[str] = None
    api_key: Optional[str] = None

    @field_validator('base_url')
    @classmethod
    def validate_base_url(cls, v):
        if v is None:
            return None

        value = v.strip()
        if not value:
            return None

        if len(value) > 300:
            raise ValueError('Base URL 过长')

        return value

    @field_validator('model')
    @classmethod
    def validate_model(cls, v):
        if v is None:
            return None

        value = v.strip()
        if not value:
            return None

        if len(value) > 120:
            raise ValueError('模型名称过长')

        return value

    @field_validator('model_display_name')
    @classmethod
    def validate_model_display_name(cls, v):
        if v is None:
            return None

        value = v.strip()
        if not value:
            return None

        if len(value) > 120:
            raise ValueError('显示名称过长')

        return value

    @field_validator('api_key')
    @classmethod
    def validate_api_key(cls, v):
        if v is None:
            return None

        value = v.strip()
        if not value:
            return None

        if len(value) > 300:
            raise ValueError('API Key 过长')

        return value


class AISettingsTestRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    provider: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None
    model_display_name: Optional[str] = None
    api_key: Optional[str] = None

    @field_validator('base_url')
    @classmethod
    def validate_base_url(cls, v):
        if v is None:
            return None

        value = v.strip()
        if not value:
            return None

        if len(value) > 300:
            raise ValueError('Base URL 过长')

        return value

    @field_validator('model')
    @classmethod
    def validate_model(cls, v):
        if v is None:
            return None

        value = v.strip()
        if not value:
            return None

        if len(value) > 120:
            raise ValueError('模型名称过长')

        return value

    @field_validator('model_display_name')
    @classmethod
    def validate_model_display_name(cls, v):
        if v is None:
            return None

        value = v.strip()
        if not value:
            return None

        if len(value) > 120:
            raise ValueError('显示名称过长')

        return value

    @field_validator('api_key')
    @classmethod
    def validate_api_key(cls, v):
        if v is None:
            return None

        value = v.strip()
        if not value:
            return None

        if len(value) > 300:
            raise ValueError('API Key 过长')

        return value


class AISettingsTestResponse(BaseModel):
    success: bool
    message: str
    active_model: str
    active_source: Literal['system', 'custom']


class AISettingsSystemModelUpdate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    model_key: str

    @field_validator('model_key')
    @classmethod
    def validate_model_key(cls, v):
        value = str(v or '').strip()
        if not value:
            raise ValueError('系统模型 key 不能为空')
        if len(value) > 120:
            raise ValueError('系统模型 key 过长')
        return value


class AIAvailableModelOption(BaseModel):
    key: str
    model: str
    display_name: str
    provider: str
    source: Literal['system'] = 'system'
    is_default: bool = False


class AISettingsResponse(BaseModel):
    system_configured: bool
    can_use_ai: bool
    active_source: Literal['system', 'custom']
    active_model: str
    active_model_display_name: str
    available_models: List[str]
    available_model_options: List[AIAvailableModelOption] = []
    active_system_model_key: Optional[str] = None
    default_system_model_key: Optional[str] = None
    can_manage_system_model: bool = False
    thinking_enabled: Optional[bool] = None
    web_search_freshness: Optional[str] = None
