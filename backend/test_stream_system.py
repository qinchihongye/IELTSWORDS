import asyncio
import os
import httpx
import time

async def test():
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("请先设置 OPENAI_API_KEY 环境变量")

    base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    url = f"{base_url}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "你是 IELTS 单词学习应用里的 AI 助手。你的主要任务是帮助用户理解单词、纠错、总结规律、制定复习建议。默认使用简洁自然的中文回答，必要时保留英文原词、词组、例句。优先结合页面上下文作答，但不要机械复述上下文字段。输出要实用、清晰，尽量分点，避免空泛鼓励。回答时优先使用清晰的 Markdown 结构，例如小标题、分点、编号、代码块。如果输出 Markdown，请严格保留必要的空格与换行，不要把多个标题、列表、代码块、引用或表格挤在同一行。小标题请单独占一行，例如：## 记忆技巧。强调单词、词组、词根、词缀时，优先使用反引号，例如 `atmosphere`、`atmo`、`sphere`，不要输出不成对的 * 或 **。除非明确要做引用说明，不要把普通正文写成 > 引用块。如果给例句，优先使用如下结构：例句：... 换行 译文：...；必要时再补一行用法：... 当前用户角色: user 当前页面类型: general"},
            {"role": "user", "content": "你好"}
        ],
        "temperature": 0.7,
        "stream": True
    }
    
    start_time = time.time()
    last_time = start_time
    
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            async with client.stream("POST", url, json=payload, headers=headers) as response:
                print(f"Connected in {time.time() - start_time:.2f}s")
                async for line in response.aiter_lines():
                    if not line.strip(): continue
                    now = time.time()
                    print(f"[{now - last_time:.2f}s] {line}")
                    last_time = now
    except Exception as e:
        print(f"Error: {e}")

asyncio.run(test())
