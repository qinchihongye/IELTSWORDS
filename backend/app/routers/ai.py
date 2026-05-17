"""
AI 助手相关 API
"""

import json
import re
from typing import Any, AsyncIterator
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config.settings import (
    AI_REQUEST_TIMEOUT_SECONDS,
    OPENAI_API_KEY,
    OPENAI_AVAILABLE_MODELS,
    OPENAI_BASE_URL,
    OPENAI_MODEL,
)
from ..database import get_db
from ..dependencies import get_current_user
from ..logging_config import get_logger
from ..secret_crypto import decrypt_secret, encrypt_secret

router = APIRouter()
MODEL_NAME_PATTERN = re.compile(r"^[A-Za-z0-9._:/-]+$")
REASONING_FIELD_KEYS = ("reasoning", "reasoning_content", "thinking", "reasoning_text")
REASONING_ITEM_TYPES = {"reasoning", "reasoning_content", "thinking", "reasoning_text"}
THINK_OPEN_TAG = "<think>"
THINK_CLOSE_TAG = "</think>"
logger = get_logger(__name__)


def build_system_prompt(current_user: models.User, context: dict | None) -> str:
    page = (context or {}).get("page") or "general"
    role = current_user.role or "user"

    lines = [
        "你是 IELTS 单词学习应用里的 AI 助手。",
        "你的主要任务是帮助用户理解单词、纠错、总结规律、制定复习建议。",
        "默认使用简洁自然的中文回答，必要时保留英文原词、词组、例句。",
        "优先结合页面上下文作答，但不要机械复述上下文字段。",
        "输出要实用、清晰，尽量分点，避免空泛鼓励。",
        "回答时优先使用清晰的 Markdown 结构，例如小标题、分点、编号、代码块。",
        "如果输出 Markdown，请严格保留必要的空格与换行，不要把多个标题、列表、代码块、引用或表格挤在同一行。",
        "如果给例句，优先使用如下结构：例句：... 换行 译文：...；必要时再补一行用法：...",
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


def normalize_base_url(base_url: str | None) -> str | None:
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


def get_active_source(current_user: models.User) -> str:
    custom_api_key = decrypt_secret(getattr(current_user, "ai_api_key_encrypted", None))
    return "custom" if custom_api_key else "system"


def get_available_models(current_user: models.User) -> list[str]:
    custom_api_key = decrypt_secret(getattr(current_user, "ai_api_key_encrypted", None))
    custom_model = normalize_user_model(getattr(current_user, "ai_model", None))

    if custom_api_key:
        return [custom_model or OPENAI_MODEL]

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
    return "".join(content_parts).strip(), "".join(reasoning_parts).strip()


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


def build_settings_response(current_user: models.User) -> dict:
    custom_api_key = decrypt_secret(getattr(current_user, "ai_api_key_encrypted", None))
    custom_base_url = normalize_base_url(getattr(current_user, "ai_base_url", None))
    custom_model = normalize_user_model(getattr(current_user, "ai_model", None))
    uses_custom_config = bool(custom_api_key)
    system_configured = bool(OPENAI_API_KEY)
    active_source = "custom" if uses_custom_config else "system"
    active_model = custom_model if uses_custom_config and custom_model else OPENAI_MODEL

    return {
        "custom_base_url": custom_base_url,
        "custom_model": custom_model,
        "has_api_key": bool(custom_api_key),
        "masked_api_key": mask_api_key(custom_api_key),
        "uses_custom_config": uses_custom_config,
        "system_configured": system_configured,
        "can_use_ai": uses_custom_config or system_configured,
        "active_source": active_source,
        "active_model": active_model,
        "available_models": get_available_models(current_user),
    }


def resolve_active_ai_config(current_user: models.User, requested_model: str | None = None) -> tuple[str, str, str]:
    custom_api_key = decrypt_secret(getattr(current_user, "ai_api_key_encrypted", None))
    requested_model_name = normalize_user_model(requested_model)

    if custom_api_key:
        base_url = normalize_base_url(getattr(current_user, "ai_base_url", None)) or OPENAI_BASE_URL
        model_name = requested_model_name or normalize_user_model(getattr(current_user, "ai_model", None)) or OPENAI_MODEL
        return base_url, custom_api_key, model_name

    if not OPENAI_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI 助手尚未配置系统默认密钥，也未设置你的自定义 API Key",
        )

    return OPENAI_BASE_URL, OPENAI_API_KEY, requested_model_name or OPENAI_MODEL


async def call_openai_compatible_api(
    messages: list[dict],
    base_url: str,
    api_key: str,
    model_name: str,
    temperature: float = 0.7,
    max_tokens: int | None = None,
) -> tuple[str, str]:
    payload = {
        "model": model_name,
        "messages": messages,
        "temperature": temperature,
    }
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens

    url = f"{base_url}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT_SECONDS) as client:
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
    if not answer:
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
) -> AsyncIterator[dict[str, Any]]:
    payload = {
        "model": model_name,
        "messages": messages,
        "temperature": temperature,
        "stream": True,
    }
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens

    url = f"{base_url}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    explicit_reasoning_parts: list[str] = []
    raw_content_parts: list[str] = []
    streamed_answer = ""
    streamed_tagged_reasoning = ""

    try:
        async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT_SECONDS) as client:
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
                        raw_content_parts.append(content_delta)
                        next_answer, next_tagged_reasoning = split_tagged_reasoning_text("".join(raw_content_parts))

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
            detail = error_body.get("error", {}).get("message") or error_body.get("detail") or detail
        except Exception:
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
    if not answer:
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
    获取当前用户的 AI 配置
    """
    return build_settings_response(current_user)


@router.patch("/settings", response_model=schemas.AISettingsResponse)
async def update_ai_settings(
    payload: schemas.AISettingsUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    更新当前用户的 AI 配置
    """
    provided_fields = payload.model_fields_set
    current_api_key = decrypt_secret(getattr(current_user, "ai_api_key_encrypted", None))

    next_base_url = (
        normalize_base_url(payload.base_url)
        if "base_url" in provided_fields
        else normalize_base_url(getattr(current_user, "ai_base_url", None))
    )
    next_model = (
        normalize_user_model(payload.model)
        if "model" in provided_fields
        else normalize_user_model(getattr(current_user, "ai_model", None))
    )
    next_api_key = (
        normalize_api_key(payload.api_key)
        if "api_key" in provided_fields
        else current_api_key
    )

    if not next_api_key and (next_base_url or next_model):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="首次启用自定义 AI 配置时，需要填写 API Key",
        )

    current_user.ai_base_url = next_base_url
    current_user.ai_model = next_model
    if "api_key" in provided_fields and next_api_key:
        current_user.ai_api_key_encrypted = encrypt_secret(next_api_key)

    db.commit()
    db.refresh(current_user)
    return build_settings_response(current_user)


@router.delete("/settings", response_model=schemas.AISettingsResponse)
async def reset_ai_settings(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    恢复系统默认 AI 配置
    """
    current_user.ai_base_url = None
    current_user.ai_model = None
    current_user.ai_api_key_encrypted = None
    db.commit()
    db.refresh(current_user)
    return build_settings_response(current_user)


@router.post("/settings/test", response_model=schemas.AISettingsTestResponse)
async def test_ai_settings(
    payload: schemas.AISettingsTestRequest,
    current_user: models.User = Depends(get_current_user),
):
    """
    测试当前用户填写的 AI 连接配置
    """
    saved_api_key = decrypt_secret(getattr(current_user, "ai_api_key_encrypted", None))
    input_api_key = normalize_api_key(payload.api_key)
    api_key = input_api_key or saved_api_key or OPENAI_API_KEY
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="当前既没有系统默认 API Key，也没有可用的自定义 API Key",
        )

    base_url = (
        normalize_base_url(payload.base_url)
        or normalize_base_url(getattr(current_user, "ai_base_url", None))
        or OPENAI_BASE_URL
    )
    model_name = (
        normalize_user_model(payload.model)
        or normalize_user_model(getattr(current_user, "ai_model", None))
        or OPENAI_MODEL
    )

    await call_openai_compatible_api(
        messages=[{"role": "user", "content": "Reply with OK only."}],
        base_url=base_url,
        api_key=api_key,
        model_name=model_name,
        temperature=0,
        max_tokens=8,
    )

    active_source = "custom" if (input_api_key or saved_api_key) else "system"

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
    AI 助手流式聊天接口
    """
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

    base_url, api_key, active_model = resolve_active_ai_config(current_user, payload.model)
    active_source = get_active_source(current_user)

    async def event_stream():
        yield ndjson_line({
            "type": "start",
            "model": active_model,
            "provider": "openai-compatible",
            "active_source": active_source,
        })

        try:
            async for event in stream_openai_compatible_api(
                messages=request_messages,
                base_url=base_url,
                api_key=api_key,
                model_name=active_model,
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
                "message": "AI 助手暂时没能回复成功，请稍后再试。",
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
    AI 助手聊天接口
    """
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

    base_url, api_key, active_model = resolve_active_ai_config(current_user, payload.model)
    answer, reasoning = await call_openai_compatible_api(
        messages=request_messages,
        base_url=base_url,
        api_key=api_key,
        model_name=active_model,
    )

    return {
        "answer": answer,
        "model": active_model,
        "provider": "openai-compatible",
        "reasoning": reasoning,
        "active_source": get_active_source(current_user),
    }
