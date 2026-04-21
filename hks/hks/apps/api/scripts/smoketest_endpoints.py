"""
Smoke test the 7 endpoints added by the backend-missing-endpoints plan.

Usage (from repo root):
    python -m apps.api.scripts.smoketest_endpoints [--base URL]

Relies on the demo user seeded by `seed_demo.py`.
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request


DEFAULT_BASE = "http://127.0.0.1:8000"
DEMO_EMAIL = "demo@a1plus.local"
DEMO_PASSWORD = "demo1234"


def _req(method: str, url: str, *, token: str | None = None, body: dict | None = None) -> tuple[int, str]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Accept", "application/json")
    if body is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default=DEFAULT_BASE)
    args = parser.parse_args()
    base = args.base.rstrip("/")

    print(f"[·] Logging in as {DEMO_EMAIL} …")
    status, body = _req("POST", f"{base}/auth/login", body={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    if status != 200:
        print(f"[!] login failed status={status} body={body[:300]}")
        return 2
    token = json.loads(body).get("accessToken") or json.loads(body).get("access_token")
    if not token:
        print(f"[!] no access token in response: {body[:300]}")
        return 2
    print(f"[+] got token len={len(token)}")

    created_item_id: str | None = None

    checks: list[tuple[str, str, dict | None]] = [
        ("GET", "/monitoring/trend?weeks=12", None),
        ("GET", "/monitoring/watchlist", None),
        ("POST", "/monitoring/watchlist", {"keyword": "smoketest-keyword", "type": "keyword", "frequency": "daily"}),
        # DELETE is injected below once we know the created id
        ("GET", "/assets/expiry-forecast?months=12", None),
        ("GET", "/profile/activity", None),
        ("GET", "/notifications/recent-approvals", None),
    ]

    failures = 0
    for method, path, payload in checks:
        status, body = _req(method, f"{base}{path}", token=token, body=payload)
        ok = 200 <= status < 300
        head = body[:140].replace("\n", " ")
        print(f"[{'+' if ok else '!'}] {method:6s} {path:40s} -> {status}  {head}")
        if not ok:
            failures += 1
        if method == "POST" and path == "/monitoring/watchlist" and ok:
            try:
                created_item_id = json.loads(body).get("id")
            except Exception:
                pass

    if created_item_id:
        path = f"/monitoring/watchlist/{created_item_id}"
        status, body = _req("DELETE", f"{base}{path}", token=token)
        ok = 200 <= status < 300
        head = body[:140].replace("\n", " ") if body else ""
        print(f"[{'+' if ok else '!'}] DELETE {path:40s} -> {status}  {head}")
        if not ok:
            failures += 1

    print()
    print("=" * 60)
    if failures == 0:
        print("ALL ENDPOINTS OK")
    else:
        print(f"{failures} FAILURES")
    print("=" * 60)
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
