import httpx
import json
import time

url = "https://api.lkeap.cloud.tencent.com/coding/v3/chat/completions"
headers = {
    "Authorization": "Bearer sk-sp-LqBjLRyxbLtqylPJwP3pswgVfjNRoo2O7p3vedSVHPI2v46N",
    "Content-Type": "application/json"
}
system_prompt = "你是A1+ IP顾问。根据用户业务描述输出JSON：{\"summary\":\"一段话\",\"priority_assets\":[\"资产列表\"],\"risks\":[\"风险\"],\"next_actions\":[\"行动\"],\"recommended_track\":\"trademark copyright patent\",\"recommended_trademark_categories\":[\"35\",\"42\"]}。商标：9=科技,35=商业,41=教育,42=软件,43=餐饮,44=医疗。"
user_prompt = "公司：TestAI，业务：人工智能软件开发，行业：科技，阶段：startup。输出JSON。"
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
    print(f"Content: {content[:500]}")
    text = content.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.startswith("```")]
        text = "\n".join(lines).strip()
    start_i = text.find("{")
    end_i = text.rfind("}")
    if start_i != -1 and end_i != -1:
        try:
            parsed = json.loads(text[start_i:end_i+1])
            print("JSON parse: SUCCESS")
            print(json.dumps(parsed, ensure_ascii=False, indent=2))
        except Exception as e:
            print(f"JSON parse: FAILED - {e}")
    else:
        print("JSON: FAILED - no braces found")
