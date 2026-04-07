import httpx
import json
import time

url = "https://api.lkeap.cloud.tencent.com/coding/v3/chat/completions"
headers = {
    "Authorization": "Bearer sk-sp-LqBjLRyxbLtqylPJwP3pswgVfjNRoo2O7p3vedSVHPI2v46N",
    "Content-Type": "application/json"
}
system_prompt = "你是A1+ IP顾问。根据用户业务描述输出JSON：{\"summary\":\"一段话\",\"priority_assets\":[\"资产列表\"],\"risks\":[\"风险\"],\"next_actions\":[\"行动\"],\"recommended_track\":\"trademark copyright patent\",\"recommended_trademark_categories\":[\"35\",\"42\"]}。商标：9=科技,35=商业,41=教育,42=软件,43=餐饮,44=医疗。"
user_prompt = "公司：SmartHealth，业务：智能健康监测平台，行业：医疗科技，阶段：growth。输出JSON。"
payload = {
    "model": "glm-5",
    "messages": [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ],
    "temperature": 0.3,
    "max_tokens": 1024
}

start = time.time()
with httpx.Client(timeout=httpx.Timeout(60.0)) as client:
    r = client.post(url, headers=headers, json=payload)
elapsed = time.time() - start
print(f"Time: {elapsed*1000:.0f}ms, Status: {r.status_code}")

if r.status_code == 200:
    data = r.json()
    content = data["choices"][0]["message"].get("content", "")
    print(f"\nRaw content (first 1000 chars):\n{content[:1000]}")
    print(f"\nContent repr: {repr(content[:200])}")

    # Test extraction
    text = content.strip()
    print(f"\nStarts with ```: {text.startswith('```')}")
    if text.startswith("```"):
        lines = text.split("\n")
        print(f"Lines: {lines[:5]}")
        lines = [l for l in lines if not l.strip().startswith("```")]
        print(f"Filtered lines: {lines[:5]}")
        text = "\n".join(lines).strip()
        print(f"After filter: {text[:100]}")
    start_i = text.find("{")
    end_i = text.rfind("}")
    print(f"Start brace at: {start_i}, End brace at: {end_i}")
    if start_i != -1 and end_i != -1:
        try:
            parsed = json.loads(text[start_i:end_i+1])
            print("JSON parse: SUCCESS")
            print(json.dumps(parsed, ensure_ascii=False, indent=2))
        except Exception as e:
            print(f"JSON parse: FAILED - {type(e).__name__}: {e}")
    else:
        print("JSON: FAILED - no braces found")
