import httpx
import json
import time
import sys

API_BASE = "http://127.0.0.1:8000"

r = httpx.post(f"{API_BASE}/auth/login", json={"email": "test@example.com", "password": "Test1234"})
token = r.json()["accessToken"]
headers = {"Authorization": f"Bearer {token}"}

payload = {
    "business_name": "SmartHealth",
    "business_description": "智能健康监测平台开发与运营",
    "industry": "医疗科技",
    "stage": "growth"
}

print("Testing diagnosis endpoint...")
start = time.time()
r = httpx.post(f"{API_BASE}/diagnosis", json=payload, headers=headers, timeout=90.0)
elapsed = time.time() - start
print(f"Response time: {elapsed:.1f}s, Status: {r.status_code}")

if r.status_code == 200:
    data = r.json()
    print(f"Job status: {data['status']}")
    if data.get("result"):
        print(f"Provider: {data['result'].get('provider')}")
        print(f"Mode: {data['result'].get('mode')}")
        summary = data["result"].get("normalizedPayload", {}).get("summary", "")
        print(f"Summary: {summary[:200]}")
    else:
        print(f"Error: {data.get('errorMessage')}")
else:
    print(f"Error: {r.text}")
