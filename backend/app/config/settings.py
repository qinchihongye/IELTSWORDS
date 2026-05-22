"""
配置管理模块
优先从项目根目录 .env 读取配置，旧 JSON 文件作为兼容回退。
"""

import json
import logging
import os
from pathlib import Path

from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# 获取项目根目录（向上三层到达项目根目录）
BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
ROOT_ENV_PATH = BASE_DIR / ".env"
LEGACY_BACKEND_ENV_PATH = BASE_DIR / "backend" / ".env"

# 优先读取根目录 .env，兼容旧 backend/.env
load_dotenv(ROOT_ENV_PATH)
if LEGACY_BACKEND_ENV_PATH.exists():
    load_dotenv(LEGACY_BACKEND_ENV_PATH)


def _env_text(name: str) -> str | None:
    value = os.getenv(name)
    if value is None:
        return None

    value = value.strip()
    return value or None


def _env_int(name: str, default: int) -> int:
    value = _env_text(name)
    if value is None:
        return default
    return int(value)


def _env_bool(name: str, default: bool) -> bool:
    value = _env_text(name)
    if value is None:
        return default

    normalized = value.lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


def _env_optional_bool(name: str) -> bool | None:
    value = _env_text(name)
    if value is None:
        return None

    normalized = value.lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return None


def _env_list(name: str, default: list[str]) -> list[str]:
    value = _env_text(name)
    if value is None:
        return default

    if value == "*":
        return ["*"]

    if value.startswith("["):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            parsed = None
        if isinstance(parsed, list):
            return [str(item).strip() for item in parsed if str(item).strip()]

    return [item.strip() for item in value.split(",") if item.strip()]


def _dedupe_text_items(*groups: list[str]) -> list[str]:
    seen: set[str] = set()
    items: list[str] = []

    for group in groups:
        for raw_item in group:
            item = str(raw_item or "").strip()
            if not item or item in seen:
                continue
            seen.add(item)
            items.append(item)

    return items


ENVIRONMENT = (_env_text("ENVIRONMENT") or "development").lower()
_config_filename = (
    "backend.production.json"
    if ENVIRONMENT == "production"
    else "backend.config.json"
)
LEGACY_CONFIG_PATH = BASE_DIR / "config" / _config_filename


def _load_legacy_config() -> dict:
    if not LEGACY_CONFIG_PATH.exists():
        return {}

    with open(LEGACY_CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


LEGACY_CONFIG = _load_legacy_config()


def _config_get(path: tuple[str, ...], default=None):
    current = LEGACY_CONFIG
    for key in path:
        if not isinstance(current, dict) or key not in current:
            return default
        current = current[key]
    return current


def resolve_database_url(url: str) -> str:
    """将配置里的 SQLite 相对路径解析为项目根目录下的绝对路径。"""
    sqlite_prefix = "sqlite:///"
    if not url.startswith(sqlite_prefix):
        return url

    raw_path = url[len(sqlite_prefix):]
    db_path = Path(raw_path)
    if not db_path.is_absolute():
        db_path = (BASE_DIR / raw_path).resolve()

    db_path.parent.mkdir(parents=True, exist_ok=True)
    return f"{sqlite_prefix}{db_path}"


# 服务器配置
SERVER_HOST = _env_text("SERVER_HOST") or _config_get(("server", "host"), "0.0.0.0")
SERVER_PORT = _env_int("SERVER_PORT", int(_config_get(("server", "port"), 8888)))
SERVER_RELOAD = _env_bool("SERVER_RELOAD", bool(_config_get(("server", "reload"), False)))
SERVER_ACCESS_LOG = _env_bool("SERVER_ACCESS_LOG", True)

# 数据库配置
DATABASE_URL = resolve_database_url(
    _env_text("DATABASE_URL") or _config_get(("database", "url"), "sqlite:///./db/ielts_words_app.db")
)
SOURCE_DATABASE_URL = resolve_database_url(
    _env_text("SOURCE_DATABASE_URL") or _config_get(("database", "source_db"), "sqlite:///./db/ielts_words.db")
)

# JWT配置
SECRET_KEY = _env_text("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError(
        "SECRET_KEY 环境变量未设置！请在项目根目录 .env 中配置一个安全的随机密钥。\n"
        "示例: SECRET_KEY=<运行 python3 -c 'import secrets; print(secrets.token_hex(32))' 生成>"
    )
ALGORITHM = _env_text("JWT_ALGORITHM") or _config_get(("jwt", "algorithm"), "HS256")
ACCESS_TOKEN_EXPIRE_HOURS = _env_int(
    "ACCESS_TOKEN_EXPIRE_HOURS",
    int(_config_get(("jwt", "access_token_expire_hours"), 24)),
)

# CORS配置
CORS_ORIGINS = _env_list("CORS_ORIGINS", _config_get(("cors", "origins"), []))
CORS_MAX_AGE = max(0, _env_int("CORS_MAX_AGE", 86400))

# 数据看板缓存配置
LEADERBOARD_CACHE_TTL_SECONDS = max(0, _env_int("LEADERBOARD_CACHE_TTL_SECONDS", 30))

# AI 配置
AI_CONFIG = LEGACY_CONFIG.get("ai", {}) if isinstance(LEGACY_CONFIG, dict) else {}
OPENAI_API_KEY = (_env_text("OPENAI_API_KEY") or "").strip()
OPENAI_BASE_URL = (
    _env_text("OPENAI_BASE_URL")
    or AI_CONFIG.get("base_url")
    or "https://api.openai.com/v1"
).rstrip("/")
OPENAI_MODEL = (
    _env_text("OPENAI_MODEL")
    or AI_CONFIG.get("model")
    or "gpt-4o-mini"
)
OPENAI_DISPLAY_MODEL_NAME = (
    _env_text("OPENAI_DISPLAY_MODEL_NAME")
    or AI_CONFIG.get("display_model_name")
    or OPENAI_MODEL
)
OPENAI_AVAILABLE_MODELS = _dedupe_text_items(
    [OPENAI_MODEL],
    _env_list("OPENAI_MODELS", []),
)
AI_REQUEST_TIMEOUT_SECONDS = _env_int(
    "AI_REQUEST_TIMEOUT_SECONDS",
    int(AI_CONFIG.get("timeout_seconds") or 30),
)
OPENAI_ENABLE_THINKING = _env_optional_bool("OPENAI_ENABLE_THINKING")
if OPENAI_ENABLE_THINKING is None and "enable_thinking" in AI_CONFIG:
    OPENAI_ENABLE_THINKING = bool(AI_CONFIG.get("enable_thinking"))

# Berry 联网搜索配置。URL 和 Key 必须来自 .env，避免把服务地址或密钥写进代码。
BOCHA_SEARCH_URL = (_env_text("BOCHA_SEARCH_URL") or "").rstrip("/")
BOCHA_SEARCH_API_KEY = (_env_text("BOCHA_SEARCH_API_KEY") or "").strip()
BOCHA_SEARCH_FRESHNESS = _env_text("BOCHA_SEARCH_FRESHNESS") or "noLimit"
BOCHA_SEARCH_COUNT = max(1, min(_env_int("BOCHA_SEARCH_COUNT", 5), 10))
BOCHA_SEARCH_SUMMARY = _env_bool("BOCHA_SEARCH_SUMMARY", True)
BOCHA_SEARCH_TIMEOUT_SECONDS = max(3, min(_env_int("BOCHA_SEARCH_TIMEOUT_SECONDS", 15), 30))


def print_config():
    """打印配置信息（调试用）"""
    logger.info("=" * 60)
    logger.info("后端配置信息")
    logger.info("=" * 60)
    logger.info("运行环境: %s", ENVIRONMENT)
    logger.info("服务器地址: %s:%s", SERVER_HOST, SERVER_PORT)
    logger.info("访问日志: %s", "开启" if SERVER_ACCESS_LOG else "关闭")
    logger.info("数据库路径: %s", DATABASE_URL)
    logger.info("JWT算法: %s", ALGORITHM)
    logger.info("Token有效期: %s小时", ACCESS_TOKEN_EXPIRE_HOURS)
    logger.info("CORS来源: %s", CORS_ORIGINS)
    logger.info("CORS预检缓存: %s秒", CORS_MAX_AGE)
    logger.info("排行榜缓存: %s秒", LEADERBOARD_CACHE_TTL_SECONDS)
    logger.info("AI模型: %s", OPENAI_MODEL)
    logger.info("可选AI模型: %s", OPENAI_AVAILABLE_MODELS)
    if OPENAI_ENABLE_THINKING is not None:
        logger.info("AI Thinking: %s", "开启" if OPENAI_ENABLE_THINKING else "关闭")
    logger.info("AI服务: %s", "已配置" if OPENAI_API_KEY else "未配置 OPENAI_API_KEY")
    logger.info("Berry 联网搜索: %s", "已配置" if BOCHA_SEARCH_URL and BOCHA_SEARCH_API_KEY else "未配置")
    logger.info("=" * 60)


if __name__ == "__main__":
    print_config()
