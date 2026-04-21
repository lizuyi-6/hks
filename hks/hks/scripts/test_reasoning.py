import httpx
import json
iabout:blank#blockedmport time

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
    msg = data["choices"][0]["message"]
    print(f"Message keys: {list(msg.keys())}")
    print(f"Content: {repr(msg.get('content', ''))}")
    print(f"Reasoning: {str(msg.get('reasoning_content', ''))[:200]}")
    print(f"Finish reason: {data['choices'][0].get('finish_reason')}")
