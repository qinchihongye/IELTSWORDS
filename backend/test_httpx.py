import asyncio
import os
import httpx

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
        "messages": [{"role": "user", "content": "Reply with OK only."}],
        "temperature": 0,
        "max_tokens": 8
    }
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            print("Sending request...")
            response = await client.post(url, json=payload, headers=headers)
            print(f"Status code: {response.status_code}")
            print(response.json())
    except Exception as e:
        print(f"Exception: {type(e).__name__}: {e}")

asyncio.run(test())
