import httpx

r = httpx.post("http://127.0.0.1:8000/auth/login", json={"email": "test@example.com", "password": "Test1234"})
token = r.json()["accessToken"]
headers = {"Authorization": f"Bearer {token}"}

r2 = httpx.get("http://127.0.0.1:8000/assets", headers=headers)
assets = r2.json()
print(f"Assets before: {len(assets)}")

if assets:
    asset_id = assets[0]["id"]
    print(f"Deleting: {asset_id}")
    r3 = httpx.delete(f"http://127.0.0.1:8000/assets/{asset_id}", headers=headers)
    print(f"Delete status: {r3.status_code}, {r3.text}")

    r4 = httpx.get("http://127.0.0.1:8000/assets", headers=headers)
    print(f"Assets after: {len(r4.json())}")
else:
    print("No assets to delete")
