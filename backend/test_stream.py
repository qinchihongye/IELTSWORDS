import asyncio
import httpx
import time

async def test():
    url = "https://api.siliconflow.cn/v1/chat/completions"
    headers = {
        "Authorization": "Bearer sk-msoqbyysgzsrfupwkexkysxhgemuokwstbwjfxylgdmmiacl",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "deepseek-ai/DeepSeek-V4-Flash",
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
