"""
配置管理模块
优先从项目根目录 .env 读取配置，旧 JSON 文件作为兼容回退。
"""

import json
import logging
import os
import re
from dataclasses import dataclass
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


def _infer_ai_provider(base_url: str | None, model: str | None) -> str:
    base = str(base_url or "").lower()
    model_name = str(model or "").lower()

    if "siliconflow" in base:
        return "siliconflow"
    if "deepseek" in base or "deepseek" in model_name:
        return "deepseek"
    if "moonshot" in base or "kimi" in model_name:
        return "moonshot"
    if "openai" in base or "gpt" in model_name:
        return "openai"
    return "custom"


def _normalize_system_model_key(value: str | None) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    return re.sub(r"[^A-Za-z0-9._-]+", "_", raw).strip("._-")


def _env_system_model_segment(key: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", key).strip("_").upper()


@dataclass(frozen=True)
class SystemAIModelConfig:
    key: str
    provider: str
    base_url: str
    api_key: str
    model: str
    display_name: str


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
SERVER_PORT = _env_int("SERVER_PORT", int(_config_get(("server", "port"), 8889)))
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


def _load_named_system_ai_models() -> list[SystemAIModelConfig]:
    model_keys = [_normalize_system_model_key(item) for item in _env_list("OPENAI_SYSTEM_MODEL_KEYS", [])]
    models: list[SystemAIModelConfig] = []
    seen_keys: set[str] = set()

    for key in model_keys:
        if not key or key in seen_keys:
            continue

        segment = _env_system_model_segment(key)
        base_url = (_env_text(f"OPENAI_SYSTEM_MODEL_{segment}_BASE_URL") or "").rstrip("/")
        api_key = (_env_text(f"OPENAI_SYSTEM_MODEL_{segment}_API_KEY") or "").strip()
        model_name = (_env_text(f"OPENAI_SYSTEM_MODEL_{segment}_MODEL") or "").strip()
        display_name = (
            _env_text(f"OPENAI_SYSTEM_MODEL_{segment}_DISPLAY_NAME")
            or model_name
        )
        provider = (
            _env_text(f"OPENAI_SYSTEM_MODEL_{segment}_PROVIDER")
            or _infer_ai_provider(base_url, model_name)
        ).strip().lower()

        if not base_url or not api_key or not model_name:
            continue

        seen_keys.add(key)
        models.append(
            SystemAIModelConfig(
                key=key,
                provider=provider,
                base_url=base_url,
                api_key=api_key,
                model=model_name,
                display_name=display_name,
            )
        )

    return models


def _load_legacy_system_ai_models() -> list[SystemAIModelConfig]:
    legacy_api_key = (_env_text("OPENAI_API_KEY") or "").strip()
    legacy_base_url = (
        _env_text("OPENAI_BASE_URL")
        or AI_CONFIG.get("base_url")
        or "https://api.openai.com/v1"
    ).rstrip("/")
    legacy_default_model = (
        _env_text("OPENAI_MODEL")
        or AI_CONFIG.get("model")
        or "gpt-4o-mini"
    ).strip()
    legacy_display_name = (
        _env_text("OPENAI_DISPLAY_MODEL_NAME")
        or AI_CONFIG.get("display_model_name")
        or legacy_default_model
    ).strip()
    legacy_models = _dedupe_text_items(
        [legacy_default_model],
        _env_list("OPENAI_MODELS", []),
    )

    if not legacy_base_url or not legacy_api_key or not legacy_default_model:
        return []

    provider = _infer_ai_provider(legacy_base_url, legacy_default_model)
    items: list[SystemAIModelConfig] = []
    for model_name in legacy_models:
        display_name = legacy_display_name if model_name == legacy_default_model else model_name
        items.append(
            SystemAIModelConfig(
                key=model_name,
                provider=provider,
                base_url=legacy_base_url,
                api_key=legacy_api_key,
                model=model_name,
                display_name=display_name,
            )
        )

    return items


def _resolve_system_ai_models() -> list[SystemAIModelConfig]:
    named_models = _load_named_system_ai_models()
    if named_models:
        return named_models
    return _load_legacy_system_ai_models()


OPENAI_SYSTEM_MODELS = _resolve_system_ai_models()
OPENAI_DEFAULT_SYSTEM_MODEL_KEY = (
    _normalize_system_model_key(_env_text("OPENAI_DEFAULT_SYSTEM_MODEL_KEY"))
    or (OPENAI_SYSTEM_MODELS[0].key if OPENAI_SYSTEM_MODELS else "")
)


def _resolve_default_system_ai_model() -> SystemAIModelConfig | None:
    if not OPENAI_SYSTEM_MODELS:
        return None

    for item in OPENAI_SYSTEM_MODELS:
        if item.key == OPENAI_DEFAULT_SYSTEM_MODEL_KEY:
            return item

    return OPENAI_SYSTEM_MODELS[0]


OPENAI_DEFAULT_SYSTEM_MODEL = _resolve_default_system_ai_model()
OPENAI_API_KEY = OPENAI_DEFAULT_SYSTEM_MODEL.api_key if OPENAI_DEFAULT_SYSTEM_MODEL else ""
OPENAI_BASE_URL = OPENAI_DEFAULT_SYSTEM_MODEL.base_url if OPENAI_DEFAULT_SYSTEM_MODEL else "https://api.openai.com/v1"
OPENAI_MODEL = OPENAI_DEFAULT_SYSTEM_MODEL.model if OPENAI_DEFAULT_SYSTEM_MODEL else "gpt-4o-mini"
OPENAI_DISPLAY_MODEL_NAME = (
    OPENAI_DEFAULT_SYSTEM_MODEL.display_name
    if OPENAI_DEFAULT_SYSTEM_MODEL
    else "gpt-4o-mini"
)
OPENAI_AVAILABLE_MODELS = [item.key for item in OPENAI_SYSTEM_MODELS] or ([OPENAI_MODEL] if OPENAI_MODEL else [])


def get_system_ai_model(model_key_or_name: str | None = None) -> SystemAIModelConfig | None:
    if not OPENAI_SYSTEM_MODELS:
        return None

    if not model_key_or_name:
        return OPENAI_DEFAULT_SYSTEM_MODEL

    normalized_key = _normalize_system_model_key(model_key_or_name)
    for item in OPENAI_SYSTEM_MODELS:
        if item.key == normalized_key:
            return item

    for item in OPENAI_SYSTEM_MODELS:
        if item.model == model_key_or_name:
            return item

    return OPENAI_DEFAULT_SYSTEM_MODEL


def _write_env_updates(updates: dict[str, str]) -> None:
    existing_lines: list[str] = []
    if ROOT_ENV_PATH.exists():
        existing_lines = ROOT_ENV_PATH.read_text(encoding="utf-8").splitlines()

    remaining = dict(updates)
    next_lines: list[str] = []
    env_key_pattern = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)=")

    for line in existing_lines:
        match = env_key_pattern.match(line)
        if not match:
            next_lines.append(line)
            continue

        key = match.group(1)
        if key in remaining:
            next_lines.append(f"{key}={remaining.pop(key)}")
        else:
            next_lines.append(line)

    if remaining:
        if next_lines and next_lines[-1] != "":
            next_lines.append("")
        for key, value in remaining.items():
            next_lines.append(f"{key}={value}")

    ROOT_ENV_PATH.write_text("\n".join(next_lines) + "\n", encoding="utf-8")


def set_default_system_model_key(model_key: str) -> SystemAIModelConfig:
    normalized_key = _normalize_system_model_key(model_key)
    if not normalized_key:
        raise ValueError("系统模型 key 不能为空")

    target = next((item for item in OPENAI_SYSTEM_MODELS if item.key == normalized_key), None)
    if not target:
        raise KeyError(normalized_key)

    _write_env_updates({
        "OPENAI_DEFAULT_SYSTEM_MODEL_KEY": target.key,
    })
    os.environ["OPENAI_DEFAULT_SYSTEM_MODEL_KEY"] = target.key

    global OPENAI_DEFAULT_SYSTEM_MODEL_KEY
    global OPENAI_DEFAULT_SYSTEM_MODEL
    global OPENAI_API_KEY
    global OPENAI_BASE_URL
    global OPENAI_MODEL
    global OPENAI_DISPLAY_MODEL_NAME
    global OPENAI_AVAILABLE_MODELS

    OPENAI_DEFAULT_SYSTEM_MODEL_KEY = target.key
    OPENAI_DEFAULT_SYSTEM_MODEL = target
    OPENAI_API_KEY = target.api_key
    OPENAI_BASE_URL = target.base_url
    OPENAI_MODEL = target.model
    OPENAI_DISPLAY_MODEL_NAME = target.display_name
    OPENAI_AVAILABLE_MODELS = [item.key for item in OPENAI_SYSTEM_MODELS] or [target.key]

    return target
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
    logger.info("系统默认AI模型Key: %s", OPENAI_DEFAULT_SYSTEM_MODEL_KEY or "未设置")
    logger.info("AI模型: %s", OPENAI_MODEL)
    logger.info(
        "可选AI模型: %s",
        [f"{item.key} -> {item.display_name}" for item in OPENAI_SYSTEM_MODELS] or OPENAI_AVAILABLE_MODELS,
    )
    if OPENAI_ENABLE_THINKING is not None:
        logger.info("AI Thinking: %s", "开启" if OPENAI_ENABLE_THINKING else "关闭")
    logger.info("AI服务: %s", "已配置" if OPENAI_API_KEY else "未配置 OPENAI_API_KEY")
    logger.info("Berry 联网搜索: %s", "已配置" if BOCHA_SEARCH_URL and BOCHA_SEARCH_API_KEY else "未配置")
    logger.info("=" * 60)


if __name__ == "__main__":
    print_config()
