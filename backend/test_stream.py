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
        "messages": [{"role": "user", "content": "你好"}],
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
