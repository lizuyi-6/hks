"""A1+ IP Coworker CLI (agent-oriented) — python -m apps.cli

Usage:
  # Chat via SSE → collects full response, outputs JSON
  echo "我想注册商标云梦" | python -m apps.cli chat
  python -m apps.cli chat --message "我想注册商标云梦"

  # Direct actions (skip LLM, call service directly)
  python -m apps.cli trademark-check --name "云梦" --categories '["42"]'
  python -m apps.cli diagnose --description "做软件的"
  python -m apps.cli list-assets
  python -m apps.cli generate-application --name "云梦" --applicant "张三" --categories '["42"]' --risk-level yellow
  python -m apps.cli contract-review --text "合同内容..."
  python -m apps.cli patent-assess --description "技术方案..."
  python -m apps.cli policy-digest --industry "软件"

  # Auth
  python -m apps.cli login --email user@example.com --password xxx

All output is JSON to stdout. Errors go to stderr as JSON.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys

import httpx

API_BASE = os.getenv("A1PLUS_API_URL", "http://localhost:8000")


def _json_out(data: object) -> None:
    json.dump(data, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


def _json_err(code: str, message: str) -> None:
    json.dump({"error": True, "code": code, "message": message}, sys.stderr, ensure_ascii=False, indent=2)
    sys.stderr.write("\n")
    sys.exit(1)


def _make_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ─── Auth ────────────────────────────────────────────────────────────────────


def cmd_login(args: argparse.Namespace) -> None:
    with httpx.Client(timeout=10) as client:
        resp = client.post(
            f"{args.api_url}/auth/login",
            json={"email": args.email, "password": args.password},
        )
    if resp.status_code != 200:
        _json_err("AUTH_FAILED", resp.text)
    data = resp.json()
    _json_out({"accessToken": data.get("accessToken") or data.get("access_token")})


# ─── Chat (SSE → JSON) ──────────────────────────────────────────────────────


def cmd_chat(args: argparse.Namespace) -> None:
    message = args.message
    if not message:
        if not sys.stdin.isatty():
            message = sys.stdin.read().strip()
    if not message:
        _json_err("MISSING_INPUT", "No message provided via --message or stdin")

    history = []
    if args.history:
        try:
            history = json.loads(args.history)
        except json.JSONDecodeError:
            _json_err("INVALID_HISTORY", "--history must be a JSON array")

    headers = _make_headers(args.token)
    body = {
        "message": message,
        "history": history,
        "context": json.loads(args.context) if args.context else {},
        "sessionId": args.session or "cli-agent",
    }

    result = asyncio.run(_collect_sse(args.api_url, headers, body))
    _json_out(result)


async def _collect_sse(api_url: str, headers: dict, body: dict) -> dict:
    accumulated_text = ""
    actions: list[dict] = []
    follow_ups: list[str] = []
    disclaimer = ""
    meta: dict = {}

    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
        async with client.stream("POST", f"{api_url}/chat/stream", headers=headers, json=body) as resp:
            if resp.status_code == 401:
                return {"error": True, "code": "UNAUTHORIZED", "message": "Token expired or invalid"}
            resp.raise_for_status()

            pending_event_type: str | None = None
            async for line in resp.aiter_lines():
                line = line.strip()
                if not line:
                    pending_event_type = None
                    continue
                if line.startswith("event: "):
                    pending_event_type = line[7:].strip()
                    continue
                if line.startswith("data: ") and pending_event_type:
                    try:
                        data = json.loads(line[6:])
                    except json.JSONDecodeError:
                        data = {}
                    etype = pending_event_type
                    pending_event_type = None

                    if etype == "meta":
                        meta = data
                    elif etype == "token":
                        accumulated_text += data.get("content", "")
                    elif etype == "action_start":
                        actions.append({"phase": "start", **data})
                    elif etype == "action_result":
                        actions.append({"phase": "result", **data})
                    elif etype == "done":
                        follow_ups = data.get("followUp", [])
                        disclaimer = data.get("disclaimer", "")
                    elif etype == "error":
                        actions.append({"phase": "error", **data})

    return {
        "reply": accumulated_text,
        "actions": actions,
        "followUps": follow_ups,
        "disclaimer": disclaimer,
        "meta": meta,
    }


# ─── Direct actions ──────────────────────────────────────────────────────────


def cmd_trademark_check(args: argparse.Namespace) -> None:
    categories = json.loads(args.categories) if args.categories else ["35"]
    headers = _make_headers(args.token)
    with httpx.Client(timeout=30) as client:
        resp = client.post(
            f"{args.api_url}/trademarks/check",
            headers=headers,
            json={
                "trademarkName": args.name,
                "businessDescription": args.description or "",
                "applicantName": args.applicant or "",
                "applicantType": args.applicant_type or "company",
                "categories": categories,
            },
        )
    _handle_response(resp)


def cmd_diagnose(args: argparse.Namespace) -> None:
    headers = _make_headers(args.token)
    with httpx.Client(timeout=60) as client:
        resp = client.post(
            f"{args.api_url}/diagnosis",
            headers=headers,
            json={
                "businessDescription": args.description,
                "businessName": args.business_name or None,
                "industry": args.industry or None,
                "stage": args.stage or None,
            },
        )
    _handle_response(resp)


def cmd_list_assets(args: argparse.Namespace) -> None:
    headers = _make_headers(args.token)
    with httpx.Client(timeout=15) as client:
        resp = client.get(f"{args.api_url}/assets", headers=headers)
    _handle_response(resp)


def cmd_generate_application(args: argparse.Namespace) -> None:
    categories = json.loads(args.categories) if args.categories else ["35"]
    headers = _make_headers(args.token)
    with httpx.Client(timeout=60) as client:
        resp = client.post(
            f"{args.api_url}/trademarks/application/jobs",
            headers=headers,
            json={
                "trademarkName": args.name,
                "applicantName": args.applicant or "",
                "businessDescription": args.description or "",
                "categories": categories,
                "riskLevel": args.risk_level or "yellow",
            },
        )
    _handle_response(resp)


def cmd_contract_review(args: argparse.Namespace) -> None:
    text = args.text
    if not text and not sys.stdin.isatty():
        text = sys.stdin.read().strip()
    if not text:
        _json_err("MISSING_INPUT", "No contract text via --text or stdin")

    headers = _make_headers(args.token)
    with httpx.Client(timeout=60) as client:
        resp = client.post(
            f"{args.api_url}/stream/contracts/review",
            headers=headers,
            json={"contract_text": text},
        )
    _handle_response(resp)


def cmd_patent_assess(args: argparse.Namespace) -> None:
    headers = _make_headers(args.token)
    with httpx.Client(timeout=60) as client:
        resp = client.post(
            f"{args.api_url}/stream/patents/assess",
            headers=headers,
            json={"description": args.description},
        )
    _handle_response(resp)


def cmd_policy_digest(args: argparse.Namespace) -> None:
    headers = _make_headers(args.token)
    with httpx.Client(timeout=60) as client:
        resp = client.post(
            f"{args.api_url}/stream/policies/digest",
            headers=headers,
            json={"industry": args.industry},
        )
    _handle_response(resp)


def _handle_response(resp: httpx.Response) -> None:
    if resp.status_code >= 400:
        try:
            body = resp.json()
        except Exception:
            body = {"detail": resp.text}
        _json_err(f"HTTP_{resp.status_code}", body.get("detail", str(body)))
    _json_out(resp.json())


# ─── Argparse ────────────────────────────────────────────────────────────────


def _add_common_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--api-url", default=API_BASE)
    p.add_argument("--token", required=True, help="JWT token (or set A1PLUS_TOKEN env)")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="A1+ IP Coworker CLI (agent-oriented)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # login
    p_login = sub.add_parser("login", help="Authenticate and get token")
    p_login.add_argument("--api-url", default=API_BASE)
    p_login.add_argument("--email", required=True)
    p_login.add_argument("--password", required=True)

    # chat
    p_chat = sub.add_parser("chat", help="Chat with AI coworker (SSE → JSON)")
    _add_common_args(p_chat)
    p_chat.add_argument("--message", "-m", help="Message (or read from stdin)")
    p_chat.add_argument("--history", help='JSON array of {"role","content"}')
    p_chat.add_argument("--context", help="JSON dict of session context")
    p_chat.add_argument("--session", help="Session ID")

    # trademark-check
    p_tc = sub.add_parser("trademark-check", help="Check trademark similarity")
    _add_common_args(p_tc)
    p_tc.add_argument("--name", required=True)
    p_tc.add_argument("--description", default="")
    p_tc.add_argument("--applicant", default="")
    p_tc.add_argument("--applicant-type", default="company")
    p_tc.add_argument("--categories", help='JSON array, e.g. \'["42"]\'')

    # diagnose
    p_diag = sub.add_parser("diagnose", help="IP diagnosis")
    _add_common_args(p_diag)
    p_diag.add_argument("--description", "-d", required=True)
    p_diag.add_argument("--business-name")
    p_diag.add_argument("--industry")
    p_diag.add_argument("--stage")

    # list-assets
    p_la = sub.add_parser("list-assets", help="List IP assets")
    _add_common_args(p_la)

    # generate-application
    p_ga = sub.add_parser("generate-application", help="Generate trademark application")
    _add_common_args(p_ga)
    p_ga.add_argument("--name", required=True)
    p_ga.add_argument("--applicant", default="")
    p_ga.add_argument("--description", default="")
    p_ga.add_argument("--categories", help='JSON array')
    p_ga.add_argument("--risk-level", default="yellow")

    # contract-review
    p_cr = sub.add_parser("contract-review", help="Review contract IP clauses")
    _add_common_args(p_cr)
    p_cr.add_argument("--text", help="Contract text (or read from stdin)")

    # patent-assess
    p_pa = sub.add_parser("patent-assess", help="Assess patent feasibility")
    _add_common_args(p_pa)
    p_pa.add_argument("--description", "-d", required=True)

    # policy-digest
    p_pd = sub.add_parser("policy-digest", help="Get industry IP policy digest")
    _add_common_args(p_pd)
    p_pd.add_argument("--industry", "-i", required=True)

    args = parser.parse_args()

    # Fallback: read token from env if --token not set and command != login
    if args.command != "login" and args.token is None:
        args.token = os.getenv("A1PLUS_TOKEN")

    dispatch = {
        "login": cmd_login,
        "chat": cmd_chat,
        "trademark-check": cmd_trademark_check,
        "diagnose": cmd_diagnose,
        "list-assets": cmd_list_assets,
        "generate-application": cmd_generate_application,
        "contract-review": cmd_contract_review,
        "patent-assess": cmd_patent_assess,
        "policy-digest": cmd_policy_digest,
    }
    dispatch[args.command](args)


if __name__ == "__main__":
    main()
