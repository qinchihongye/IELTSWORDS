"""
Berry 相关 API
"""

import json
import re
import socket
from typing import Any, AsyncIterator
from ipaddress import ip_address
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config.settings import (
    AI_REQUEST_TIMEOUT_SECONDS,
    BOCHA_SEARCH_API_KEY,
    BOCHA_SEARCH_COUNT,
    BOCHA_SEARCH_FRESHNESS,
    BOCHA_SEARCH_SUMMARY,
    BOCHA_SEARCH_TIMEOUT_SECONDS,
    BOCHA_SEARCH_URL,
    OPENAI_API_KEY,
    OPENAI_AVAILABLE_MODELS,
    OPENAI_BASE_URL,
    OPENAI_MODEL,
    OPENAI_DISPLAY_MODEL_NAME,
    OPENAI_ENABLE_THINKING,
)
from ..database import get_db
from ..dependencies import get_current_user
from ..logging_config import get_logger

router = APIRouter()
MODEL_NAME_PATTERN = re.compile(r"^[A-Za-z0-9._:/-]+$")
REASONING_FIELD_KEYS = ("reasoning", "reasoning_content", "thinking", "reasoning_text")
REASONING_ITEM_TYPES = {"reasoning", "reasoning_content", "thinking", "reasoning_text"}
THINK_OPEN_TAG = "<think>"
THINK_CLOSE_TAG = "</think>"
logger = get_logger(__name__)

BLOCKED_CUSTOM_AI_HOSTS = {"localhost", "localhost.localdomain"}
ALLOWED_SEARCH_FRESHNESS = {"oneDay", "oneWeek", "oneMonth", "oneYear", "noLimit"}


def build_system_prompt(current_user: models.User, context: dict | None) -> str:
    page = (context or {}).get("page") or "general"
    role = current_user.role or "user"

    lines = [
        "你叫 Berry，是 IELTS 单词学习应用里的 AI 学习伙伴。",
        "你的主要任务是帮助用户理解单词、纠错、总结规律、制定复习建议。",
        "默认使用简洁自然的中文回答，必要时保留英文原词、词组、例句。",
        "优先结合页面上下文作答，但不要机械复述上下文字段。",
        "输出要实用、清晰，尽量分点，避免空泛鼓励。",
        "回答时优先使用清晰的 Markdown 结构，例如小标题、分点、编号、代码块。",
        "如果输出 Markdown，请严格保留必要的空格与换行，不要把多个标题、列表、代码块、引用或表格挤在同一行。",
        "小标题请单独占一行，例如：## 记忆技巧。",
        "强调单词、词组、词根、词缀时，优先使用反引号，例如 `atmosphere`、`atmo`、`sphere`，不要输出不成对的 * 或 **。",
        "除非明确要做引用说明，不要把普通正文写成 > 引用块。",
        "如果给例句，优先使用如下结构：例句：... 换行 译文：...；必要时再补一行用法：...",
        "如果用户询问“最新的大模型”“有哪些模型”“模型清单”这类问题，优先列出具体模型/产品、发布方、能力特点和时间信息，再总结趋势。",
        f"当前用户角色: {role}",
        f"当前页面类型: {page}",
    ]

    if page == "quiz":
        lines.extend([
            "如果用户还没有提交答案，不要直接剧透标准答案，优先给提示和思路。",
            "如果上下文里已经包含作答结果或正确答案，可以直接解释错因与记忆方法。",
        ])
    elif page == "learning":
        lines.append("学习页回答时，优先解释词义、词根词缀、近义辨析和记忆技巧。")
    elif page == "mistake-book":
        lines.append("错词本回答时，优先分析易错原因，并给出短期复习计划。")

    return "\n".join(lines)


def build_context_message(context: dict | None) -> str | None:
    if not context:
        return None

    payload = context.get("payload") or {}
    lines = []

    if context.get("label"):
        lines.append(f"上下文模块: {context['label']}")
    if context.get("description"):
        lines.append(f"页面说明: {context['description']}")

    field_mapping = [
        ("modeLabel", "学习模式"),
        ("chapterTitle", "章节"),
        ("groupLabel", "分组"),
        ("word", "当前单词"),
        ("explanation", "当前释义"),
        ("exampleSentence", "例句"),
        ("sentenceMeaning", "例句释义"),
        ("wordNote", "单词备注"),
        ("imageProgressText", "配图进度"),
        ("questionText", "题目"),
        ("questionTypeLabel", "题型"),
        ("hint", "提示"),
        ("selectedAnswer", "用户答案"),
        ("correctAnswer", "正确答案"),
        ("answerStatusText", "作答情况"),
        ("wordCountText", "错词数量"),
        ("reviewPlanSummary", "复习建议"),
        ("selectedWord", "当前关注单词"),
    ]

    for key, label in field_mapping:
        value = payload.get(key)
        if value:
            lines.append(f"{label}: {value}")

    related_words = payload.get("relatedWords") or []
    if related_words:
        lines.append(f"相关单词: {', '.join(related_words[:8])}")

    if not lines:
        return None

    return "以下是当前页面上下文，仅用于帮助你更贴合当前学习场景：\n" + "\n".join(lines)


FOLLOW_UP_SEARCH_HINTS = (
    "当前页面",
    "当前正在看",
    "当前单词",
    "结合",
    "下一步",
    "学习建议",
    "继续",
    "上面",
    "前面",
    "刚才",
    "这个",
    "这些",
    "总结",
    "这个单词",
    "这道题",
    "讲透",
    "记忆技巧",
    "错因",
)


def get_latest_user_query(messages: list[dict]) -> str:
    for message in reversed(messages):
        if message.get("role") != "user":
            continue
        content = str(message.get("content") or "").strip()
        if content:
            return content[:300]
    return ""


def is_follow_up_search_query(query: str) -> bool:
    value = re.sub(r"\s+", "", query or "")
    if not value:
        return False
    if len(value) <= 28 and any(hint in value for hint in FOLLOW_UP_SEARCH_HINTS):
        return True
    return "当前页面的内容" in value or "下一步学习建议" in value


def build_contextual_search_query(query: str, context: dict | None) -> str:
    payload = (context or {}).get("payload") or {}
    page = (context or {}).get("page") or "general"
    normalized_query = truncate_search_text(query, 300)
    compact_query = re.sub(r"\s+", "", normalized_query)

    current_word = str(payload.get("word") or payload.get("selectedWord") or "").strip()
    if page == "learning" and current_word:
        if current_word.lower() in normalized_query.lower():
            return normalized_query
        if any(hint in compact_query for hint in FOLLOW_UP_SEARCH_HINTS):
            parts = [current_word, "单词"]
            if "记忆" in normalized_query:
                parts.append("记忆技巧")
            if "例句" in normalized_query:
                parts.append("例句")
            if "辨析" in normalized_query:
                parts.append("近义辨析")
            if "释义" in normalized_query or "讲透" in normalized_query:
                parts.append("释义")
            return truncate_search_text(" ".join(dict.fromkeys(parts)), 300)

    selected_word = str(payload.get("selectedWord") or payload.get("word") or "").strip()
    question_text = str(payload.get("questionText") or "").strip()
    if page in {"quiz", "mistake-book"} and selected_word:
        if selected_word.lower() in normalized_query.lower():
            return normalized_query
        if any(hint in compact_query for hint in FOLLOW_UP_SEARCH_HINTS):
            parts = [selected_word, "单词"]
            if question_text:
                parts.append(question_text[:80])
            return truncate_search_text(" ".join(dict.fromkeys(parts)), 300)

    return normalized_query


def build_web_search_query(messages: list[dict], context: dict | None = None) -> str:
    latest_query = get_latest_user_query(messages)
    if not latest_query:
        return ""

    contextual_query = build_contextual_search_query(latest_query, context)
    if contextual_query != truncate_search_text(latest_query, 300):
        return contextual_query

    if not is_follow_up_search_query(latest_query):
        return latest_query

    previous_topic = ""
    seen_latest = False
    for message in reversed(messages):
        if message.get("role") != "user":
            continue
        content = str(message.get("content") or "").strip()
        if not content:
            continue
        if not seen_latest and content == latest_query:
            seen_latest = True
            continue
        if content != latest_query and not is_follow_up_search_query(content):
            previous_topic = content
            break

    if previous_topic:
        return truncate_search_text(f"{previous_topic} {latest_query}", 300)

    return ""


def truncate_search_text(value: Any, max_length: int = 500) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if len(text) <= max_length:
        return text
    return f"{text[:max_length]}..."


def extract_web_search_items(body: dict[str, Any]) -> list[dict[str, str]]:
    raw_items = (
        body.get("data", {})
        .get("webPages", {})
        .get("value", [])
    )
    if not isinstance(raw_items, list):
        return []

    items: list[dict[str, str]] = []
    for raw_item in raw_items[:BOCHA_SEARCH_COUNT]:
        if not isinstance(raw_item, dict):
            continue

        title = truncate_search_text(
            raw_item.get("name")
            or raw_item.get("title")
            or raw_item.get("siteName")
            or "未命名结果",
            120,
        )
        url = truncate_search_text(raw_item.get("url") or raw_item.get("displayUrl"), 240)
        summary = truncate_search_text(raw_item.get("summary") or raw_item.get("snippet"), 700)

        if not summary:
            continue

        items.append({
            "title": title,
            "url": url,
            "summary": summary,
        })

    return items


def build_web_search_context_message(query: str, results: list[dict[str, str]]) -> str:
    lines = [
        "以下是 Berry 刚刚获取的联网搜索结果，仅用于回答当前用户问题。",
        "请优先基于这些结果作答；如果结果不足或互相矛盾，请明确说明不确定性。",
        "涉及搜索结果中的事实、数据、机构预测或新闻动态时，必须在对应句子末尾标注来源编号，例如 [1]、[2]。",
        "回答末尾请增加“来源”小节，列出用到的来源编号、标题和链接。",
        "不要编造搜索结果之外的实时信息。",
        f"搜索词: {query}",
    ]

    for index, item in enumerate(results, start=1):
        lines.append("")
        lines.append(f"[{index}] {item['title']}")
        if item.get("url"):
            lines.append(f"链接: {item['url']}")
        lines.append(f"摘要: {item['summary']}")

    return "\n".join(lines)


def normalize_web_search_freshness(freshness: str | None = None) -> str:
    if freshness in ALLOWED_SEARCH_FRESHNESS:
        return freshness
    if BOCHA_SEARCH_FRESHNESS in ALLOWED_SEARCH_FRESHNESS:
        return BOCHA_SEARCH_FRESHNESS
    return "noLimit"


async def perform_web_search(query: str, freshness: str | None = None) -> list[dict[str, str]]:
    if not BOCHA_SEARCH_URL or not BOCHA_SEARCH_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="联网搜索尚未配置，请先在 .env 中配置搜索服务",
        )

    normalized_query = query.strip()
    if not normalized_query:
        return []

    payload = {
        "query": normalized_query,
        "summary": BOCHA_SEARCH_SUMMARY,
        "freshness": normalize_web_search_freshness(freshness),
        "count": BOCHA_SEARCH_COUNT,
    }
    headers = {
        "Authorization": f"Bearer {BOCHA_SEARCH_API_KEY}",
        "Content-Type": "application/json",
    }
    timeout = httpx.Timeout(
        connect=min(BOCHA_SEARCH_TIMEOUT_SECONDS, 10),
        read=BOCHA_SEARCH_TIMEOUT_SECONDS,
        write=BOCHA_SEARCH_TIMEOUT_SECONDS,
        pool=BOCHA_SEARCH_TIMEOUT_SECONDS,
    )

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(BOCHA_SEARCH_URL, json=payload, headers=headers)
            response.raise_for_status()
            body = response.json()
    except httpx.HTTPStatusError as exc:
        logger.warning("Web search service returned %s", exc.response.status_code)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="联网搜索服务暂时不可用",
        ) from exc
    except httpx.RequestError as exc:
        logger.warning("Web search connection failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="联网搜索连接失败，请检查搜索服务配置或网络",
        ) from exc
    except Exception as exc:
        logger.exception("Unexpected web search error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="联网搜索返回格式异常",
        ) from exc

    return extract_web_search_items(body)


async def build_web_search_message_if_enabled(
    enabled: bool | None,
    cleaned_messages: list[dict],
    context: dict | None = None,
    freshness: str | None = None,
) -> str | None:
    if not enabled:
        return None

    query = build_web_search_query(cleaned_messages, context)
    if not query:
        return None

    results = await perform_web_search(query, freshness)
    if not results:
        return f"联网搜索已开启，但没有检索到与“{query}”直接相关的结果。请基于已有上下文谨慎回答。"

    return build_web_search_context_message(query, results)


def normalize_user_model(model: str | None) -> str | None:
    if model is None:
        return None

    value = model.strip()
    if not value:
        return None

    if len(value) > 120 or not MODEL_NAME_PATTERN.match(value):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="模型名称格式不正确",
        )

    return value


def is_blocked_custom_ai_host(hostname: str | None) -> bool:
    if not hostname:
        return True

    host = hostname.strip("[]").strip().lower().rstrip(".")
    if host in BLOCKED_CUSTOM_AI_HOSTS or host.endswith(".localhost"):
        return True

    try:
        return not ip_address(host).is_global
    except ValueError:
        pass

    try:
        address_info = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return True

    for item in address_info:
        address = item[4][0]
        try:
            if not ip_address(address).is_global:
                return True
        except ValueError:
            return True

    return False


def normalize_base_url(base_url: str | None, require_public_https: bool = False) -> str | None:
    if base_url is None:
        return None

    value = base_url.strip()
    if not value:
        return None

    if value.endswith("/chat/completions"):
        value = value[: -len("/chat/completions")]
    if value.endswith("/models"):
        value = value[: -len("/models")]

    value = value.rstrip("/")
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Base URL 格式不正确，请填写完整的 http(s) 地址",
        )

    if require_public_https:
        if parsed.scheme != "https":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="自定义 Base URL 必须使用 HTTPS",
            )
        if parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="自定义 Base URL 不能包含用户名、密码、查询参数或片段",
            )
        if is_blocked_custom_ai_host(parsed.hostname):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="自定义 Base URL 必须指向可公开访问的 AI 服务地址",
            )

    return value


def normalize_api_key(api_key: str | None) -> str | None:
    if api_key is None:
        return None

    value = api_key.strip()
    if not value:
        return None

    if len(value) > 300:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="API Key 过长",
        )

    return value


def mask_api_key(api_key: str | None) -> str | None:
    if not api_key:
        return None

    if len(api_key) <= 8:
        return "*" * len(api_key)

    return f"{api_key[:4]}...{api_key[-4:]}"


def get_active_source(custom_config: schemas.AICustomConfig | None) -> str:
    if custom_config and custom_config.api_key:
        return "custom"
    return "system"


def get_available_models() -> list[str]:
    return OPENAI_AVAILABLE_MODELS or [OPENAI_MODEL]


def _extract_text_like(value: Any) -> str:
    if value is None:
        return ""

    if isinstance(value, str):
        return value

    if isinstance(value, list):
        return "".join(_extract_text_like(item) for item in value)

    if isinstance(value, dict):
        for key in ("text", "content", "value", "output_text"):
            text = _extract_text_like(value.get(key))
            if text:
                return text
        return ""

    return str(value)


def extract_text_parts(payload: Any) -> tuple[str, str]:
    content_parts: list[str] = []
    reasoning_parts: list[str] = []

    def consume(value: Any, forced_reasoning: bool = False):
        if value is None:
            return

        if isinstance(value, str):
            if value:
                (reasoning_parts if forced_reasoning else content_parts).append(value)
            return

        if isinstance(value, list):
            for item in value:
                consume(item, forced_reasoning=forced_reasoning)
            return

        if isinstance(value, dict):
            item_type = str(value.get("type") or "").strip().lower()
            if item_type in REASONING_ITEM_TYPES:
                text = _extract_text_like(value)
                if text:
                    reasoning_parts.append(text)
                return

            for key in REASONING_FIELD_KEYS:
                if key in value:
                    consume(value.get(key), forced_reasoning=True)

            if "content" in value:
                consume(value.get("content"), forced_reasoning=forced_reasoning)
                return

            text = _extract_text_like(value)
            if text:
                (reasoning_parts if forced_reasoning else content_parts).append(text)
            return

        text = str(value)
        if text:
            (reasoning_parts if forced_reasoning else content_parts).append(text)

    consume(payload)
    # Keep chunk-level whitespace intact for streaming responses; otherwise
    # leading spaces in deltas like " atmosphere" get stripped and English
    # words collapse together when the frontend appends them incrementally.
    return "".join(content_parts), "".join(reasoning_parts)


def split_tagged_reasoning_text(text: str) -> tuple[str, str]:
    if not text:
        return "", ""

    lower_text = text.lower()
    if THINK_OPEN_TAG not in lower_text and THINK_CLOSE_TAG not in lower_text:
        return text, ""

    answer_parts: list[str] = []
    reasoning_parts: list[str] = []
    cursor = 0
    inside_reasoning = False

    while cursor < len(text):
        if inside_reasoning:
            close_index = lower_text.find(THINK_CLOSE_TAG, cursor)
            if close_index < 0:
                reasoning_parts.append(text[cursor:])
                cursor = len(text)
                break

            reasoning_parts.append(text[cursor:close_index])
            cursor = close_index + len(THINK_CLOSE_TAG)
            inside_reasoning = False
            continue

        open_index = lower_text.find(THINK_OPEN_TAG, cursor)
        if open_index < 0:
            answer_parts.append(text[cursor:])
            break

        answer_parts.append(text[cursor:open_index])
        cursor = open_index + len(THINK_OPEN_TAG)
        inside_reasoning = True

    return "".join(answer_parts), "".join(reasoning_parts)


def merge_reasoning_text(*parts: str) -> str:
    normalized_parts = [part.strip() for part in parts if part and part.strip()]
    return "\n\n".join(normalized_parts)


def normalize_answer_and_reasoning(answer: str, reasoning: str) -> tuple[str, str]:
    visible_answer, tagged_reasoning = split_tagged_reasoning_text(answer)
    return visible_answer.strip(), merge_reasoning_text(reasoning, tagged_reasoning)


def ndjson_line(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False) + "\n"


def build_settings_response() -> dict:
    system_configured = bool(OPENAI_API_KEY)
    
    return {
        "system_configured": system_configured,
        "can_use_ai": system_configured, # Frontend will evaluate custom config logic locally
        "active_source": "system",
        "active_model": OPENAI_MODEL,
        "active_model_display_name": OPENAI_DISPLAY_MODEL_NAME,
        "available_models": get_available_models(),
        "thinking_enabled": OPENAI_ENABLE_THINKING,
        "web_search_freshness": normalize_web_search_freshness(),
    }


def resolve_active_ai_config(requested_model: str | None = None, custom_config: schemas.AICustomConfig | None = None) -> tuple[str, str, str]:
    requested_model_name = normalize_user_model(requested_model)

    if custom_config and custom_config.api_key:
        if custom_config.provider == 'siliconflow':
            base_url = "https://api.siliconflow.cn/v1"
        elif custom_config.provider == 'deepseek':
            base_url = "https://api.deepseek.com"
        elif custom_config.provider == 'moonshot':
            base_url = "https://api.moonshot.cn/v1"
        else:
            base_url = normalize_base_url(custom_config.base_url, require_public_https=True) or OPENAI_BASE_URL
        model_name = requested_model_name or normalize_user_model(custom_config.model) or OPENAI_MODEL
        return base_url, custom_config.api_key, model_name

    if not OPENAI_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Berry 尚未配置系统默认密钥，且未提供自定义配置",
        )

    return OPENAI_BASE_URL, OPENAI_API_KEY, requested_model_name or OPENAI_MODEL


def merge_system_messages(messages: list[dict]) -> list[dict]:
    system_contents = []
    other_messages = []
    for msg in messages:
        if msg.get("role") == "system":
            system_contents.append(str(msg.get("content") or ""))
        else:
            other_messages.append(msg)
    
    if not system_contents:
        return other_messages
    
    return [{"role": "system", "content": "\n\n".join(system_contents)}] + other_messages


def build_chat_completion_payload(
    messages: list[dict],
    model_name: str,
    temperature: float,
    max_tokens: int | None = None,
    stream: bool = False,
    enable_thinking: bool | None = None,
    provider: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": model_name,
        "messages": merge_system_messages(messages),
        "temperature": temperature,
        "stream": stream,
    }
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens
    
    if enable_thinking is not None:
        if provider == "deepseek":
            payload["thinking"] = {"type": "enabled" if enable_thinking else "disabled"}
            if enable_thinking:
                payload["reasoning_effort"] = "high"
        else:
            payload["chat_template_kwargs"] = {
                "enable_thinking": enable_thinking,
            }
    return payload


def build_httpx_timeout(enable_thinking: bool | None = None, stream: bool = False) -> httpx.Timeout:
    connect_timeout = min(AI_REQUEST_TIMEOUT_SECONDS, 10)
    read_timeout = AI_REQUEST_TIMEOUT_SECONDS
    if stream or enable_thinking:
        read_timeout = max(AI_REQUEST_TIMEOUT_SECONDS, 120)

    return httpx.Timeout(
        connect=connect_timeout,
        read=read_timeout,
        write=AI_REQUEST_TIMEOUT_SECONDS,
        pool=AI_REQUEST_TIMEOUT_SECONDS,
    )


async def call_openai_compatible_api(
    messages: list[dict],
    base_url: str,
    api_key: str,
    model_name: str,
    temperature: float = 0.7,
    max_tokens: int | None = None,
    enable_thinking: bool | None = None,
    provider: str | None = None,
) -> tuple[str, str]:
    payload = build_chat_completion_payload(
        messages=messages,
        model_name=model_name,
        temperature=temperature,
        max_tokens=max_tokens,
        stream=False,
        enable_thinking=enable_thinking,
        provider=provider,
    )

    url = f"{base_url}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=build_httpx_timeout(enable_thinking, stream=False)) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            body = response.json()
    except httpx.HTTPStatusError as exc:
        detail = "AI 服务暂时不可用"
        try:
            error_body = exc.response.json()
            detail = error_body.get("error", {}).get("message") or error_body.get("detail") or detail
        except Exception:
            pass
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail) from exc
    except httpx.RequestError as exc:
        logger.error("AI service connection failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI 服务连接失败，请检查 Base URL 或网络连接",
        ) from exc

    message_payload = (
        body.get("choices", [{}])[0]
        .get("message", {})
    )
    answer, reasoning = extract_text_parts(message_payload)
    answer, reasoning = normalize_answer_and_reasoning(answer, reasoning)
    if not answer and not reasoning:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI 服务返回了空结果",
        )

    return answer, reasoning


async def stream_openai_compatible_api(
    messages: list[dict],
    base_url: str,
    api_key: str,
    model_name: str,
    temperature: float = 0.7,
    max_tokens: int | None = None,
    enable_thinking: bool | None = None,
    provider: str | None = None,
) -> AsyncIterator[dict[str, Any]]:
    payload = build_chat_completion_payload(
        messages=messages,
        model_name=model_name,
        temperature=temperature,
        max_tokens=max_tokens,
        stream=True,
        enable_thinking=enable_thinking,
        provider=provider,
    )

    url = f"{base_url}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    explicit_reasoning_parts: list[str] = []
    accumulated_content = ""
    streamed_answer = ""
    streamed_tagged_reasoning = ""
    # Track whether we've ever seen a <think> tag to skip parsing entirely
    # for models that never use inline reasoning tags (the common case).
    might_have_think_tags = False
    # Buffer content near potential tag boundaries to avoid splitting mid-tag.
    _THINK_TAG_MAX_LEN = max(len(THINK_OPEN_TAG), len(THINK_CLOSE_TAG))

    try:
        async with httpx.AsyncClient(timeout=build_httpx_timeout(enable_thinking, stream=True)) as client:
            async with client.stream("POST", url, json=payload, headers=headers) as response:
                response.raise_for_status()

                async for raw_line in response.aiter_lines():
                    line = (raw_line or "").strip()
                    if not line or line.startswith(":") or not line.startswith("data:"):
                        continue

                    data = line[5:].strip()
                    if data == "[DONE]":
                        break

                    try:
                        body = json.loads(data)
                    except json.JSONDecodeError:
                        continue

                    choice = (body.get("choices") or [{}])[0]
                    delta = choice.get("delta") or choice.get("message") or {}
                    content_delta, reasoning_delta = extract_text_parts(delta)

                    if reasoning_delta:
                        explicit_reasoning_parts.append(reasoning_delta)
                        yield {
                            "type": "reasoning_delta",
                            "delta": reasoning_delta,
                        }

                    if content_delta:
                        accumulated_content += content_delta

                        # Fast path: if we've never seen any hint of <think> tags,
                        # just forward the delta directly without parsing.
                        if not might_have_think_tags:
                            lower_delta = content_delta.lower()
                            lower_acc = accumulated_content.lower()
                            # Check if this chunk or recent accumulated text
                            # contains a potential start of a think tag.
                            if THINK_OPEN_TAG[0] in lower_delta or THINK_OPEN_TAG in lower_acc:
                                might_have_think_tags = True
                            else:
                                # No think tags anywhere — emit content directly.
                                yield {
                                    "type": "content_delta",
                                    "delta": content_delta,
                                }
                                streamed_answer = accumulated_content
                                continue

                        # Slow path: think tags are present, do full parse.
                        # Only re-parse the full accumulated text (unavoidable
                        # when <think> tags can span across chunk boundaries).
                        next_answer, next_tagged_reasoning = split_tagged_reasoning_text(accumulated_content)

                        if next_tagged_reasoning.startswith(streamed_tagged_reasoning):
                            tagged_reasoning_delta = next_tagged_reasoning[len(streamed_tagged_reasoning):]
                        else:
                            tagged_reasoning_delta = next_tagged_reasoning
                        if tagged_reasoning_delta:
                            yield {
                                "type": "reasoning_delta",
                                "delta": tagged_reasoning_delta,
                            }
                        streamed_tagged_reasoning = next_tagged_reasoning

                        if next_answer.startswith(streamed_answer):
                            answer_delta = next_answer[len(streamed_answer):]
                        else:
                            answer_delta = next_answer
                        if answer_delta:
                            yield {
                                "type": "content_delta",
                                "delta": answer_delta,
                            }
                        streamed_answer = next_answer
    except httpx.HTTPStatusError as exc:
        detail = "AI 服务暂时不可用"
        try:
            error_body = exc.response.json()
            logger.error("AI service HTTPStatusError: %s", error_body)
            detail = error_body.get("error", {}).get("message") or error_body.get("detail") or detail
        except Exception:
            logger.error("AI service HTTPStatusError (non-json): %s", exc.response.text)
            pass
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail) from exc
    except httpx.RequestError as exc:
        logger.error("AI service connection failed during stream: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI 服务连接失败，请检查 Base URL 或网络连接",
        ) from exc

    answer = streamed_answer.strip()
    reasoning = merge_reasoning_text("".join(explicit_reasoning_parts), streamed_tagged_reasoning)
    
    if not answer and reasoning:
        answer = reasoning.strip()
        reasoning = ""

    if not answer and not reasoning:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI 服务返回了空结果",
        )

    yield {
        "type": "done",
        "answer": answer,
        "reasoning": reasoning,
    }


@router.get("/settings", response_model=schemas.AISettingsResponse)
async def get_ai_settings(
    current_user: models.User = Depends(get_current_user),
):
    """
    获取系统默认 AI 配置
    """
    return build_settings_response()


@router.post("/settings/test", response_model=schemas.AISettingsTestResponse)
async def test_ai_settings(
    payload: schemas.AISettingsTestRequest,
    current_user: models.User = Depends(get_current_user),
):
    """
    测试传入的 AI 连接配置
    """
    input_api_key = normalize_api_key(payload.api_key)
    api_key = input_api_key or OPENAI_API_KEY
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="系统尚未配置默认 API Key，请提供自定义 API Key",
        )

    if payload.provider == 'siliconflow':
        base_url = "https://api.siliconflow.cn/v1"
    elif payload.provider == 'deepseek':
        base_url = "https://api.deepseek.com"
    elif payload.provider == 'moonshot':
        base_url = "https://api.moonshot.cn/v1"
    else:
        base_url = normalize_base_url(payload.base_url, require_public_https=bool(payload.base_url)) or OPENAI_BASE_URL
    model_name = normalize_user_model(payload.model) or OPENAI_MODEL
    active_source = "custom" if input_api_key else "system"

    # For DeepSeek, explicitly disable thinking during test to avoid
    # all tokens going to reasoning_content with content left empty.
    test_enable_thinking = False if payload.provider == 'deepseek' else None

    await call_openai_compatible_api(
        messages=[{"role": "user", "content": "Hello"}],
        base_url=base_url,
        api_key=api_key,
        model_name=model_name,
        max_tokens=20,
        enable_thinking=test_enable_thinking,
        provider=payload.provider,
    )

    return {
        "success": True,
        "message": "连接测试成功，可以正常调用该模型",
        "active_model": model_name,
        "active_source": active_source,
    }


@router.post("/chat/stream")
async def stream_chat_with_ai(
    payload: schemas.AIChatRequest,
    current_user: models.User = Depends(get_current_user),
):
    """
    Berry 流式聊天接口
    """
    import json
    with open("/tmp/backend_payload.json", "w") as f:
        json.dump(payload.dict(), f, ensure_ascii=False)

    cleaned_messages = [
        {"role": message.role, "content": message.content}
        for message in payload.messages
        if message.role in {"system", "user", "assistant"}
    ]

    system_prompt = build_system_prompt(current_user, payload.context)
    context_message = build_context_message(payload.context)

    request_messages = [{"role": "system", "content": system_prompt}]
    if context_message:
        request_messages.append({"role": "system", "content": context_message})
    request_messages.extend(cleaned_messages)

    base_url, api_key, active_model = resolve_active_ai_config(payload.model, payload.custom_config)
    active_source = get_active_source(payload.custom_config)
    provider = payload.custom_config.provider if payload.custom_config else None
    enable_thinking = payload.enable_thinking
    if enable_thinking is None and active_source == "system":
        enable_thinking = OPENAI_ENABLE_THINKING

    async def event_stream():
        yield ndjson_line({
            "type": "start",
            "model": active_model,
            "provider": "openai-compatible",
            "active_source": active_source,
        })

        try:
            if payload.enable_web_search:
                search_query = build_web_search_query(cleaned_messages, payload.context)
                if search_query:
                    yield ndjson_line({
                        "type": "web_search_start",
                        "query": search_query,
                    })
                    try:
                        web_search_results = await perform_web_search(search_query, payload.web_search_freshness)
                        if web_search_results:
                            request_messages.insert(
                                -len(cleaned_messages) if cleaned_messages else len(request_messages),
                                {
                                    "role": "system",
                                    "content": build_web_search_context_message(search_query, web_search_results),
                                },
                            )
                        else:
                            request_messages.insert(
                                -len(cleaned_messages) if cleaned_messages else len(request_messages),
                                {
                                    "role": "system",
                                    "content": f"联网搜索已开启，但没有检索到与“{search_query}”直接相关的结果。请基于已有上下文谨慎回答。",
                                },
                            )

                        yield ndjson_line({
                            "type": "web_search_done",
                            "query": search_query,
                            "count": len(web_search_results),
                            "sources": [
                                {
                                    "title": item.get("title", ""),
                                    "url": item.get("url", ""),
                                }
                                for item in web_search_results[:8]
                            ],
                        })
                    except HTTPException as exc:
                        request_messages.insert(
                            -len(cleaned_messages) if cleaned_messages else len(request_messages),
                            {
                                "role": "system",
                                "content": f"联网搜索已开启，但搜索失败：{exc.detail}。请基于已有上下文回答，并说明未能完成联网检索。",
                            },
                        )
                        yield ndjson_line({
                            "type": "web_search_error",
                            "query": search_query,
                            "message": exc.detail,
                        })

            async for event in stream_openai_compatible_api(
                messages=request_messages,
                base_url=base_url,
                api_key=api_key,
                model_name=active_model,
                enable_thinking=enable_thinking,
                provider=provider,
            ):
                if event.get("type") == "done":
                    event["model"] = active_model
                    event["provider"] = "openai-compatible"
                    event["active_source"] = active_source
                yield ndjson_line(event)
        except HTTPException as exc:
            yield ndjson_line({
                "type": "error",
                "message": exc.detail,
                "model": active_model,
                "provider": "openai-compatible",
                "active_source": active_source,
            })
        except Exception as exc:
            logger.exception("Unexpected streaming AI error: %s", exc)
            yield ndjson_line({
                "type": "error",
                "message": "Berry 暂时没能回复成功，请稍后再试。",
                "model": active_model,
                "provider": "openai-compatible",
                "active_source": active_source,
            })

    return StreamingResponse(
        event_stream(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/chat", response_model=schemas.AIChatResponse)
async def chat_with_ai(
    payload: schemas.AIChatRequest,
    current_user: models.User = Depends(get_current_user),
):
    """
    Berry 聊天接口
    """
    cleaned_messages = [
        {"role": message.role, "content": message.content}
        for message in payload.messages
        if message.role in {"system", "user", "assistant"}
    ]

    system_prompt = build_system_prompt(current_user, payload.context)
    context_message = build_context_message(payload.context)
    web_search_message = await build_web_search_message_if_enabled(
        payload.enable_web_search,
        cleaned_messages,
        payload.web_search_freshness,
    )

    request_messages = [{"role": "system", "content": system_prompt}]
    if context_message:
        request_messages.append({"role": "system", "content": context_message})
    if web_search_message:
        request_messages.append({"role": "system", "content": web_search_message})
    request_messages.extend(cleaned_messages)

    base_url, api_key, active_model = resolve_active_ai_config(payload.model, payload.custom_config)
    active_source = get_active_source(payload.custom_config)
    provider = payload.custom_config.provider if payload.custom_config else None
    enable_thinking = payload.enable_thinking
    if enable_thinking is None and active_source == "system":
        enable_thinking = OPENAI_ENABLE_THINKING
    answer, reasoning = await call_openai_compatible_api(
        messages=request_messages,
        base_url=base_url,
        api_key=api_key,
        model_name=active_model,
        enable_thinking=enable_thinking,
        provider=provider,
    )

    return {
        "answer": answer,
        "model": active_model,
        "provider": "openai-compatible",
        "reasoning": reasoning,
        "active_source": active_source,
    }
