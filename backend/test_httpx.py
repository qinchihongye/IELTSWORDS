import asyncio
import httpx
from urllib.parse import urlparse

async def test():
    url = "https://api.siliconflow.cn/v1/chat/completions"
    headers = {
        "Authorization": "Bearer sk-msoqbyysgzsrfupwkexkysxhgemuokwstbwjfxylgdmmiacl",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "deepseek-ai/DeepSeek-V4-Flash",
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
